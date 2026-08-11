# WaBro — WhatsApp Broadcast for Brokers

Send bulk WhatsApp messages with human-like timing. Built for real estate brokers, agents, and sales teams.

WaBro is a fully web-based product:
- **Web control panel** — broker, listing, and campaign management
- **QR onboarding** — link WhatsApp from the browser (no app installation)
- **Backend delivery** — messages sent from the server via the linked WhatsApp account

## Features

- **Bulk WhatsApp Broadcast** — Send personalised messages to thousands of contacts automatically
- **Smart Lists** — Auto-filter group contacts by keywords (broker, agent, ea, etc.) using area matching
- **QR Link** — Connect your WhatsApp account by scanning a QR code from the browser
- **Campaign Dashboard** — Track sent, pending, failed in real time
- **Broadcast Lists** — Save and reuse contact lists. Import from CSV or paste broker rows
- **Human-like Timing** — Random delays, burst guard, warmup to avoid bans
- **Backend Delivery** — Messages sent through the server using your linked WhatsApp account

## Pages

- Landing: `/`
- Web control panel: `/app/`
- Sign in: `/app/auth`
- WhatsApp QR onboarding: `/app/setup`

## Setup

1. Sign in with your PropAI account
2. Start your 7-day free trial
3. Scan the QR code to link your WhatsApp
4. Import or build a contact list
5. Compose and start a campaign

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
- **AI:** Gemini REST API (optional)

## License

7-day free trial, then paid license (₹499 one-time).

## Partner

[PropAI](https://app.propai.live) — List your properties and get buyer leads.
