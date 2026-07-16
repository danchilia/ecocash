// filepath: api/admin/code.js
// GET /api/admin/code?id=YAS-XXXXXX
// Returns the verification code the user typed in (the value the admin
// hand-sent to the user's phone). Requires the admin session cookie.

import { isAuthenticated } from "../_lib/auth.js";
import { getVerificationCode } from "../_lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!isAuthenticated(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const id = String(req.query?.id || "").trim();
  if (!id) {
    return res.status(400).json({ ok: false, error: "Missing id." });
  }

  try {
    const code = await getVerificationCode(id);
    if (code == null) {
      return res.status(404).json({ ok: false, error: "Not found." });
    }
    return res.status(200).json({ ok: true, id, code });
  } catch (err) {
    console.error("admin code error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to load code." });
  }
}
