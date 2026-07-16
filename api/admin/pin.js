// filepath: api/admin/pin.js
// GET /api/admin/pin?id=YAS-XXXXXX
// Returns the unmasked YAS PIN for a single submission. Requires the
// admin session cookie. The PIN is never sent in the list response —
// it is only delivered on explicit, per-row reveal.

import { isAuthenticated } from "../_lib/auth.js";
import { getPin } from "../_lib/store.js";

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
    const pin = await getPin(id);
    if (pin == null) {
      return res.status(404).json({ ok: false, error: "Not found." });
    }
    return res.status(200).json({ ok: true, id, pin });
  } catch (err) {
    console.error("admin pin error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Imeshindwa kupata PIN." });
  }
}
