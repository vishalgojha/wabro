const API_BASE = (() => {
  const { hostname, protocol } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:3002/api/wabro/onboard";
  }
  return `${protocol}//${window.location.host}/api/wabro/onboard`;
})();

let sessionId = null;
let eventSource = null;
let starting = false;
let pairingCountdown = null;

const $ = (id) => document.getElementById(id);

// WhatsApp pairing codes live about as long as the QR window (120s).
const PAIRING_CODE_TTL_MS = 120_000;

function showStep(id) {
  document.querySelectorAll(".onboard-card").forEach((el) => el.classList.add("hidden"));
  $(id).classList.remove("hidden");
}

// Rendered by our own backend (GET /qr-image): the linking payload never
// leaves this server for a third-party image service.
async function renderQR() {
  const canvas = $("qr-canvas");
  const placeholder = $("qr-placeholder");
  if (!sessionId) return;
  try {
    const resp = await fetch(`${API_BASE}/qr-image/${sessionId}`);
    if (!resp.ok) throw new Error("no qr");
    const { dataUrl } = await resp.json();
    canvas.innerHTML = `<img src="${dataUrl}" alt="QR Code" width="256" height="256" />`;
    canvas.style.display = "block";
    placeholder.style.display = "none";
  } catch {
    canvas.style.display = "none";
    placeholder.style.display = "block";
    placeholder.textContent = "QR not ready yet - or use a pairing code below.";
  }
}

function setLinkingStopped() {
  // The socket is gone, so every artifact that implied progress is a lie:
  // replace the QR placeholder and loading status with an unambiguous
  // stopped state. The restart path lives in the pairing section.
  $("qr-canvas").style.display = "none";
  const ph = $("qr-placeholder");
  ph.style.display = "grid";
  ph.textContent = "Linking stopped";
  const status = $("qr-status");
  status.classList.remove("loading");
  status.textContent = "Linking stopped. Tap Restart linking to try again.";
}

function showError(msg) {
  $("error-message").textContent = msg;
  showStep("step-error");
}

function showPairingError(msg, canRestart) {
  const el = $("pairing-error");
  el.textContent = msg;
  el.classList.remove("hidden");
  $("pairing-restart-btn").classList.toggle("hidden", !canRestart);
  // A failure leaves the displayed code's state uncertain: de-emphasize it
  // so it is not mistaken for a usable code.
  if (!$("pairing-code-display").classList.contains("hidden")) {
    $("pairing-code-value").classList.add("stale");
  }
}

function clearPairingError() {
  $("pairing-error").classList.add("hidden");
  $("pairing-restart-btn").classList.add("hidden");
}

function startPairingCountdown(issuedAt) {
  if (pairingCountdown) clearInterval(pairingCountdown);
  const el = $("pairing-expiry");
  const codeEl = $("pairing-code-value");
  const tick = () => {
    const left = Math.max(0, PAIRING_CODE_TTL_MS - (Date.now() - (issuedAt || Date.now())));
    const secs = Math.ceil(left / 1000);
    el.textContent = secs > 0
      ? `Code expires in ~${secs}s`
      : "This code expired. Get a new one below.";
    el.classList.toggle("error", secs === 0);
    codeEl.classList.toggle("stale", secs === 0);
    if (secs === 0 && pairingCountdown) {
      clearInterval(pairingCountdown);
      pairingCountdown = null;
    }
  };
  tick();
  pairingCountdown = setInterval(tick, 1000);
}

function renderPairingCode(code, issuedAt) {
  clearPairingError();
  const codeEl = $("pairing-code-value");
  codeEl.textContent = code;
  codeEl.classList.remove("stale");
  $("pairing-code-display").classList.remove("hidden");
  // One set of controls: the phone form folds away while a code is shown -
  // but only when we actually have the phone. A page reloaded into an
  // in-flight pairing has no phone on file; hiding the form then would
  // strand the user with a code they cannot renew.
  const enteredPhone = $("pairing-phone").value.trim();
  if (enteredPhone) {
    $("pairing-form").classList.add("hidden");
    $("pairing-for-phone").textContent = enteredPhone;
    $("pairing-for").classList.remove("hidden");
  } else {
    $("pairing-form").classList.remove("hidden");
    $("pairing-for").classList.add("hidden");
  }
  // A code supersedes the QR on this socket - hide the stale QR visually
  // and switch the card copy from scanning to code entry.
  $("qr-container").classList.add("hidden");
  $("link-divider").classList.add("hidden");
  $("link-title").textContent = "Enter this code in WhatsApp";
  $("link-subtitle").innerHTML = "WhatsApp → Linked devices → Link a device → <strong>Link with phone number instead</strong>";
  $("qr-status").textContent = "";
  startPairingCountdown(issuedAt);
}

async function requestPairingCode(fresh) {
  const phone = $("pairing-phone").value.replace(/\D/g, "");
  if (phone.length < 10) {
    // Always leave a visible path forward: reveal and focus the phone form.
    $("pairing-form").classList.remove("hidden");
    $("pairing-for").classList.add("hidden");
    $("pairing-phone").focus();
    showPairingError("Enter the full phone number with country code (digits only).", false);
    return;
  }
  clearPairingError();
  $("pairing-get-btn").disabled = true;
  $("pairing-new-btn").disabled = true;
  try {
    const resp = await fetch(`${API_BASE}/pairing-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, fresh: fresh === true }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      showPairingError(data.error || "Could not get a pairing code.", true);
      return;
    }
    if (data.pairingCode) {
      renderPairingCode(data.pairingCode, data.pairingCodeIssuedAt);
    } else {
      // Fresh session: the code arrives over the SSE stream in a moment.
      $("qr-status").textContent = "Requesting pairing code...";
    }
  } catch (err) {
    showPairingError(err.message || "Network error", true);
  } finally {
    $("pairing-get-btn").disabled = false;
    $("pairing-new-btn").disabled = false;
  }
}

function startSSE(sid) {
  if (eventSource) eventSource.close();

  const url = `${API_BASE}/status/${sid}?events=1`;
  eventSource = new EventSource(url);

  eventSource.addEventListener("qr", () => {
    renderQR();
    $("qr-status").textContent = "QR ready — scan with WhatsApp";
  });

  eventSource.addEventListener("pairing_code", (e) => {
    const data = JSON.parse(e.data);
    renderPairingCode(data.code, data.issuedAt);
  });

  eventSource.addEventListener("state", (e) => {
    // Rehydrate on load: a session already waiting on a code shows it,
    // with its real expiry countdown; an already-expired code offers a
    // fresh one instead of misleading the user.
    const data = JSON.parse(e.data);
    if (data.pairingCode) {
      renderPairingCode(data.pairingCode, data.pairingCodeIssuedAt);
    } else if (data.qr) {
      // Page reloaded while a QR was already waiting: render it instead of
      // sitting on the "Generating QR code..." placeholder until the next
      // QR refresh event.
      renderQR();
    }
  });

  eventSource.addEventListener("connected", () => {
    showStep("step-scanning");
  });

  eventSource.addEventListener("groups", (e) => {
    const data = JSON.parse(e.data);
    $("scan-progress").textContent = `Found ${data.count} groups on your account.`;
  });

  eventSource.addEventListener("error", (e) => {
    const data = JSON.parse(e.data);
    showError(data.message || "Connection failed");
  });

  eventSource.addEventListener("logged_out", () => {
    showError("Session logged out. Please try again.");
  });

  eventSource.addEventListener("reconnecting", () => {
    $("qr-status").textContent = "Connection lost. Reconnecting...";
  });

  eventSource.addEventListener("disconnected", () => {
    // The socket died before linking finished, so any code it minted died
    // with it. Never leave a dead code on screen as if it were usable.
    setLinkingStopped();
    $("pairing-code-display").classList.add("hidden");
    showPairingError("Connection was lost before linking finished, so that code is no longer valid. Tap Restart linking for a fresh one.", true);
  });

  eventSource.onerror = () => {
    // poll for results after SSE closes
    pollResults(sid);
  };
}

async function pollResults(sid) {
  let attempts = 0;
  const maxAttempts = 30;
  const poll = async () => {
    try {
      const resp = await fetch(`${API_BASE}/results/${sid}`);
      const data = await resp.json();
      if (data.completed) {
        $("result-count").textContent = data.contact_count;
        $("result-areas").textContent = data.area_count;
        showStep("step-results");
        return;
      }
    } catch {}
    attempts++;
    if (attempts < maxAttempts) {
      setTimeout(poll, 2000);
    } else {
      showError("Timed out waiting for results. Please try again.");
    }
  };
  poll();
}

async function startSession() {
  if (starting) return;
  starting = true;

  const ph = $("qr-placeholder");
  ph.style.display = "grid";
  ph.textContent = "Generating QR code...";
  $("qr-status").classList.add("loading");
  $("qr-status").textContent = "Starting session...";
  showStep("step-qr");

  try {
    const resp = await fetch(`${API_BASE}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!resp.ok) {
      const err = await resp.json();
      showError(err.error || "Failed to start session");
      return;
    }

    const data = await resp.json();
    sessionId = data.sessionId;
    startSSE(sessionId);
  } catch (err) {
    showError(err.message || "Network error");
  } finally {
    starting = false;
  }
}

$("retry-btn").addEventListener("click", () => {
  if (eventSource) eventSource.close();
  eventSource = null;
  sessionId = null;
  $("qr-canvas").style.display = "none";
  $("qr-placeholder").style.display = "grid";
  $("qr-status").textContent = "Waiting for scan...";
  startSession();
});

$("go-dashboard-btn").addEventListener("click", () => {
  window.location.href = "/wabro/app/";
});

$("pairing-get-btn").addEventListener("click", () => requestPairingCode(false));
$("pairing-new-btn").addEventListener("click", () => requestPairingCode(false));
$("pairing-restart-btn").addEventListener("click", () => requestPairingCode(true));
$("pairing-change-btn").addEventListener("click", () => {
  $("pairing-form").classList.remove("hidden");
  $("pairing-for").classList.add("hidden");
  $("pairing-phone").focus();
});
$("pairing-phone").addEventListener("keydown", (e) => {
  if (e.key === "Enter") requestPairingCode(false);
});

startSession();
