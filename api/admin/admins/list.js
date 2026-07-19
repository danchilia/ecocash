// filepath: api/admin/admins/list.js
// GET /api/admin/admins/list → returns the admin roster. Superadmin only.

import { isSuperAdmin } from "../../_lib/auth.js";
import { listAdmins } from "../../_lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!isSuperAdmin(req)) {
    return res.status(403).json({ ok: false, error: "Superadmin access required." });
  }

  try {
    const items = await listAdmins();
    return res.status(200).json({ ok: true, items });
  } catch (err) {
    console.error("admin/admins list error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load admins." });
  }
}
