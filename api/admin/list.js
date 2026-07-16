// filepath: api/admin/list.js
// GET /api/admin/list → returns all submissions. Requires admin cookie.

import { isAuthenticated } from "../_lib/auth.js";
import { listSubmissions, countSubmissions } from "../_lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!isAuthenticated(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const [items, total] = await Promise.all([
      listSubmissions(),
      countSubmissions(),
    ]);
    return res.status(200).json({ ok: true, total, items });
  } catch (err) {
    console.error("admin list error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Imeshindwa kupata data." });
  }
}
