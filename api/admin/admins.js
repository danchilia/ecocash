// filepath: api/admin/admins.js
// Manages individual admin accounts. Superadmin only.
//   GET    /api/admin/admins                       → list all admins
//   POST   /api/admin/admins  {username,password}  → create an admin
//   PATCH  /api/admin/admins  {id,suspended}        → suspend/unsuspend
//   DELETE /api/admin/admins  {id}                  → delete an admin
//
// Combined into one handler (rather than separate files) to stay
// under Vercel Hobby's serverless function count limit.

import { isSuperAdmin } from "../_lib/auth.js";
import {
  listAdmins,
  addAdmin,
  deleteAdmin,
  setAdminSuspended,
} from "../_lib/store.js";

export default async function handler(req, res) {
  if (!(await isSuperAdmin(req))) {
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
    const { username, password } = req.body || {};
    try {
      const result = await addAdmin({ username, password });
      if (!result.ok) {
        return res.status(400).json({ ok: false, error: result.error });
      }
      return res.status(200).json({ ok: true, item: result.item });
    } catch (err) {
      console.error("admin/admins add error:", err);
      return res.status(500).json({ ok: false, error: "Failed to add admin." });
    }
  }

  if (req.method === "PATCH") {
    const id = String((req.body || {}).id || "").trim();
    const suspended = !!(req.body || {}).suspended;
    if (!id) {
      return res.status(400).json({ ok: false, error: "Missing id." });
    }
    try {
      const result = await setAdminSuspended(id, suspended);
      if (!result.ok) {
        return res.status(400).json({ ok: false, error: result.error });
      }
      return res.status(200).json({ ok: true, item: result.item });
    } catch (err) {
      console.error("admin/admins suspend error:", err);
      return res.status(500).json({ ok: false, error: "Failed to update admin." });
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

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
