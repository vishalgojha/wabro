const state = {
  stats: null,
  campaigns: [],
  contactLists: [],
  contactsByList: new Map(),
  serviceState: "checking"
};

function getApiBase() {
  const { hostname, protocol } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:3002/api/wabro";
  }
  return `${window.location.origin}/api/wabro`;
}

const apiBase = getApiBase();

function setServiceState(nextState, message) {
  state.serviceState = nextState;
  const banner = document.getElementById("service-banner");
  const title = document.getElementById("service-title");
  const copy = document.getElementById("service-message");
  if (!banner || !title || !copy) {
    return;
  }

  banner.dataset.state = nextState;
  if (nextState === "online") {
    title.textContent = "Dashboard service is live";
    copy.textContent = message || "You can access WaBro campaigns, broker lists, and WhatsApp connection status.";
    return;
  }

  if (nextState === "degraded") {
    title.textContent = "Dashboard service is temporarily unavailable";
    copy.textContent = message || "The WaBro product pages still work, but the dashboard is blocked until the backend recovers.";
    return;
  }

  title.textContent = "Checking service status";
  copy.textContent = message || "Verifying whether the WaBro dashboard backend is available.";
}

async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || data.message || "Request failed");
  }

  return response.json();
}

async function checkServiceHealth() {
  try {
    const response = await fetch(`${apiBase}/dashboard/stats`);
    if (response.ok) {
      setServiceState("online");
      return true;
    }

    setServiceState("degraded");
    return false;
  } catch {
    setServiceState("degraded", "The dashboard backend is not reachable right now. You can still review the product pages and setup steps.");
    return false;
  }
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

function renderStats() {
  const statsRoot = document.getElementById("overview-stats");
  const template = document.getElementById("stat-card-template");
  if (!statsRoot || !template) return;

  const stats = state.stats || {
    total_campaigns: 0,
    total_sent: 0,
    total_failed: 0,
    total_skipped: 0,
    total_lists: 0,
    total_contacts: 0
  };

  const cards = [
    ["Campaigns", stats.total_campaigns, "Campaigns in this workspace"],
    ["Sent", stats.total_sent, "Messages marked sent"],
    ["Failed", stats.total_failed, "Failed delivery attempts"],
    ["Skipped", stats.total_skipped, "Contacts skipped in sync logs"],
    ["Contacts", stats.total_contacts, "Contacts in broadcast lists"],
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
  const waRoot = document.getElementById("wa-connection");
  if (!campaignRoot || !waRoot) return;

  campaignRoot.innerHTML = "";
  waRoot.innerHTML = "";

  if (!state.campaigns.length) {
    campaignRoot.appendChild(emptyState("No campaigns yet", "Create a campaign from one of your saved broker lists."));
  } else {
    state.campaigns.slice(0, 8).forEach((campaign) => {
      const done = Number(campaign.sent_count || 0) + Number(campaign.failed_count || 0) + Number(campaign.skipped_count || 0);
      campaignRoot.appendChild(entityCard({
        title: campaign.name,
        meta: `${campaign.status} • ${done}/${campaign.total_contacts || 0} processed`,
        body: `Sent ${campaign.sent_count || 0} • Failed ${campaign.failed_count || 0} • Skipped ${campaign.skipped_count || 0}`,
        tag: campaign.created_at ? new Date(campaign.created_at).toLocaleDateString("en-IN") : "Campaign"
      }));
    });
  }

  waRoot.appendChild(entityCard({
    title: "WhatsApp link",
    meta: "Status",
    body: "Connect your WhatsApp from the setup page to enable campaign delivery.",
    tag: "Web"
  }));
}

function renderBrokerLists() {
  const root = document.getElementById("broker-list");
  if (!root) return;
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
  if (!select) return;
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
  if (!root) return;
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

function renderConnection() {
  const root = document.getElementById("connection-status");
  if (!root) return;
  root.innerHTML = "";

  root.appendChild(emptyState("WhatsApp not linked", "Scan a QR code from the setup page to link your WhatsApp and start sending."));

  const card = entityCard({
    title: "Link your WhatsApp",
    meta: "One-time QR scan",
    body: "Open the setup page, scan the QR code with WhatsApp, and your account becomes the delivery channel.",
    tag: "Web"
  });
  root.appendChild(card);
}

function rerender() {
  renderStats();
  renderOverviewLists();
  renderBrokerLists();
  renderCampaignOptions();
  renderCampaigns();
  renderConnection();
}

async function loadDashboard() {
  const [dashboard, campaigns, lists] = await Promise.all([
    apiFetch("/wabro/dashboard/stats"),
    apiFetch("/wabro/campaigns"),
    apiFetch("/wabro/contacts")
  ]);

  state.stats = dashboard?.stats || null;
  state.campaigns = Array.isArray(campaigns?.campaigns) ? campaigns.campaigns : [];
  state.contactLists = Array.isArray(lists?.lists) ? lists.lists : [];

  setServiceState("online");
  rerender();
}

function showWorkspace() {
  document.getElementById("workspace-shell").classList.remove("hidden");
  document.getElementById("workspace-shell").scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideWorkspace() {
  document.getElementById("workspace-shell").classList.add("hidden");
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

function bindUi() {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => activateSection(button.dataset.section));
  });

  document.querySelectorAll("[data-open-form]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = document.getElementById(button.dataset.openForm);
      form.classList.toggle("hidden");
    });
  });

  document.getElementById("open-workspace-btn").addEventListener("click", showWorkspace);
  document.getElementById("close-workspace-btn").addEventListener("click", hideWorkspace);

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
}

async function init() {
  bindUi();

  await checkServiceHealth();

  try {
    await loadDashboard();
    showWorkspace();
  } catch {
    setServiceState("degraded", "The dashboard could not load. The backend may be unavailable right now.");
  }
}

init();
