// filepath: api/admin/admins/add.js
// POST /api/admin/admins/add  body: { name } → adds an admin to the
// roster. Superadmin only.

import { isSuperAdmin } from "../../_lib/auth.js";
import { addAdmin } from "../../_lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!isSuperAdmin(req)) {
    return res.status(403).json({ ok: false, error: "Superadmin access required." });
  }

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
