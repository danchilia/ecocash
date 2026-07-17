// filepath: api/diag.js
// GET /api/diag  → reports whether Upstash credentials are usable and
// whether a tiny write succeeds. Helps diagnose runtime issues without
// digging through Vercel's log UI.

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const hasUrl = !!url;
  const hasToken = !!token;
  const urlPrefix = hasUrl ? String(url).slice(0, 24) + "..." : null;

  if (!hasUrl || !hasToken) {
    return res.status(200).json({
      ok: true,
      hasUpstashUrl: hasUrl,
      hasUpstashToken: hasToken,
      urlPrefix,
      writeOk: null,
      writeError: "missing env vars",
      time: new Date().toISOString(),
    });
  }

  // Attempt a tiny LPUSH so we know creds work end-to-end.
  let writeOk = false;
  let writeError = null;
  let writeBody = null;
  let writeStatus = null;
  try {
    const resp = await fetch(String(url).replace(/\/+$/, ""), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        "lpush",
        "ecocash:diag",
        String(Date.now()),
      ]),
      cache: "no-store",
    });
    writeStatus = resp.status;
    const text = await resp.text();
    writeBody = text.slice(0, 500);
    if (!resp.ok) {
      writeError = `upstash ${resp.status} ${resp.statusText}`;
    } else {
      writeOk = true;
    }
  } catch (e) {
    writeError = String(e?.message || e);
  }

  return res.status(200).json({
    ok: true,
    hasUpstashUrl: hasUrl,
    hasUpstashToken: hasToken,
    urlPrefix,
    writeOk,
    writeError,
    writeStatus,
    writeBody,
    time: new Date().toISOString(),
  });
}
