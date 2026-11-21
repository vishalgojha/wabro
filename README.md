# WaBro — WhatsApp Broadcast for Brokers

Approval-bound WhatsApp outreach for brokers, run from the web. Built for real estate brokers, agents, and sales teams.

WaBro is a fully web-based product:
- **Web control panel** — broker lists, stats, and live WhatsApp connection status
- **Browser onboarding** — link WhatsApp with a pairing code or QR scan (no app installation)
- **Backend delivery** — messages sent from the server via the linked WhatsApp account

## Features

- **Approval-bound batches** — every send batch is tied to an explicit approval reference; ambiguous outcomes park as uncertain and are never auto-retried
- **Explicit recipient lists** — contacts enter only as user-approved lists; group members are never harvested into contacts
- **QR or pairing-code link** — connect WhatsApp from the browser, whichever method you prefer
- **Batch results API** — per-recipient sent / delivered / read / failed / uncertain states
- **Opt-out handling** — inbound STOP / UNSUBSCRIBE / OPT OUT keywords are recorded (never auto-replied to) and honored by future batches
- **Backend Delivery** — messages sent through the server using your linked WhatsApp account

## Current state (honest)

Live and tested:
- Session linking (pairing code + QR), session state endpoint, basic-auth gated panel
- Outreach batch API: preview, create, pause/resume, per-recipient results, opt-out recording
- Panel reads: dashboard stats, broadcast lists, live session status

Not yet wired (UI exists, backend route missing — calls return 404):
- Panel broker import / add-contact POST
- Panel campaign create POST (sending stays through the approval-bound batch API)

## Pages

- Landing: `/`
- Web control panel: `/app/`
- WhatsApp onboarding (pairing code or QR): `/app/setup`

## Setup

1. Open the web control panel (site password required)
2. Link your WhatsApp from the setup page — pairing code or QR
3. Send batches take per-batch recipients through the approved flow; reusable recipient lists are not available yet

The deployment is protected by HTTP basic auth — only people with the password can open the panel or the API.

## Local Development

```bash
cd backend
npm install
node server.js
```

The backend serves the web app at `http://localhost:3002/wabro/app/`.

## Deployment

- Static web assets (`landing/`, `web/`) are served by the Docker `Dockerfile` (static-web-server).
- The backend (`backend/`) runs as a separate container (see `docker-compose.yml`) with Baileys auth persisted in the `wabro-auth` volume.
- Coolify/Hetzner deploy scripts live in `scripts/`.

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS served as static files
- **Backend:** Node.js + Express + Baileys + SQLite

## License

7-day free trial, then paid license (₹499 one-time).

## Partner

[PropAI](https://app.propai.live) — List your properties and get buyer leads.
