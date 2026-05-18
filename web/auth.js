const API_BASE = (() => {
  const { hostname, protocol } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:3002/api/wabro";
  }
  return `${window.location.origin}/api/wabro`;
})();

const SESSION_KEY = "wabro-session";
let mode = "signin";

const $ = (id) => document.getElementById(id);

function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function showError(msg) {
  $("auth-error").textContent = msg || "";
}

function setBusy(busy) {
  $("auth-submit").disabled = busy;
  $("auth-submit").textContent = busy
    ? (mode === "signin" ? "Signing In..." : "Creating Account...")
    : (mode === "signin" ? "Sign In" : "Create Account");
}

function setMode(newMode) {
  mode = newMode;
  document.querySelectorAll(".auth-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === mode);
  });
  $("field-name").classList.toggle("hidden", mode !== "signup");
  $("field-confirm").classList.toggle("hidden", mode !== "signup");
  $("field-password").autocomplete = mode === "signup" ? "new-password" : "current-password";
  $("auth-submit").textContent = mode === "signin" ? "Sign In" : "Create Account";
  showError("");
}

function redirectPostAuth(email) {
  // if user has already onboarded (session flag), go to dashboard
  const flags = JSON.parse(localStorage.getItem("wabro-flags") || "{}");
  if (flags.onboarded) {
    window.location.href = "/wabro/app/";
    return;
  }
  // check if they have contacts already
  fetch(`${API_BASE}/contacts?email=${encodeURIComponent(email)}`)
    .then((r) => r.json())
    .then((data) => {
      if (data.lists?.length > 0) {
        window.location.href = "/wabro/app/";
      } else {
        window.location.href = "/wabro/app/setup";
      }
    })
    .catch(() => {
      window.location.href = "/wabro/app/";
    });
}

$("tab-signin").addEventListener("click", () => setMode("signin"));
$("tab-signup").addEventListener("click", () => setMode("signup"));

$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");

  const email = $("field-email").value.trim();
  const password = $("field-password").value;
  const name = $("field-name").value.trim();
  const confirm = $("field-confirm").value;

  if (!email || !password) {
    showError("Email and password are required.");
    return;
  }
  if (mode === "signup") {
    if (!name) { showError("Name is required."); return; }
    if (password.length < 6) { showError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { showError("Passwords do not match."); return; }
  }

  setBusy(true);

  try {
    const body = mode === "signin"
      ? { mode: "signin", email, password }
      : { mode: "signup", email, password, name };

    const resp = await fetch(`${API_BASE}/auth/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      showError(data?.error || data?.message || (resp.status === 401 ? "Invalid email or password." : "Server error. Try again."));
      setBusy(false);
      return;
    }

    if (!data?.session?.access_token) {
      showError("No session returned. Try again.");
      setBusy(false);
      return;
    }

    saveSession({
      email: data?.user?.email || email,
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at
        ? data.session.expires_at * 1000
        : data.session.expires_in
          ? Date.now() + Number(data.session.expires_in) * 1000
          : undefined,
    });

    redirectPostAuth(email);
  } catch (err) {
    showError(err.message || "Network error. Check your connection.");
    setBusy(false);
  }
});

// if already logged in, skip to dashboard or setup
const existing = getSession();
if (existing?.token) {
  redirectPostAuth(existing.email);
}
