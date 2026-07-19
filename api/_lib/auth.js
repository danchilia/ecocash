// filepath: api/_lib/auth.js
// Admin authentication. Cookie-based sessions with two roles:
//
//   - superadmin: authenticates with SUPERADMIN_PASSWORD (env var).
//     Username is ignored for this path. Manages the admin roster.
//   - admin: authenticates with a username + password checked against
//     an individual account in the roster (see store.js).
//
// The cookie only carries "role:id" (HMAC-signed). For admin
// sessions, every request re-fetches that admin's current record and
// rejects the session if it was deleted or suspended in the
// meantime — so "restrict" and "delete" take effect immediately, even
// on a session that's already open, not just on the next login.

import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyPasswordHash } from "./password.js";
import { getAdminByUsername, getAdminById } from "./store.js";

const COOKIE_NAME = "mixx_admin";
const SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET || "dev-only-secret-change-me";
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || null;

function constantTimeStringEqual(a, b) {
  const A = Buffer.from(String(a), "utf8");
  const B = Buffer.from(String(b), "utf8");
  if (A.length !== B.length) {
    const pad = Buffer.alloc(Math.max(A.length, B.length));
    timingSafeEqual(pad, pad);
    return false;
  }
  return timingSafeEqual(A, B);
}

function sign(value) {
  return createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("base64url")
    .slice(0, 32);
}

function buildCookie(value, maxAgeSeconds = 60 * 60 * 8 /* 8h */) {
  const sig = sign(value);
  const payload = `${value}.${sig}`;
  return `${COOKIE_NAME}=${payload}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

function readCookie(req, name) {
  const header = req.headers?.cookie || "";
  const parts = header.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

function isValidCookie(value) {
  if (!value || typeof value !== "string") return false;
  const idx = value.lastIndexOf(".");
  if (idx <= 0) return false;
  const body = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  const expected = sign(body);
  if (sig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

function parseCookiePayload(req) {
  const cookie = readCookie(req, COOKIE_NAME);
  if (!isValidCookie(cookie)) return null;
  const idx = cookie.lastIndexOf(".");
  const value = cookie.slice(0, idx); // "role:id"
  const sepIdx = value.indexOf(":");
  if (sepIdx < 0) return null;
  const role = value.slice(0, sepIdx);
  const id = value.slice(sepIdx + 1);
  if (role !== "admin" && role !== "superadmin") return null;
  return { role, id: id === "-" ? null : id };
}

/**
 * Resolve the current request's session, re-validating admin sessions
 * against the live roster. Returns null when unauthenticated.
 */
export async function getSession(req) {
  const payload = parseCookiePayload(req);
  if (!payload) return null;
  if (payload.role === "superadmin") {
    return { role: "superadmin", id: null, username: null };
  }
  const record = await getAdminById(payload.id);
  if (!record || record.suspended) return null;
  return { role: "admin", id: record.id, username: record.username };
}

export async function isAuthenticated(req) {
  return (await getSession(req)) !== null;
}

export async function isSuperAdmin(req) {
  const session = await getSession(req);
  return !!session && session.role === "superadmin";
}

export async function login(username, password) {
  if (typeof password !== "string" || password.length === 0) return null;

  if (
    SUPERADMIN_PASSWORD &&
    constantTimeStringEqual(password, SUPERADMIN_PASSWORD)
  ) {
    return { cookie: buildCookie("superadmin:-"), role: "superadmin", username: null };
  }

  const uname = String(username || "").trim();
  if (!uname) return null;
  const record = await getAdminByUsername(uname);
  if (!record || record.suspended) return null;
  const ok = verifyPasswordHash(password, record.passwordHash);
  if (!ok) return null;
  return {
    cookie: buildCookie(`admin:${record.id}`),
    role: "admin",
    username: record.username,
  };
}

export function logout() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}
