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
  const result = await login(password);
  console.log("[login] cookie:", result ? "issued" : "null");
  if (!result) {
    return res.status(401).json({ ok: false, error: "Password batili." });
  }
  res.setHeader("Set-Cookie", result.cookie);
  return res.status(200).json({ ok: true, role: result.role });
}
