# WaBro — WhatsApp Broadcast for Brokers

Send bulk WhatsApp messages with human-like timing. Built for real estate brokers, agents, and sales teams.

WaBro has two surfaces:
- **Android app** — WhatsApp execution client
- **Web control panel** — broker, listing, campaign management at `/app/`

## Features

- **Bulk WhatsApp Broadcast** — Send personalised messages to thousands of contacts automatically
- **Smart Lists** — Auto-filter phonebook contacts by keywords (broker, agent, ea, etc.)
- **AI-Powered Skills** — Translate, rewrite, and smart-caption messages via Gemini AI (optional)
- **Campaign Dashboard** — Track sent, pending, failed, replied in real time
- **Broadcast Lists** — Save and reuse contact lists. Import from CSV or phonebook
- **Human-like Timing** — Random delays, burst guard, warmup to avoid bans
- **Backend Delivery** — Messages sent through server — no accessibility service needed

## Download

Latest APK is built automatically on every push. Download from [GitHub Actions](https://github.com/vishalgojha/wabro/actions) → latest run → **Artifacts → app-debug**.

To install: unzip the downloaded artifact and install `app-debug.apk`.

Landing page: [https://vishalgojha.github.io/wabro/](https://vishalgojha.github.io/wabro/)

## Requirements

- Android 8.0 (API 26) or higher
- WhatsApp or WhatsApp Business installed

## Setup

1. Install the APK
2. Sign in with your PropAI account
3. Start your 7-day free trial
4. Configure sender account
5. Import or build a contact list
6. Compose and start a campaign

## Build from Source

```bash
git clone git@github.com:vishalgojha/wabro.git
cd wabro
./gradlew assembleRelease
```

Requires JDK 17 and Android SDK 34.

## Tech Stack

- **Language:** Kotlin
- **UI:** Jetpack Compose (Material 3)
- **DI:** Dagger Hilt
- **Database:** Room
- **Async:** Coroutines + Flow
- **AI:** Gemini REST API (optional)
- **Backend:** Node.js + Express + Baileys + SQLite

## License

7-day free trial, then paid license (₹499 one-time).

## Partner

[PropAI](https://app.propai.live) — List your properties and get buyer leads.
