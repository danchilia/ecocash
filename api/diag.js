// filepath: api/diag.js
// GET /api/diag  → reports whether @vercel/kv can be imported and
// whether the env vars are usable. Helps diagnose runtime issues
// without digging through Vercel's log UI.

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const hasUrl = !!process.env.KV_REST_API_URL;
  const hasToken = !!process.env.KV_REST_API_TOKEN;
  const urlPrefix = hasUrl
    ? String(process.env.KV_REST_API_URL).slice(0, 24) + "…"
    : null;

  let kvImportError = null;
  let kvImportOk = false;
  let kvSetOk = null;
  let kvSetError = null;
  try {
    const mod = await import("@vercel/kv");
    if (mod && mod.kv) {
      kvImportOk = true;
      // Try a tiny write so we know credentials work too.
      try {
        await mod.kv.set("diag:ping", "pong");
        kvSetOk = true;
      } catch (e) {
        kvSetError = String(e?.message || e);
      }
    } else {
      kvImportError = "module loaded but no .kv export";
    }
  } catch (e) {
    kvImportError = String(e?.message || e);
  }

  return res.status(200).json({
    ok: true,
    nodeVersion: process.version,
    platform: process.platform,
    hasKvUrl: hasUrl,
    hasKvToken: hasToken,
    urlPrefix,
    kvImportOk,
    kvImportError,
    kvSetOk,
    kvSetError,
  });
}
