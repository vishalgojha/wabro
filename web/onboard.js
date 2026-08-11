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

const $ = (id) => document.getElementById(id);

function showStep(id) {
  document.querySelectorAll(".onboard-card").forEach((el) => el.classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function renderQR(qrText) {
  const canvas = $("qr-canvas");
  const placeholder = $("qr-placeholder");
  canvas.style.display = "block";
  placeholder.style.display = "none";

  const qr = new URLSearchParams();
  qr.set("cht", "qr");
  qr.set("chs", "256x256");
  qr.set("chl", qrText);
  qr.set("choe", "UTF-8");
  canvas.innerHTML = `<img src="https://chart.googleapis.com/chart?${qr.toString()}" alt="QR Code" width="256" height="256" />`;
}

function showError(msg) {
  $("error-message").textContent = msg;
  showStep("step-error");
}

function startSSE(sid) {
  if (eventSource) eventSource.close();

  const url = `${API_BASE}/status/${sid}?events=1`;
  eventSource = new EventSource(url);

  eventSource.addEventListener("qr", (e) => {
    const data = JSON.parse(e.data);
    renderQR(data.qr);
    $("qr-status").textContent = "QR ready — scan with WhatsApp";
  });

  eventSource.addEventListener("connected", () => {
    showStep("step-scanning");
  });

  eventSource.addEventListener("groups", (e) => {
    const data = JSON.parse(e.data);
    $("scan-progress").textContent = `Found ${data.count} groups. Building broker network...`;
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

startSession();
