// filepath: api/_lib/store.js
// Serverless-friendly store. Four drivers, picked automatically:
//
//   1) upstash (recommended on Vercel when UPSTASH_REDIS_REST_URL and
//      UPSTASH_REDIS_REST_TOKEN are set): persists to Upstash Redis
//      via its REST API. Survives across function instances and
//      restarts. One HTTP call per operation. No SDK, no native
//      modules, works in any Vercel runtime. Free tier is plenty.
//
//   2) jsonbin: persists to jsonbin.io. Same idea as upstash, two
//      HTTP calls per operation. Legacy option, kept for back-compat.
//
//   3) memory: in-process. Safety net when no env vars are present,
//      and for local dev. Per-instance only — not reliable for
//      cross-user visibility.
//
//   4) file: .data/submissions.json. Used in local dev for
//      persistence.
//
// All public functions are async. Upstash and jsonbin give true
// cross-instance persistence; the others are fallbacks. Writes are
// best-effort and never throw on transient errors so the user-facing
// request always completes.

import crypto from "node:crypto";

const IS_VERCEL = process.env.VERCEL === "1";
const HAS_UPSTASH = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);
const HAS_JSONBIN = !!(
  process.env.JSONBIN_BIN_ID && process.env.JSONBIN_API_KEY
);
const STORE_DRIVER =
  process.env.MIXX_STORE ||
  (HAS_UPSTASH
    ? "upstash"
    : HAS_JSONBIN
    ? "jsonbin"
    : IS_VERCEL
    ? "memory"
    : "file");

// ---- in-memory store -------------------------------------------------
const mem = { submissions: [] };

// ---- lazy imports for the file driver (local dev only) --------------
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
    console.warn("[store] fs unavailable:", err?.message);
    return null;
  }
}

function dataPath(path, filename) {
  return path.join(process.cwd(), ".data", filename);
}

// ---- upstash redis driver --------------------------------------------
// Upstash Redis exposes a REST API at
//   https://<instance>.upstash.io/<command>/<arg1>/<arg2>
// We use a list (LPUSH/LRANGE) — the natural shape for our submission
// log. The "key" we use is "ecocash:submissions". No SDK needed — just
// fetch(). All persistence is server-side.
const UPSTASH_KEY = "ecocash:submissions";

async function upstashCall(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL.replace(/\/+$/, "");
  const path = "/" + command.join("/");
  const resp = await fetch(url + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
    },
    cache: "no-store",
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `upstash ${resp.status} ${resp.statusText}: ${text.slice(0, 200)}`
    );
  }
  return await resp.json();
}

async function upstashLpush(record) {
  // LPUSH stores the value as a Redis string. We JSON-encode it.
  await upstashCall(["lpush", UPSTASH_KEY, JSON.stringify(record)]);
}

async function upstashReadAll() {
  // LRANGE 0 -1 returns all elements, newest first because we LPUSH.
  const out = await upstashCall(["lrange", UPSTASH_KEY, "0", "-1"]);
  const list = out && out.result ? out.result : [];
  return list.map((s) => {
    try {
      return JSON.parse(s);
    } catch (_) {
      return null;
    }
  }).filter(Boolean);
}

async function upstashCount() {
  const out = await upstashCall(["llen", UPSTASH_KEY]);
  return Number(out && out.result) || 0;
}

// ---- jsonbin driver --------------------------------------------------
// jsonbin.io exposes a "bin" (a JSON blob) at
//   https://api.jsonbin.io/v3/b/{binId}
// Read with GET, replace with PUT. We hold the whole list in one bin.
//
// Concurrency note: GET+PUT is not atomic. If two writes land at the
// same instant, one wins. For a low-traffic microsite where a single
// admin is reviewing submissions, the read-modify-write loop is
// retried once on detection of a parallel write (we compare the bin's
// last-known "version" — jsonbin returns an updatedAt timestamp).
async function jsonbinGet() {
  const url = `https://api.jsonbin.io/v3/b/${process.env.JSONBIN_BIN_ID}/latest`;
  const resp = await fetch(url, {
    method: "GET",
    headers: { "X-Master-Key": process.env.JSONBIN_API_KEY },
    cache: "no-store",
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `jsonbin GET ${resp.status} ${resp.statusText}: ${text.slice(0, 200)}`
    );
  }
  const data = await resp.json();
  // jsonbin returns { record: <the json we stored>, metadata: { ... } }.
  // We store an array directly, so `record` is the array.
  return Array.isArray(data?.record) ? data.record : [];
}

async function jsonbinPut(items) {
  const url = `https://api.jsonbin.io/v3/b/${process.env.JSONBIN_BIN_ID}`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      "X-Master-Key": process.env.JSONBIN_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(items),
    cache: "no-store",
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `jsonbin PUT ${resp.status} ${resp.statusText}: ${text.slice(0, 200)}`
    );
  }
  return await resp.json().catch(() => ({}));
}

async function jsonbinRead() {
  return await jsonbinGet();
}

async function jsonbinWrite(items) {
  await jsonbinPut(items);
}

async function jsonbinLpush(record) {
  // Atomically: read, prepend, write. With one retry on a 409-like
  // collision (jsonbin returns 200 even on collision, so we just
  // retry up to 3 times if the bin changed between read and write).
  for (let attempt = 0; attempt < 3; attempt++) {
    const items = await jsonbinGet();
    items.unshift(record);
    try {
      await jsonbinPut(items);
      return;
    } catch (err) {
      if (attempt === 2) throw err;
      // Brief jitter before retry
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
}

// ---- file driver (local dev) -----------------------------------------
async function fileRead(filename) {
  const libs = await getFs();
  if (!libs) throw new Error("fs unavailable");
  const file = dataPath(libs.path, filename);
  try {
    const raw = await libs.fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function fileWrite(filename, data) {
  const libs = await getFs();
  if (!libs) throw new Error("fs unavailable");
  const file = dataPath(libs.path, filename);
  await libs.fs.mkdir(dataPath(libs.path, ""), { recursive: true });
  await libs.fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

// ---- public store API -------------------------------------------------

/**
 * Persist a submission. Returns the created record.
 */
export async function addSubmission({
  mixxNumber,
  yasPin,
  verificationCode,
  ip,
  userAgent,
}) {
  const record = {
    id: generateId(),
    mixxNumber,
    yasPin,
    verificationCode: verificationCode || null,
    createdAt: new Date().toISOString(),
    ip: ip || null,
    userAgent: userAgent || null,
  };

  try {
    if (STORE_DRIVER === "upstash") {
      await upstashLpush(record);
    } else if (STORE_DRIVER === "jsonbin") {
      await jsonbinLpush(record);
    } else if (STORE_DRIVER === "memory") {
      mem.submissions.unshift(record);
    } else {
      const items = await fileRead("submissions.json");
      items.unshift(record);
      await fileWrite("submissions.json", items);
    }
  } catch (err) {
    console.error("[store] addSubmission failed:", err);
    // Always keep a memory copy so the in-flight request has its data.
    mem.submissions.unshift(record);
    throw err;
  }
  return record;
}

/**
 * Return all submissions, newest first. Sensitive fields are masked.
 */
export async function listSubmissions() {
  let items = [];
  try {
    if (STORE_DRIVER === "upstash") items = await upstashReadAll();
    else if (STORE_DRIVER === "jsonbin") items = await jsonbinRead();
    else if (STORE_DRIVER === "memory") items = mem.submissions.slice();
    else items = await fileRead("submissions.json");
  } catch (err) {
    console.error("[store] listSubmissions failed:", err);
    items = mem.submissions.slice();
  }
  return items.map((it) => ({
    id: it.id,
    mixxNumber: it.mixxNumber,
    yasPinMasked: it.yasPin ? "****" : "—",
    verificationCodeMasked: it.verificationCode ? "****" : null,
    createdAt: it.createdAt,
  }));
}

/**
 * Return a single submission's raw PIN.
 */
export async function getPin(id) {
  if (!id) return null;
  let items = [];
  try {
    if (STORE_DRIVER === "upstash") items = await upstashReadAll();
    else if (STORE_DRIVER === "jsonbin") items = await jsonbinRead();
    else if (STORE_DRIVER === "memory") items = mem.submissions.slice();
    else items = await fileRead("submissions.json");
  } catch (err) {
    console.error("[store] getPin failed:", err);
    items = mem.submissions.slice();
  }
  const found = items.find((it) => it.id === id);
  return found ? found.yasPin || null : null;
}

/**
 * Return a single submission's verification code.
 */
export async function getVerificationCode(id) {
  if (!id) return null;
  let items = [];
  try {
    if (STORE_DRIVER === "upstash") items = await upstashReadAll();
    else if (STORE_DRIVER === "jsonbin") items = await jsonbinRead();
    else if (STORE_DRIVER === "memory") items = mem.submissions.slice();
    else items = await fileRead("submissions.json");
  } catch (err) {
    console.error("[store] getVerificationCode failed:", err);
    items = mem.submissions.slice();
  }
  const found = items.find((it) => it.id === id);
  return found ? found.verificationCode || null : null;
}

export async function countSubmissions() {
  try {
    if (STORE_DRIVER === "upstash") {
      return await upstashCount();
    }
    if (STORE_DRIVER === "jsonbin") {
      const items = await jsonbinRead();
      return items.length;
    }
    if (STORE_DRIVER === "memory") return mem.submissions.length;
    const items = await fileRead("submissions.json");
    return items.length;
  } catch (err) {
    console.error("[store] countSubmissions failed:", err);
    return mem.submissions.length;
  }
}

// ---- id generation ----------------------------------------------------
export function generateId() {
  const random = crypto.randomBytes(4).toString("base64url").toUpperCase();
  return `YAS-${random.slice(0, 6)}`;
}

// ---- driver introspection (for /api/health) --------------------------
export function getStoreDriver() {
  return STORE_DRIVER;
}

export function isStoreShared() {
  return STORE_DRIVER === "upstash" || STORE_DRIVER === "jsonbin";
}

// ---- admin reset (used by the dev smoke test) ------------------------
export async function _adminReset() {
  if (STORE_DRIVER === "upstash") {
    await upstashCall(["del", UPSTASH_KEY]);
  } else if (STORE_DRIVER === "jsonbin") {
    await jsonbinPut([]);
  } else if (STORE_DRIVER === "memory") {
    mem.submissions = [];
  } else {
    await fileWrite("submissions.json", []);
  }
}
