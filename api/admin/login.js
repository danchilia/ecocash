// filepath: api/admin/login.js
// POST /api/admin/login  — body: { username, password } → sets admin
// cookie on success. Username is ignored on the superadmin path (a
// password match against SUPERADMIN_PASSWORD is enough).

import { login } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { username, password } = req.body || {};
  const result = await login(username, password);
  if (!result) {
    return res.status(401).json({ ok: false, error: "Invalid username or password." });
  }
  res.setHeader("Set-Cookie", result.cookie);
  return res.status(200).json({ ok: true, role: result.role, username: result.username });
}
