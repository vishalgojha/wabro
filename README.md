# WaBro — WhatsApp Broadcast for Brokers

Send bulk WhatsApp messages with human-like timing. Built for real estate brokers, agents, and sales teams.

WaBro now has two product surfaces:

- Android app as the WhatsApp execution client
- Web control panel served at `/app/` for brokers, listings, campaigns, device status, and response tracking

## Features

- **Bulk WhatsApp Broadcast** — Send personalised messages to thousands of contacts automatically
- **Smart Lists** — Auto-filter phonebook contacts by keywords (broker, agent, ea, etc.)
- **Group Contact Scraper** — Extract participant names and numbers from WhatsApp groups
- **AI-Powered Skills** — Translate, rewrite, and smart-caption messages via Gemini AI (optional)
- **Campaign Dashboard** — Track sent, pending, failed messages in real time
- **Broadcast Lists** — Save and reuse contact lists. Import from CSV, phonebook, or groups
- **Human-like Timing** — Random delays, burst guard, warmup to avoid bans
- **Foreground Service** — Keeps broadcasting even when app is in background
- **Sender Account** — Choose WhatsApp or WhatsApp Business

## Download

[Download APK (v1.0.0)](https://github.com/vishalgojha/wabro/releases/download/v1.0.0/WaBro_v1.0.0_signed.apk)

Landing page: [https://vishalgojha.github.io/wabro/](https://vishalgojha.github.io/wabro/)
Web control panel: `/app/` on the deployed domain

## Requirements

- Android 8.0 (API 26) or higher
- WhatsApp or WhatsApp Business installed
- Accessibility Service permission enabled for WaBro
- Battery optimization disabled (recommended)

## Setup

1. Install the APK
2. Open WaBro → Grant required permissions (Accessibility, Battery, Overlay)
3. Configure your sender account (WhatsApp / WhatsApp Business)
4. Import or build a contact list
5. Compose your campaign message
6. Start broadcasting

## Current Handoff Notes

- The current Android source still ships the old accessibility-service execution path. This is confirmed in `app/src/main/AndroidManifest.xml` via `.service.WhatsAppAccessibilityService`, `android.permission.BIND_ACCESSIBILITY_SERVICE`, `android.accessibilityservice`, and `@xml/accessibility_service_config`.
- Supporting runtime code still depends on that path, including `WhatsAppAccessibilityService.kt`, `AppValidator.kt`, `DashboardSyncManager.kt`, and `BroadcastForegroundService.kt`.
- The intended migration away from accessibility has not been completed yet. Do not treat the current APK/build as Play-Store-safe or aligned with the non-accessibility target architecture.
- Next session should decide and implement the replacement send model first: official WhatsApp API, user-confirmed send flow, deep-link/share-sheet assisted sending, or another explicit non-accessibility path.
- After that decision, remove the accessibility service from manifest, permissions, resources, validation checks, and any broadcast execution path that still assumes background UI driving.
- Backend/web already appears to support location-aware broadcast list primitives, but Android-side baked-in support for prebuilt area lists still needs explicit verification in the source/UI flow.

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

## License

Paid license required after 3-day trial. One-time payment of ₹499.

## Partner

[PropAI](https://app.propai.live) — List your properties and get buyer leads.
