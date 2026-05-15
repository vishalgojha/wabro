const storageKey = "wabro-control-panel-v2";

const defaultState = {
  brokers: [],
  listings: [],
  devices: [],
  campaigns: [],
  responses: []
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

function emptyState(title, text, actionLabel) {
  const card = document.createElement("article");
  card.className = "empty-state";
  card.innerHTML = `
    <div class="eyebrow">No live data</div>
    <h4>${title}</h4>
    <p>${text}</p>
    ${actionLabel ? `<button class="secondary-btn" type="button">${actionLabel}</button>` : ""}
  `;
  if (actionLabel) {
    card.querySelector("button").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }
  return card;
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

function renderStats() {
  const statsRoot = document.getElementById("overview-stats");
  const template = document.getElementById("stat-card-template");
  const hotResponses = state.responses.filter((item) => item.intentLevel === "HOT").length;
  const closedDeals = state.responses.filter((item) => item.dealClosed).length;
  const totalDealValue = state.responses.reduce((sum, item) => sum + Number(item.dealValue || 0), 0);

  const cards = [
    ["Brokers", state.brokers.length, "Live or manually entered broker records"],
    ["Listings", state.listings.length, "Inventory attached to this workspace"],
    ["Campaigns", state.campaigns.length, "Campaigns visible in the browser"],
    ["Hot Leads", hotResponses, "High-intent replies received"],
    ["Closed Deals", closedDeals, "Deals marked as won"],
    ["Deal Value", formatCurrency(totalDealValue), "Aggregate tracked value"]
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
    campaignRoot.appendChild(
      emptyState(
        "No campaigns yet",
        "This panel is no longer seeded with fake campaign activity. Push real campaign data from a backend or add manual entries while the sync contract is being built.",
        "Review Setup"
      )
    );
  } else {
    state.campaigns.slice().reverse().forEach((campaign) => {
      const listing = byId(state.listings, campaign.listingId);
      campaignRoot.appendChild(
        entityCard({
          title: campaign.name,
          meta: `${campaign.status} • ${campaign.sent}/${campaign.total} sent`,
          body: listing ? `${listing.name}, ${listing.city}` : "No listing attached",
          tag: campaign.createdAt
        })
      );
    });
  }

  if (!state.devices.length) {
    deviceRoot.appendChild(
      emptyState(
        "No devices connected",
        "Android execution devices will appear here once a real registration and sync endpoint exists. The current Android API client in this repo still returns empty results.",
        ""
      )
    );
  } else {
    state.devices.forEach((device) => {
      deviceRoot.appendChild(
        entityCard({
          title: device.name,
          meta: `${device.status} • Battery ${device.battery}`,
          body: `Last seen ${device.lastSeen}`,
          tag: "Android"
        })
      );
    });
  }
}

function renderCollection(rootId, items, mapper, emptyTitle, emptyText, emptyAction = "") {
  const root = document.getElementById(rootId);
  root.innerHTML = "";

  if (!items.length) {
    root.appendChild(emptyState(emptyTitle, emptyText, emptyAction));
    return;
  }

  items.forEach((item) => root.appendChild(mapper(item)));
}

function renderBrokers() {
  renderCollection(
    "broker-list",
    state.brokers,
    (broker) =>
      entityCard({
        title: broker.name,
        meta: broker.phone,
        body: broker.locality || "No locality added",
        tag: "Broker"
      }),
    "No brokers yet",
    "Start with a real broker list, or add a few manually for testing while the shared backend is being designed."
  );
}

function renderListings() {
  renderCollection(
    "listing-list",
    state.listings,
    (listing) =>
      entityCard({
        title: listing.name,
        meta: listing.city,
        body: listing.project || "No project tag",
        tag: "Listing"
      }),
    "No listings yet",
    "Listings should come from the same data source as your broker operations. Right now this web app has no live PropAI or WaBro inventory connection."
  );
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
  renderCollection(
    "campaign-list",
    state.campaigns,
    (campaign) => {
      const listing = byId(state.listings, campaign.listingId);
      const device = byId(state.devices, campaign.deviceId);
      return entityCard({
        title: campaign.name,
        meta: `${campaign.status} • ${campaign.sent}/${campaign.total} sent`,
        body: `${listing ? listing.name : "No listing"} • ${device ? device.name : "No device"}`,
        tag: "Campaign"
      });
    },
    "No campaigns created",
    "This screen is ready for real campaign orchestration, but the Android-side API client is still a stub and there is no server contract in this repo yet."
  );
}

function renderDevices() {
  renderCollection(
    "device-list",
    state.devices,
    (device) =>
      entityCard({
        title: device.name,
        meta: `${device.status} • ${device.battery}`,
        body: `Last seen ${device.lastSeen}`,
        tag: "Device"
      }),
    "No devices available",
    "Device visibility depends on backend registration and polling APIs. Those endpoints are not implemented in this repository today."
  );
}

function responseClass(intent) {
  if (intent === "HOT") return "status-hot";
  if (intent === "WARM") return "status-warm";
  return "status-cold";
}

function renderResponses() {
  const root = document.getElementById("response-list");
  root.innerHTML = "";

  if (!state.responses.length) {
    root.appendChild(
      emptyState(
        "No broker responses yet",
        "Response analytics will stay empty until campaign execution and response ingestion are connected to a real backend.",
        ""
      )
    );
    return;
  }

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
        <p class="entity-meta">${response.responseText}</p>
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
