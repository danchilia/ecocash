// filepath: api/health.js
// GET /api/health → small JSON describing the current store driver.
// Useful for verifying which backend the deployment is using, and
// that the KV credentials are wired up correctly.

import { getStoreDriver, isStoreShared } from "./_lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  return res.status(200).json({
    ok: true,
    store: getStoreDriver(),
    shared: isStoreShared(),
    vercel: process.env.VERCEL === "1",
    hasUpstash: !!(
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ),
    hasJsonbin: !!(
      process.env.JSONBIN_BIN_ID && process.env.JSONBIN_API_KEY
    ),
    time: new Date().toISOString(),
  });
}
