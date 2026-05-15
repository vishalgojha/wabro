const sessionStorageKey = "wabro-propai-session";

const state = {
  session: null,
  user: null,
  stats: null,
  campaigns: [],
  contactLists: [],
  contactsByList: new Map()
};

function getApiBase() {
  const { hostname, protocol } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:3001/api";
  }
  if (hostname.endsWith("propai.live")) {
    return `${protocol}//api.propai.live/api`;
  }
  return `${window.location.origin}/api`;
}

const apiBase = getApiBase();

function readStoredSession() {
  try {
    const raw = localStorage.getItem(sessionStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredSession(session) {
  localStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

function clearStoredSession() {
  localStorage.removeItem(sessionStorageKey);
}

async function refreshSessionIfNeeded() {
  const session = state.session;
  if (!session?.refreshToken || !session?.expiresAt || Date.now() < session.expiresAt - 5 * 60_000) {
    return;
  }

  const response = await fetch(`${apiBase}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken })
  });

  if (!response.ok) {
    throw new Error("Session expired");
  }

  const data = await response.json();
  const nextSession = {
    ...session,
    token: data?.session?.access_token,
    refreshToken: data?.session?.refresh_token || session.refreshToken,
    expiresAt: data?.session?.expires_in ? Date.now() + Number(data.session.expires_in) * 1000 : session.expiresAt
  };
  state.session = nextSession;
  saveStoredSession(nextSession);
}

async function apiFetch(path, options = {}) {
  await refreshSessionIfNeeded();
  const headers = {
    "Content-Type": "application/json",
    ...(state.session?.token ? { Authorization: `Bearer ${state.session.token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    logout();
    throw new Error("Session expired");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || data.message || "Request failed");
  }

  return response.json();
}

function entityCard({ title, meta, body, tag }) {
  const card = document.createElement("article");
  card.className = "entity-card";
  card.innerHTML = `
    <div class="entity-tag">${tag}</div>
    <h4>${title}</h4>
    <p class="entity-meta">${meta}</p>
    <p class="entity-meta">${body}</p>
  `;
  return card;
}

function emptyState(title, text) {
  const card = document.createElement("article");
  card.className = "empty-state";
  card.innerHTML = `
    <div class="eyebrow">No data</div>
    <h4>${title}</h4>
    <p>${text}</p>
  `;
  return card;
}

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function renderStats() {
  const statsRoot = document.getElementById("overview-stats");
  const template = document.getElementById("stat-card-template");
  const stats = state.stats || {
    total_campaigns: 0,
    total_sent: 0,
    total_failed: 0,
    total_skipped: 0,
    active_devices: 0,
    total_devices: 0
  };

  const cards = [
    ["Campaigns", stats.total_campaigns, "Campaigns in this workspace"],
    ["Sent", stats.total_sent, "Messages marked sent"],
    ["Failed", stats.total_failed, "Failed delivery attempts"],
    ["Skipped", stats.total_skipped, "Contacts skipped in sync logs"],
    ["Active Devices", stats.active_devices, "Polled in the last 5 minutes"],
    ["Broker Lists", state.contactLists.length, "Saved broadcast lists"]
  ];

  statsRoot.innerHTML = "";
  cards.forEach(([label, value, note]) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".stat-label").textContent = label;
    node.querySelector(".stat-value").textContent = value;
    node.querySelector(".stat-note").textContent = note;
    statsRoot.appendChild(node);
  });
}

function renderOverviewLists() {
  const campaignRoot = document.getElementById("recent-campaigns");
  const deviceRoot = document.getElementById("device-health");

  campaignRoot.innerHTML = "";
  deviceRoot.innerHTML = "";

  if (!state.campaigns.length) {
    campaignRoot.appendChild(emptyState("No campaigns yet", "Create a campaign from one of your saved broker lists."));
  } else {
    state.campaigns.slice(0, 8).forEach((campaign) => {
      const done = Number(campaign.sent_count || 0) + Number(campaign.failed_count || 0) + Number(campaign.skipped_count || 0);
      campaignRoot.appendChild(entityCard({
        title: campaign.name,
        meta: `${campaign.status} • ${done}/${campaign.total_contacts || 0} processed`,
        body: `Sent ${campaign.sent_count || 0} • Failed ${campaign.failed_count || 0} • Skipped ${campaign.skipped_count || 0}`,
        tag: new Date(campaign.created_at).toLocaleDateString("en-IN")
      }));
    });
  }

  const stats = state.stats;
  if (!stats?.total_devices) {
    deviceRoot.appendChild(emptyState("No devices registered", "Devices will appear once the Android client registers with the backend."));
  } else {
    deviceRoot.appendChild(entityCard({
      title: `${stats.active_devices} active of ${stats.total_devices}`,
      meta: "Live device count",
      body: "Detailed per-device metadata is not exposed by the current dashboard endpoint.",
      tag: "Android"
    }));
  }
}

function renderBrokerLists() {
  const root = document.getElementById("broker-list");
  root.innerHTML = "";

  if (!state.contactLists.length) {
    root.appendChild(emptyState("No broker lists yet", "Import a broker list or add a broker manually into a named list."));
    return;
  }

  state.contactLists.forEach((list) => {
    root.appendChild(entityCard({
      title: list.name,
      meta: `${list.count} brokers`,
      body: "Reusable contact list for WaBro campaigns",
      tag: "List"
    }));
  });
}

function renderCampaignOptions() {
  const select = document.getElementById("campaign-contact-list-select");
  select.innerHTML = `<option value="">Choose broker list</option>`;
  state.contactLists.forEach((list) => {
    const option = document.createElement("option");
    option.value = list.name;
    option.textContent = `${list.name} • ${list.count} brokers`;
    select.appendChild(option);
  });
}

function renderCampaigns() {
  const root = document.getElementById("campaign-list");
  root.innerHTML = "";

  if (!state.campaigns.length) {
    root.appendChild(emptyState("No campaigns created", "Create a campaign from one of your imported broker lists."));
    return;
  }

  state.campaigns.forEach((campaign) => {
    const done = Number(campaign.sent_count || 0) + Number(campaign.failed_count || 0) + Number(campaign.skipped_count || 0);
    root.appendChild(entityCard({
      title: campaign.name,
      meta: `${campaign.status} • ${done}/${campaign.total_contacts || 0} processed`,
      body: `Sent ${campaign.sent_count || 0} • Failed ${campaign.failed_count || 0} • Skipped ${campaign.skipped_count || 0}`,
      tag: "Campaign"
    }));
  });
}

function renderDevices() {
  const root = document.getElementById("device-list");
  root.innerHTML = "";

  const stats = state.stats;
  if (!stats?.total_devices) {
    root.appendChild(emptyState("No devices registered", "Open the WaBro Android client and connect it to this backend account."));
    return;
  }

  root.appendChild(entityCard({
    title: `${stats.total_devices} registered devices`,
    meta: `${stats.active_devices} active recently`,
    body: "This backend currently exposes device counts through dashboard stats, not full device cards.",
    tag: "Device"
  }));
}

function rerender() {
  renderStats();
  renderOverviewLists();
  renderBrokerLists();
  renderCampaignOptions();
  renderCampaigns();
  renderDevices();
}

async function loadDashboard() {
  const [me, dashboard, campaigns, lists] = await Promise.all([
    apiFetch("/auth/me"),
    apiFetch("/wabro/dashboard/stats"),
    apiFetch("/wabro/campaigns"),
    apiFetch("/wabro/contacts")
  ]);

  state.user = me?.user || me?.profile || null;
  state.stats = dashboard?.stats || null;
  state.campaigns = Array.isArray(campaigns?.campaigns) ? campaigns.campaigns : [];
  state.contactLists = Array.isArray(lists?.lists) ? lists.lists : [];

  document.getElementById("user-email").textContent = state.user?.email || state.session?.email || "";
  rerender();
}

async function login(email, password) {
  const response = await fetch(`${apiBase}/auth/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "signin", email, password })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.session?.access_token) {
    throw new Error(data.error || "Login failed");
  }

  state.session = {
    email: data?.user?.email || email,
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ? data.session.expires_at * 1000 : data.session.expires_in ? Date.now() + Number(data.session.expires_in) * 1000 : undefined
  };
  saveStoredSession(state.session);
}

function showApp() {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
}

function showAuth() {
  document.getElementById("app-shell").classList.add("hidden");
  document.getElementById("auth-screen").classList.remove("hidden");
}

function logout() {
  state.session = null;
  state.user = null;
  state.stats = null;
  state.campaigns = [];
  state.contactLists = [];
  clearStoredSession();
  showAuth();
}

function activateSection(sectionId) {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.section === sectionId);
  });
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === sectionId);
  });
}

function parseBrokerBulkText(input) {
  return String(input || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", phone = "", locality = ""] = line.split(",").map((part) => part.trim());
      return { name, phone, locality };
    })
    .filter((broker) => broker.name && broker.phone);
}

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => activateSection(button.dataset.section));
});

document.querySelectorAll("[data-open-form]").forEach((button) => {
  button.addEventListener("click", () => {
    const form = document.getElementById(button.dataset.openForm);
    form.classList.toggle("hidden");
  });
});

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";
  try {
    await login(String(form.get("email") || ""), String(form.get("password") || ""));
    await loadDashboard();
    showApp();
  } catch (error) {
    errorEl.textContent = error.message || "Login failed";
  }
});

document.getElementById("logout-btn").addEventListener("click", logout);

document.getElementById("broker-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const listName = String(form.get("list_name") || "").trim();
  const name = String(form.get("name") || "").trim();
  const phone = String(form.get("phone") || "").trim();
  const locality = String(form.get("locality") || "").trim();
  if (!listName || !name || !phone) return;

  await apiFetch("/wabro/contacts", {
    method: "POST",
    body: JSON.stringify({
      list_name: listName,
      contacts: [{ name, phone, locality }]
    })
  });

  event.currentTarget.reset();
  event.currentTarget.classList.add("hidden");
  await loadDashboard();
});

document.getElementById("broker-file").addEventListener("change", async (event) => {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  document.getElementById("broker-bulk-input").value = await file.text();
});

document.getElementById("broker-import-btn").addEventListener("click", async () => {
  const form = document.getElementById("broker-form");
  const listName = String(new FormData(form).get("list_name") || "").trim();
  const input = document.getElementById("broker-bulk-input");
  const status = document.getElementById("broker-import-status");
  if (!listName) {
    status.textContent = "Enter a list name before importing.";
    return;
  }

  const contacts = parseBrokerBulkText(input.value);
  if (!contacts.length) {
    status.textContent = "No valid broker rows found to import.";
    return;
  }

  await apiFetch("/wabro/contacts", {
    method: "POST",
    body: JSON.stringify({
      list_name: listName,
      contacts
    })
  });

  input.value = "";
  document.getElementById("broker-file").value = "";
  status.textContent = `${contacts.length} brokers imported into ${listName}.`;
  await loadDashboard();
});

document.getElementById("campaign-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const listName = String(form.get("listName") || "").trim();
  const name = String(form.get("name") || "").trim();
  const messageTemplate = String(form.get("message_template") || "").trim();
  if (!listName || !name || !messageTemplate) return;

  let contacts = state.contactsByList.get(listName);
  if (!contacts) {
    const data = await apiFetch(`/wabro/contacts/${encodeURIComponent(listName)}`);
    contacts = Array.isArray(data?.contacts) ? data.contacts : [];
    state.contactsByList.set(listName, contacts);
  }

  await apiFetch("/wabro/campaigns", {
    method: "POST",
    body: JSON.stringify({
      name,
      message_template: messageTemplate,
      contacts: contacts.map((contact) => ({ phone: contact.phone, name: contact.name }))
    })
  });

  event.currentTarget.reset();
  event.currentTarget.classList.add("hidden");
  await loadDashboard();
});

async function init() {
  const stored = readStoredSession();
  if (!stored?.token) {
    showAuth();
    return;
  }

  state.session = stored;
  try {
    await loadDashboard();
    showApp();
  } catch {
    logout();
  }
}

init();
