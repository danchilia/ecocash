// filepath: api/admin/change-password.js
// POST /api/admin/change-password  body: { current, next, confirm }
// Requires the admin session cookie AND a correct current password.
// On success, persists a PBKDF2 hash in .data/admin.json.

import { isAuthenticated } from "../_lib/auth.js";
import { checkPasswordAsync, setPassword } from "../_lib/password.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!isAuthenticated(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
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
    const currentOk = await checkPasswordAsync(current);
    if (!currentOk) {
      return res
        .status(401)
        .json({ ok: false, error: "Current password is incorrect." });
    }
    const result = await setPassword(next);
    if (!result || !result.ok) {
      return res
        .status(400)
        .json({ ok: false, error: (result && result.error) || "Could not change password." });
    }
    return res.status(200).json({
      ok: true,
      message: "Password changed.",
      updatedAt: result.updatedAt,
    });
  } catch (err) {
    console.error("change-password error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Server error." });
  }
}
