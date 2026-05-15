const storageKey = "wabro-control-panel-v1";

const defaultState = {
  brokers: [
    { id: 1, name: "Rohan Mehta", phone: "+91 98190 00111", locality: "Andheri West" },
    { id: 2, name: "Aarti Shah", phone: "+91 98190 00222", locality: "Thane" },
    { id: 3, name: "Imran Khan", phone: "+91 98190 00333", locality: "Navi Mumbai" }
  ],
  listings: [
    { id: 1, name: "Skyline Residences", city: "Mumbai", project: "Tower A" },
    { id: 2, name: "Palm Crest", city: "Pune", project: "Phase 2" }
  ],
  devices: [
    { id: "device-01", name: "Samsung M34", status: "Active", battery: "78%", lastSeen: "2 min ago" },
    { id: "device-02", name: "OnePlus Nord", status: "Paused", battery: "51%", lastSeen: "14 min ago" }
  ],
  campaigns: [
    {
      id: 1,
      name: "Mumbai Launch Push",
      listingId: 1,
      deviceId: "device-01",
      message: "Launching Skyline Residences this week. Interested brokers reply for deck and pricing.",
      status: "RUNNING",
      sent: 88,
      total: 120,
      createdAt: "Today"
    },
    {
      id: 2,
      name: "Pune Investor Update",
      listingId: 2,
      deviceId: "device-02",
      message: "Palm Crest investor inventory available. Reply if you want unit sheet and commission details.",
      status: "PAUSED",
      sent: 45,
      total: 90,
      createdAt: "Yesterday"
    }
  ],
  responses: [
    {
      id: 1,
      campaignId: 1,
      brokerName: "Rohan Mehta",
      brokerPhone: "+91 98190 00111",
      intentLevel: "HOT",
      responseText: "Send pricing and site visit slot for Saturday.",
      hotLeadScore: 92,
      followUpSent: false,
      dealClosed: false,
      dealValue: 0
    },
    {
      id: 2,
      campaignId: 1,
      brokerName: "Aarti Shah",
      brokerPhone: "+91 98190 00222",
      intentLevel: "WARM",
      responseText: "Need commission structure before I share with clients.",
      hotLeadScore: 67,
      followUpSent: true,
      dealClosed: false,
      dealValue: 0
    },
    {
      id: 3,
      campaignId: 2,
      brokerName: "Imran Khan",
      brokerPhone: "+91 98190 00333",
      intentLevel: "HOT",
      responseText: "I have one investor, closeable this week if payment plan works.",
      hotLeadScore: 89,
      followUpSent: false,
      dealClosed: true,
      dealValue: 12500000
    }
  ]
};

let state = loadState();

function loadState() {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

function byId(items, id) {
  return items.find((item) => String(item.id) === String(id));
}

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function renderStats() {
  const statsRoot = document.getElementById("overview-stats");
  const template = document.getElementById("stat-card-template");
  const hotResponses = state.responses.filter((item) => item.intentLevel === "HOT").length;
  const closedDeals = state.responses.filter((item) => item.dealClosed).length;
  const totalDealValue = state.responses.reduce((sum, item) => sum + Number(item.dealValue || 0), 0);

  const cards = [
    ["Brokers", state.brokers.length, "Active broker records"],
    ["Listings", state.listings.length, "Campaign-ready inventory"],
    ["Campaigns", state.campaigns.length, "Managed from web"],
    ["Hot Leads", hotResponses, "High-intent replies"],
    ["Closed Deals", closedDeals, "Converted from responses"],
    ["Deal Value", formatCurrency(totalDealValue), "Tracked from browser"]
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
  state.campaigns.slice().reverse().forEach((campaign) => {
    const listing = byId(state.listings, campaign.listingId);
    campaignRoot.appendChild(entityCard({
      title: campaign.name,
      meta: `${campaign.status} • ${campaign.sent}/${campaign.total} sent`,
      body: listing ? `${listing.name}, ${listing.city}` : "No listing attached",
      tag: campaign.createdAt
    }));
  });

  deviceRoot.innerHTML = "";
  state.devices.forEach((device) => {
    deviceRoot.appendChild(entityCard({
      title: device.name,
      meta: `${device.status} • Battery ${device.battery}`,
      body: `Last seen ${device.lastSeen}`,
      tag: "Android"
    }));
  });
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

function renderBrokers() {
  const root = document.getElementById("broker-list");
  root.innerHTML = "";
  state.brokers.forEach((broker) => {
    root.appendChild(entityCard({
      title: broker.name,
      meta: broker.phone,
      body: broker.locality || "No locality added",
      tag: "Broker"
    }));
  });
}

function renderListings() {
  const root = document.getElementById("listing-list");
  root.innerHTML = "";
  state.listings.forEach((listing) => {
    root.appendChild(entityCard({
      title: listing.name,
      meta: listing.city,
      body: listing.project || "No project tag",
      tag: "Listing"
    }));
  });
}

function renderCampaignOptions() {
  const listingSelect = document.getElementById("campaign-listing-select");
  const deviceSelect = document.getElementById("campaign-device-select");

  listingSelect.innerHTML = `<option value="">Choose listing</option>`;
  deviceSelect.innerHTML = `<option value="">Choose device</option>`;

  state.listings.forEach((listing) => {
    const option = document.createElement("option");
    option.value = listing.id;
    option.textContent = `${listing.name} • ${listing.city}`;
    listingSelect.appendChild(option);
  });

  state.devices.forEach((device) => {
    const option = document.createElement("option");
    option.value = device.id;
    option.textContent = `${device.name} • ${device.status}`;
    deviceSelect.appendChild(option);
  });
}

function renderCampaigns() {
  const root = document.getElementById("campaign-list");
  root.innerHTML = "";
  state.campaigns.forEach((campaign) => {
    const listing = byId(state.listings, campaign.listingId);
    const device = byId(state.devices, campaign.deviceId);
    root.appendChild(entityCard({
      title: campaign.name,
      meta: `${campaign.status} • ${campaign.sent}/${campaign.total} sent`,
      body: `${listing ? listing.name : "No listing"} • ${device ? device.name : "No device"}`,
      tag: "Campaign"
    }));
  });
}

function renderDevices() {
  const root = document.getElementById("device-list");
  root.innerHTML = "";
  state.devices.forEach((device) => {
    root.appendChild(entityCard({
      title: device.name,
      meta: `${device.status} • ${device.battery}`,
      body: `Last seen ${device.lastSeen}`,
      tag: "Device"
    }));
  });
}

function responseClass(intent) {
  if (intent === "HOT") return "status-hot";
  if (intent === "WARM") return "status-warm";
  return "status-cold";
}

function renderResponses() {
  const root = document.getElementById("response-list");
  root.innerHTML = "";

  state.responses
    .slice()
    .sort((a, b) => Number(b.hotLeadScore) - Number(a.hotLeadScore))
    .forEach((response) => {
      const campaign = byId(state.campaigns, response.campaignId);
      const card = document.createElement("article");
      card.className = "response-card";
      card.innerHTML = `
        <div class="response-head">
          <div>
            <div class="response-tag ${responseClass(response.intentLevel)}">${response.intentLevel}</div>
            <h4>${response.brokerName || response.brokerPhone}</h4>
            <p class="response-meta">${campaign ? campaign.name : "Unassigned campaign"} • Score ${response.hotLeadScore}</p>
          </div>
          <div class="response-meta">${response.dealClosed ? "Deal closed" : response.followUpSent ? "Follow-up done" : "Action pending"}</div>
        </div>
        <p class="response-text">${response.responseText}</p>
        <div class="response-actions">
          ${response.followUpSent ? `<span class="secondary-btn">Follow-up sent</span>` : `<button class="secondary-btn" data-action="followup" data-id="${response.id}">Mark follow-up</button>`}
          ${response.dealClosed ? `<span class="secondary-btn">${formatCurrency(response.dealValue)}</span>` : `<input type="number" min="0" step="1" placeholder="Deal value" data-input="dealValue" data-id="${response.id}" /><button class="primary-btn" data-action="deal" data-id="${response.id}">Close deal</button>`}
        </div>
      `;
      root.appendChild(card);
    });
}

function rerender() {
  renderStats();
  renderOverviewLists();
  renderBrokers();
  renderListings();
  renderCampaignOptions();
  renderCampaigns();
  renderDevices();
  renderResponses();
  saveState();
}

function activateSection(sectionId) {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.section === sectionId);
  });
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === sectionId);
  });
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

document.getElementById("broker-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.brokers.push({
    id: nextId(state.brokers),
    name: form.get("name").trim(),
    phone: form.get("phone").trim(),
    locality: form.get("locality").trim()
  });
  event.currentTarget.reset();
  event.currentTarget.classList.add("hidden");
  rerender();
});

document.getElementById("listing-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.listings.push({
    id: nextId(state.listings),
    name: form.get("name").trim(),
    city: form.get("city").trim(),
    project: form.get("project").trim()
  });
  event.currentTarget.reset();
  event.currentTarget.classList.add("hidden");
  rerender();
});

document.getElementById("campaign-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.campaigns.push({
    id: nextId(state.campaigns),
    name: form.get("name").trim(),
    listingId: Number(form.get("listingId")),
    deviceId: form.get("deviceId"),
    message: form.get("message").trim(),
    status: "DRAFT",
    sent: 0,
    total: state.brokers.length,
    createdAt: "Just now"
  });
  event.currentTarget.reset();
  event.currentTarget.classList.add("hidden");
  rerender();
});

document.getElementById("response-list").addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const responseId = Number(target.dataset.id);
  const response = byId(state.responses, responseId);
  if (!response) return;

  if (target.dataset.action === "followup") {
    response.followUpSent = true;
  }

  if (target.dataset.action === "deal") {
    const input = document.querySelector(`[data-input="dealValue"][data-id="${responseId}"]`);
    const value = Number(input?.value || 0);
    if (value > 0) {
      response.dealClosed = true;
      response.dealValue = value;
    }
  }

  rerender();
});

rerender();
