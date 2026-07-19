// filepath: api/admin/admins.js
// Manages the admin roster. Superadmin only.
//   GET    /api/admin/admins            → list
//   POST   /api/admin/admins  {name}    → add
//   DELETE /api/admin/admins  {id}      → delete
//
// Combined into one handler (rather than three files) to stay under
// Vercel Hobby's serverless function count limit.

import { isSuperAdmin } from "../_lib/auth.js";
import { listAdmins, addAdmin, deleteAdmin } from "../_lib/store.js";

export default async function handler(req, res) {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ ok: false, error: "Superadmin access required." });
  }

  if (req.method === "GET") {
    try {
      const items = await listAdmins();
      return res.status(200).json({ ok: true, items });
    } catch (err) {
      console.error("admin/admins list error:", err);
      return res.status(500).json({ ok: false, error: "Failed to load admins." });
    }
  }

  if (req.method === "POST") {
    const name = String((req.body || {}).name || "").trim();
    if (!name) {
      return res.status(400).json({ ok: false, error: "Name is required." });
    }
    if (name.length > 80) {
      return res.status(400).json({ ok: false, error: "Name is too long." });
    }
    try {
      const item = await addAdmin({ name });
      return res.status(200).json({ ok: true, item });
    } catch (err) {
      console.error("admin/admins add error:", err);
      return res.status(500).json({ ok: false, error: "Failed to add admin." });
    }
  }

  if (req.method === "DELETE") {
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

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
