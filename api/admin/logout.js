// filepath: api/admin/logout.js
// POST /api/admin/logout → clears the admin cookie.

import { logout } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  res.setHeader("Set-Cookie", logout());
  return res.status(200).json({ ok: true });
}
