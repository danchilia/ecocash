// filepath: dev-server.js
// Minimal local dev server: serves static files from the project root AND
// runs the serverless handlers in /api/*. Vercel-compatible shape (the
// handlers already use `req`/`res` like @vercel/node), so what works
// here will work on Vercel too.
//
// Run:  node dev-server.js
//      → http://localhost:3000  (form)
//      → http://localhost:3000/admin  (dashboard)
//      Login: admin / admin123 (default in .env)

import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

// --- minimal Vercel-style req/res adapters ---------------------------
// The handlers expect Vercel's @vercel/node shape: (req, res). For a
// Node http request we need to parse the body, headers, and provide a
// res object with .status(), .json(), .setHeader(), etc.

function createReq(rawReq) {
  const req = Object.assign(rawReq, {
    body: undefined,
    query: {},
    cookies: {},
    socket: { remoteAddress: rawReq.socket?.remoteAddress || null },
  });

  // Parse cookies
  const cookieHeader = rawReq.headers.cookie || "";
  cookieHeader.split(";").forEach((part) => {
    const [k, ...v] = part.trim().split("=");
    if (k) req.cookies[k] = decodeURIComponent(v.join("="));
  });

  return req;
}

function createRes(rawRes) {
  let statusCode = 200;
  const headers = {};
  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    setHeader(key, value) {
      // Coerce Promises/objects to strings so a forgotten `await` in a
      // handler doesn't silently send "[object Promise]" as a header.
      let v = value;
      if (v && typeof v === "object" && typeof v.then === "function") {
        // a Promise was passed by mistake; stringify to make the bug
        // visible in the response without crashing the server.
        v = "[unresolved-promise]";
      } else if (v && typeof v === "object") {
        v = JSON.stringify(v);
      }
      headers[key.toLowerCase()] = String(v);
      return res;
    },
    getHeader(key) {
      return headers[key.toLowerCase()];
    },
    getHeaders() {
      return { ...headers };
    },
    json(data) {
      const body = JSON.stringify(data);
      headers["content-type"] = "application/json; charset=utf-8";
      rawRes.writeHead(statusCode, headers);
      rawRes.end(body);
    },
    send(data) {
      if (!headers["content-type"] && typeof data === "string") {
        headers["content-type"] = "text/plain; charset=utf-8";
      }
      rawRes.writeHead(statusCode, headers);
      rawRes.end(data);
    },
    end(data) {
      rawRes.writeHead(statusCode, headers);
      rawRes.end(data);
    },
  };
  return res;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      const ct = (req.headers["content-type"] || "").toLowerCase();
      try {
        if (ct.includes("application/json")) {
          return resolve(JSON.parse(raw));
        }
        if (ct.includes("application/x-www-form-urlencoded")) {
          const obj = {};
          new URLSearchParams(raw).forEach((v, k) => (obj[k] = v));
          return resolve(obj);
        }
        // Try JSON anyway
        return resolve(JSON.parse(raw));
      } catch (err) {
        return resolve({}); // swallow parse errors — handlers will validate
      }
    });
    req.on("error", reject);
  });
}

// --- static file serving ---------------------------------------------
const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

async function serveStatic(req, res, relPath) {
  // Default to /index.html
  if (relPath === "/" || relPath === "") relPath = "/index.html";
  // Pretty URL → same-named .html (e.g. /admin → /admin.html)
  if (!path.extname(relPath)) {
    const guess = path.join(ROOT, relPath.replace(/^[\/\\]+/, "") + ".html");
    try {
      const stat = await fs.stat(guess);
      if (stat.isFile()) {
        relPath = relPath.replace(/^[\/\\]+/, "") + ".html";
      }
    } catch {}
  }
  // Disallow path traversal
  const safe = path
    .normalize(relPath)
    .replace(/^(\.\.[\/\\])+/, "")
    .replace(/^[\/\\]+/, "");
  const filePath = path.join(ROOT, safe);
  if (!filePath.startsWith(ROOT)) {
    res.status(403).end("Forbidden");
    return;
  }
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      const idx = path.join(filePath, "index.html");
      const data = await fs.readFile(idx);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(data);
      return;
    }
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", STATIC_TYPES[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.end(data);
  } catch (err) {
    res.status(404).setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found: " + relPath);
  }
}

// --- /api routing ----------------------------------------------------
async function runApiHandler(req, res, relPath) {
  // relPath looks like "/api/redeem" or "/api/admin/login"
  // Map to file: api/redeem.js or api/admin/login.js
  const cleanPath = relPath.replace(/^\/+/, "").replace(/\.js$/, "");
  const candidates = [
    path.join(ROOT, cleanPath + ".js"),
    path.join(ROOT, cleanPath, "index.js"),
  ];
  let handlerPath = null;
  for (const c of candidates) {
    try {
      const stat = await fs.stat(c);
      if (stat.isFile()) {
        handlerPath = c;
        break;
      }
    } catch {}
  }
  if (!handlerPath) {
    res.status(404).json({ ok: false, error: "Not found: " + relPath });
    return;
  }

  try {
    // Re-import to pick up changes on each request. (Note: transitive
    // relative imports inside the handler are ESM-cached per-process,
    // so changes to api/_lib/*.js need a server restart. This is OK
    // for local dev — Vercel rebuilds per deploy.)
    const mod = await import(pathToFileURL(handlerPath).href + "?t=" + Date.now());
    const handler = mod.default || mod.handler || mod;
    if (typeof handler !== "function") {
      res
        .status(500)
        .json({ ok: false, error: "Handler is not a function in " + relPath });
      return;
    }
    await handler(req, res);
  } catch (err) {
    console.error("API error in " + relPath + ":", err);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ ok: false, error: "Internal error: " + err.message });
    }
  }
}

// --- main server -----------------------------------------------------
const server = http.createServer(async (rawReq, rawRes) => {
  const req = createReq(rawReq);
  const res = createRes(rawRes);
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  // CORS / cache headers for the dev experience
  rawRes.setHeader("X-Powered-By", "mixx-dev");

  // Parse query into req.query
  for (const [k, v] of url.searchParams.entries()) {
    req.query[k] = v;
  }

  try {
    if (pathname.startsWith("/api/")) {
      // Body parsing for JSON / form-encoded
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        req.body = await readBody(req);
      }
      await runApiHandler(req, res, pathname);
      return;
    }
    // Everything else → static
    await serveStatic(req, res, pathname);
  } catch (err) {
    console.error("Server error:", err);
    if (!rawRes.headersSent) {
      rawRes.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      rawRes.end("Server error: " + err.message);
    }
  }
});

server.listen(PORT, () => {
  console.log(`\n  Mixx dev server ready`);
  console.log(`  ─────────────────────`);
  console.log(`  App     → http://localhost:${PORT}/`);
  console.log(`  Admin   → http://localhost:${PORT}/admin`);
  console.log(`  Admin password (default): admin123`);
  console.log(`  Override with ADMIN_PASSWORD env var or .env file\n`);
});
