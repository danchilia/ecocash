// filepath: api/admin/admins/delete.js
// POST /api/admin/admins/delete  body: { id } → removes an admin from
// the roster. Superadmin only.

import { isSuperAdmin } from "../../_lib/auth.js";
import { deleteAdmin } from "../../_lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!isSuperAdmin(req)) {
    return res.status(403).json({ ok: false, error: "Superadmin access required." });
  }

  const id = String((req.body || {}).id || "").trim();
  if (!id) {
    return res.status(400).json({ ok: false, error: "Missing id." });
  }

  try {
    const ok = await deleteAdmin(id);
    if (!ok) {
      return res.status(500).json({ ok: false, error: "Failed to delete admin." });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("admin/admins delete error:", err);
    return res.status(500).json({ ok: false, error: "Failed to delete admin." });
  }
}
