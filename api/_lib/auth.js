// filepath: api/_lib/auth.js
// Tiny admin authentication. Cookie-based, server-side password check.
// The password source is the ADMIN_PASSWORD env var (bootstrap) or a
// PBKDF2 hash stored in .data/admin.json (set when the admin changes
// the password from the dashboard). Do NOT commit real passwords.

import { createHmac, timingSafeEqual } from "node:crypto";
import { checkPasswordAsync } from "./password.js";

const COOKIE_NAME = "mixx_admin";
const SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET || "dev-only-secret-change-me";

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

export function isAuthenticated(req) {
  const cookie = readCookie(req, COOKIE_NAME);
  return isValidCookie(cookie);
}

export async function login(password) {
  if (typeof password !== "string" || password.length === 0) return null;
  const ok = await checkPasswordAsync(password);
  if (!ok) return null;
  return buildCookie("ok");
}

export function logout() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}
