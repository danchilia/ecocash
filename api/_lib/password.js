// filepath: api/_lib/password.js
// PBKDF2-HMAC-SHA256 password hashing utilities used for individual
// admin accounts (see store.js's admin roster). Pure functions, no
// storage — each admin's hash lives on their roster record.

import crypto from "node:crypto";

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

export function verifyPasswordHash(plain, stored) {
  if (typeof plain !== "string" || plain.length === 0) return false;
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
