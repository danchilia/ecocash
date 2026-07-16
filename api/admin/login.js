// filepath: api/admin/login.js
// POST /api/admin/login  — body: { password } → sets admin cookie on success.

import { login } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { password } = req.body || {};
  console.log("[login] body keys:", Object.keys(req.body || {}), "password type:", typeof password, "len:", password && password.length);
  const cookie = await login(password);
  console.log("[login] cookie:", cookie ? "issued" : "null");
  if (!cookie) {
    return res.status(401).json({ ok: false, error: "Password batili." });
  }
  res.setHeader("Set-Cookie", cookie);
  return res.status(200).json({ ok: true });
}
