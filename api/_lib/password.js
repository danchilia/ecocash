// filepath: api/_lib/password.js
// Admin password handling. Mirrors the storage strategy in store.js
// but without depending on @vercel/kv — we call the Upstash REST API
// directly via fetch. The ADMIN_PASSWORD env var is the bootstrap
// fallback when no hash is stored yet.

import crypto from "node:crypto";

const IS_VERCEL = process.env.VERCEL === "1";
const HAS_KV = !!(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
);
const STORE_DRIVER =
  process.env.MIXX_STORE ||
  (HAS_KV ? "kv" : IS_VERCEL ? "memory" : "file");

const KV_HASH_KEY = "admin:hash";
const KV_META_KEY = "admin:meta";

// --- env-var bootstrap ------------------------------------------------
const ENV_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// --- in-memory fallback ----------------------------------------------
const memAdmin = { hash: null, updatedAt: null };

// --- lazy imports for the file driver (local dev only) ---------------
let fsLib = null;
let pathLib = null;
async function getFs() {
  if (fsLib && pathLib) return { fs: fsLib, path: pathLib };
  if (STORE_DRIVER !== "file") return null;
  try {
    fsLib = (await import("node:fs")).promises;
    pathLib = await import("node:path");
    return { fs: fsLib, path: pathLib };
  } catch (err) {
    console.warn("[password] fs unavailable:", err?.message);
    return null;
  }
}

function adminPath(path) {
  return path.join(process.cwd(), ".data", "admin.json");
}

// --- hashing ----------------------------------------------------------
// PBKDF2-HMAC-SHA256, 120k iterations, 32-byte key.
const ITERATIONS = 120_000;
const KEYLEN = 32;
const SALT_LEN = 16;

export function hashPassword(plain) {
  if (typeof plain !== "string" || plain.length === 0) return null;
  const salt = crypto.randomBytes(SALT_LEN);
  const hash = crypto.pbkdf2Sync(plain, salt, ITERATIONS, KEYLEN, "sha256");
  return `pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${hash.toString(
    "base64"
  )}`;
}

function verifyHash(plain, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iters = parseInt(parts[1], 10);
  if (!Number.isFinite(iters) || iters < 1000) return false;
  const salt = Buffer.from(parts[2], "base64");
  const expected = Buffer.from(parts[3], "base64");
  const actual = crypto.pbkdf2Sync(
    plain,
    salt,
    iters,
    expected.length,
    "sha256"
  );
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function constantTimeStringEqual(a, b) {
  const A = Buffer.from(String(a), "utf8");
  const B = Buffer.from(String(b), "utf8");
  if (A.length !== B.length) {
    const pad = Buffer.alloc(Math.max(A.length, B.length));
    crypto.timingSafeEqual(pad, pad);
    return false;
  }
  return crypto.timingSafeEqual(A, B);
}

// --- Upstash REST helpers --------------------------------------------
async function kvExec(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `Upstash REST ${resp.status} ${resp.statusText}: ${text.slice(0, 200)}`
    );
  }
  const data = await resp.json();
  if (data && data.error) throw new Error(`Upstash error: ${data.error}`);
  return data;
}

async function kvGet(key) {
  const data = await kvExec(["GET", key]);
  return data?.result ?? null;
}

async function kvSet(key, value) {
  await kvExec(["SET", key, String(value)]);
}

// --- internal read/write per driver ----------------------------------
async function readAdminRecord() {
  if (STORE_DRIVER === "memory") return memAdmin;
  if (STORE_DRIVER === "kv") {
    try {
      const hash = await kvGet(KV_HASH_KEY);
      if (!hash) return memAdmin;
      const updatedAt = (await kvGet(KV_META_KEY)) || null;
      return { hash, updatedAt };
    } catch (err) {
      console.error("[password] readAdminRecord KV failed:", err);
      return memAdmin;
    }
  }
  // file
  const libs = await getFs();
  if (!libs) return memAdmin;
  const file = adminPath(libs.path);
  try {
    const raw = await libs.fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    console.error("[password] readAdminRecord failed:", err);
    return memAdmin;
  }
}

async function writeAdminRecord(record) {
  if (STORE_DRIVER === "memory") {
    memAdmin.hash = record.hash;
    memAdmin.updatedAt = record.updatedAt;
    return;
  }
  if (STORE_DRIVER === "kv") {
    await kvSet(KV_HASH_KEY, record.hash);
    await kvSet(KV_META_KEY, record.updatedAt);
    return;
  }
  // file
  const libs = await getFs();
  if (!libs) {
    memAdmin.hash = record.hash;
    memAdmin.updatedAt = record.updatedAt;
    return;
  }
  const file = adminPath(libs.path);
  try {
    await libs.fs.mkdir(libs.path.join(process.cwd(), ".data"), {
      recursive: true,
    });
    await libs.fs.writeFile(file, JSON.stringify(record, null, 2), "utf8");
  } catch (err) {
    console.warn(
      "[password] writeAdminRecord fell back to memory:",
      err?.code || err?.message
    );
    memAdmin.hash = record.hash;
    memAdmin.updatedAt = record.updatedAt;
  }
}

// --- public API -------------------------------------------------------

export function checkPassword(plain) {
  if (typeof plain !== "string" || plain.length === 0) return false;
  return (
    verifyHash(plain, memAdmin.hash) ||
    constantTimeStringEqual(plain, ENV_PASSWORD)
  );
}

export async function checkPasswordAsync(plain) {
  if (typeof plain !== "string" || plain.length === 0) return false;
  try {
    const stored = await readAdminRecord();
    if (stored && stored.hash) return verifyHash(plain, stored.hash);
  } catch (err) {
    console.error("[password] checkPasswordAsync read failed:", err);
  }
  if (memAdmin.hash) return verifyHash(plain, memAdmin.hash);
  return constantTimeStringEqual(plain, ENV_PASSWORD);
}

export async function setPassword(plain) {
  if (typeof plain !== "string") return null;
  if (plain.length < 6)
    return { ok: false, error: "Password must be at least 6 characters." };
  if (plain.length > 128) return { ok: false, error: "Password too long." };
  const hash = hashPassword(plain);
  if (!hash) return null;
  const record = { hash, updatedAt: new Date().toISOString() };
  await writeAdminRecord(record);
  return { ok: true, updatedAt: record.updatedAt };
}

export async function getPasswordMeta() {
  try {
    const stored = await readAdminRecord();
    if (!stored) return null;
    return { updatedAt: stored.updatedAt || null };
  } catch {
    return null;
  }
}
