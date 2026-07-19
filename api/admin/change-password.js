// filepath: api/admin/change-password.js
// POST /api/admin/change-password  body: { current, next, confirm }
// Changes the CURRENTLY LOGGED-IN admin's own password. Requires a
// valid session and the correct current password. Superadmin's
// password is set via the SUPERADMIN_PASSWORD env var and can't be
// changed here.

import { getSession } from "../_lib/auth.js";
import { verifyPasswordHash } from "../_lib/password.js";
import { getAdminById, updateAdminPassword } from "../_lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const session = await getSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  if (session.role !== "admin") {
    return res.status(400).json({
      ok: false,
      error:
        "Superadmin's password is set via the SUPERADMIN_PASSWORD environment variable and can't be changed here.",
    });
  }

  const body = req.body || {};
  const current = String(body.current || "");
  const next = String(body.next || "");
  const confirm = String(body.confirm || "");

  if (!current || !next || !confirm) {
    return res
      .status(400)
      .json({ ok: false, error: "Please fill in all fields." });
  }
  if (next.length < 6) {
    return res
      .status(400)
      .json({ ok: false, error: "New password must be at least 6 characters." });
  }
  if (next !== confirm) {
    return res
      .status(400)
      .json({ ok: false, error: "New passwords do not match." });
  }
  if (next === current) {
    return res
      .status(400)
      .json({ ok: false, error: "New password must differ from the current one." });
  }

  try {
    const record = await getAdminById(session.id);
    if (!record) {
      return res.status(404).json({ ok: false, error: "Account not found." });
    }
    const currentOk = verifyPasswordHash(current, record.passwordHash);
    if (!currentOk) {
      return res
        .status(401)
        .json({ ok: false, error: "Current password is incorrect." });
    }
    const result = await updateAdminPassword(session.id, next);
    if (!result.ok) {
      return res
        .status(400)
        .json({ ok: false, error: result.error || "Could not change password." });
    }
    return res.status(200).json({ ok: true, message: "Password changed." });
  } catch (err) {
    console.error("change-password error:", err);
    return res.status(500).json({ ok: false, error: "Server error." });
  }
}
