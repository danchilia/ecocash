// filepath: api/ping.js
// GET /api/ping  → tries a minimal Upstash LPUSH and reports the result.
// Used to isolate whether the problem is in our code, in @vercel/kv,
// or in the KV credentials.

export default async function handler(req, res) {
  const result = {
    nodeVersion: process.version,
    hasUrl: !!process.env.KV_REST_API_URL,
    hasToken: !!process.env.KV_REST_API_TOKEN,
    lpush: null,
    lpushErr: null,
    lrange: null,
    lrangeErr: null,
  };

  if (!result.hasUrl || !result.hasToken) {
    return res.status(200).json({ ...result, error: "missing env vars" });
  }

  try {
    const r = await fetch(process.env.KV_REST_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["LPUSH", "ping:list", "hello-" + Date.now()]),
      cache: "no-store",
    });
    const j = await r.json();
    result.lpush = { status: r.status, body: j };
  } catch (e) {
    result.lpushErr = String(e?.message || e);
  }

  try {
    const r = await fetch(process.env.KV_REST_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["LRANGE", "ping:list", "0", "-1"]),
      cache: "no-store",
    });
    const j = await r.json();
    result.lrange = { status: r.status, body: j };
  } catch (e) {
    result.lrangeErr = String(e?.message || e);
  }

  return res.status(200).json(result);
}
