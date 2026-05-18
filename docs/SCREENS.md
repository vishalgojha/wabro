# WaBro Android App — Screen & Functionality Reference

Use this document as a prompt to generate UI code (Jetpack Compose, Material 3) for any AI tool.

---

## Architecture Overview

- **Package:** `com.chaoscraft.wablaster`
- **UI:** Jetpack Compose + Material 3
- **DI:** Dagger Hilt
- **DB:** Room (local SQLite)
- **API:** OkHttp + Gson to `https://app.propai.live/api/wabro/`
- **Auth:** JWT tokens via `AuthManager` (SharedPreferences)
- **Payments:** UPI + 7-day auto-trial via `PaymentManager` (SharedPreferences)
- **Backend:** Node.js + Express + SQLite at `app.propai.live`

---

## Screen List (20 screens)

### 1. AuthScreen
**File:** `AuthScreen.kt`
**Purpose:** Sign in / Create account

**Elements:**
- WaBro logo + "WhatsApp Broadcast for Brokers" + "Powered by PropAI"
- Toggle chips: "Sign In" | "Create Account"
- Fields: Full Name (signup only), Email, Password, Confirm Password (signup only)
- Validation: email format, password >= 6 chars, passwords match
- Submit button with loading spinner
- Error text display
- On success → calls `onAuthenticated()` which triggers recomposition in `V2MainActivity`

**Data flow:**
```
AuthScreen → AuthManager.signIn(email, password) → POST /api/wabro/auth/password
AuthScreen → AuthManager.signUp(email, password, name) → POST /api/wabro/auth/password
```

---

### 2. PaywallScreen
**File:** `PaywallScreen.kt`
**Purpose:** License gate — shown after auth if not unlocked

**States:**
- **Trial active** (7 days from install): Prominent "7-Day Free Trial Active" banner with days remaining + "Start Using WaBro" button
- **Trial expired**: UPI QR payment flow (pay ₹499 one-time)
- Both states show: "Backend Delivery" status (always green), Battery Optimization toggle, Notification permission toggle

**Data flow:**
```
PaywallScreen → PaymentManager.isTrialActive() → checks elapsed < 7 days
PaywallScreen → onUnlocked() → PaymentManager.unlock() → V2MainActivity shows MainNavigation
```

---

### 3. HomeScreen (first tab)
**File:** `HomeScreen.kt`
**Purpose:** Marketing / quick-launch dashboard

**Sections:**
- WaBro logo + tagline
- **Quick action cards** (2x2 grid):
  1. "New Campaign" → navigate to Campaigns tab
  2. "Broadcast Lists" → navigate to Brokers/Lists tab
  3. "Dashboard" → navigate to Dashboard tab
  4. "AI Skills" → info/coming soon
- **Key features list:**
  - Bulk WhatsApp Messaging
  - AI-Powered Skills (translate, rewrite, caption)
  - Smart Contact Lists
  - Campaign Tracking
  - Backend Delivery (no accessibility service)
- Navigation buttons to Campaigns tab using navController

---

### 4. CampaignScreen (create + manage)
**File:** `CampaignScreen.kt`
**Purpose:** Create and start a new broadcast campaign

**Elements:**
- Campaign name text field
- Message template text area
- Listing selector dropdown (fetches from `ListingViewModel`)
- Broker selector (checkboxes from phonebook / broadcast lists)
- "Start Campaign" button → calls `CampaignViewModel.createAndStartCampaign()`

**Data flow:**
```
CampaignScreen → CampaignViewModel.createAndStartCampaign()
  → campaignDao.insert(campaign)
  → contactDao.insertAll(contacts)
  → BroadcastForegroundService.start()
  → CampaignManager.startCampaign()
```

---

### 5. CampaignDashboard
**File:** `CampaignDashboard.kt`
**Purpose:** Multi-step campaign creation wizard (rich version)

**Steps:**
1. Campaign name input
2. Message template with preview
3. Media attachment picker
4. Target broadcast list picker
5. Skills configuration panel (toggles for AI Rewrite, Translate, Smart Caption, Spin, Warmup)
6. Schedule picker (immediate / scheduled)
7. Review & launch

---

### 6. CampaignDashboardScreen
**File:** `CampaignDashboardScreen.kt`
**Purpose:** Thin wrapper hosting `CampaignDashboard` within NavHost navigation

---

### 7. CampaignOverviewScreen
**File:** `CampaignOverviewScreen.kt`
**Purpose:** List all campaigns with real-time status

**Elements:**
- LazyColumn of campaign cards
- Each card: name, status chip (Running/Paused/Completed/Failed), progress bar, sent/total count
- Action buttons: Start, Pause, Stop per campaign
- Tap card → navigate to CampaignDashboard

**Data flow:**
```
CampaignOverviewScreen → CampaignViewModel.getAllCampaigns()
  → campaignDao.getAll() (Flow → collectAsState)
```

---

### 8. CampaignOutcomeStats
**File:** `CampaignOutcomeStats.kt`
**Purpose:** Data class for aggregated campaign outcome metrics

**Fields:** `totalResponses`, `hotLeads`, `warmLeads`, `coldLeads`, `dealsClosed`, `totalDealValue`

---

### 9. BrokerListScreen
**File:** `BrokerListScreen.kt`
**Purpose:** Browse and search brokers / contacts

**Elements:**
- Search bar
- LazyColumn of broker cards (name, phone, group memberships)
- FAB to add broker
- Tap → navigate to BrokerDetailScreen

**Data flow:**
```
BrokerListScreen → BrokerViewModel.loadBrokers() → BrokerDao.getAll()
```

---

### 10. BrokerDetailScreen
**File:** `BrokerDetailScreen.kt`
**Purpose:** View single broker details

**Elements:**
- Name, phone, area, specialization
- Group memberships list
- Campaign history (responses, deals)
- Edit button → navigate to BrokerEditScreen

---

### 11. BrokerEditScreen
**File:** `BrokerEditScreen.kt`
**Purpose:** Create / edit broker contact

**Elements:**
- Name, phone, area, specialization, notes fields
- Save / Cancel buttons

---

### 12. ListingManagerScreen
**File:** `ListingManagerScreen.kt`
**Purpose:** Manage property listings

**Elements:**
- LazyColumn of listing cards (name, project, area, price, status)
- FAB to add listing
- Each card: edit/delete actions

---

### 13. ResponseDashboardScreen
**File:** `ResponseDashboardScreen.kt`
**Purpose:** View all campaign responses with filtering

**Elements:**
- Filter chips: All / Hot Leads / Warm / Cold
- Response list with contact name, phone, response text, intent score
- Tap → navigate to LeadDetailScreen

---

### 14. LeadDetailScreen
**File:** `LeadDetailScreen.kt`
**Purpose:** View single lead details from campaign response

**Elements:**
- Contact info (name, phone)
- Response text
- Intent classification (Hot/Warm/Cold)
- Score breakdown
- Actions: Mark as deal, Add note, Call, WhatsApp

---

### 15. BroadcastListsScreen
**File:** `BroadcastListsScreen.kt`
**Purpose:** Manage reusable broadcast contact lists

**Elements:**
- Header with action buttons: "Group" (future), "Smart" (keyword filter from phonebook), "New" (manual)
- Empty state: helpful message + "Smart List" and "New List" buttons
- List cards: name, contact count, view/use/delete actions
- SmartListDialog: keyword input → filters phonebook contacts → creates list (chunked into groups of 100)
- ListDetailSheet: view contacts, import CSV, import from phonebook, manual add

**Data flow:**
```
BroadcastListsScreen → BroadcastListDao.getAllFlow() → collectAsState
Smart List → phonebook ContentResolver query → BroadcastListContactDao.insertAll()
CSV Import → CsvImporter.import() → BroadcastListContactDao.insertAll()
```

---

### 16. SettingsScreen
**File:** `SettingsScreen.kt`
**Purpose:** App configuration

**Sections:**
- **Profile/License:** App name, license status (Licensed ✅ / Free), install date
- **Sender Account:** WhatsApp / WhatsApp Business selector with SenderPickerDialog
- **Permissions:** Backend Delivery (always enabled), Battery Optimization (toggle), Notifications (toggle, Android 13+)
- **AI Settings:** Gemini API key text field with validation
- **About:** Version (BuildConfig), "Landing Page" button → opens WebView
- **Crash Logs:** View / Delete / Share logs

---

### 17. NavTabs
**File:** `NavTabs.kt`
**Purpose:** Bottom navigation tab definitions

**Tabs:** Home, Brokers, Listings, Campaigns, Dashboard, Settings

**Order:** 6 tabs with icons:
1. Home (`Icons.Default.Home`)
2. Brokers (`Icons.Default.People`)
3. Listings (`Icons.Default.HomeWork`)
4. Campaigns (`Icons.Default.Campaign`)
5. Dashboard (`Icons.Default.Dashboard`)
6. Settings (`Icons.Default.Settings`)

---

### 18. MainNavigation
**File:** `MainNavigation.kt`
**Purpose:** Root navigation graph

**Structure:**
- `Scaffold` with bottom `NavigationBar`
- `NavHost` with `startDestination = NavTab.Home.route`
- Back press: double-tap to exit, single pop back stack
- Routes: Home, Brokers, Broker/{id}, Broker/edit, Broker/edit/{id}, Listings, Campaigns, CampaignDashboard/{id}, Dashboard, Settings

**Injections:**
- `BrokerViewModel` (hiltViewModel)
- `ListingViewModel` (hiltViewModel)
- `CampaignViewModel` (hiltViewModel)

---

### 19. ContactPickerDialog
**File:** `ContactPickerDialog.kt`
**Purpose:** Dialog to select contacts from device phonebook

**Elements:**
- Searchable contact list from `ContentResolver` (ContactsContract)
- Contact row: name, phone number
- Multi-select with checkboxes
- "Import" button → returns selected contacts
- Requests `READ_CONTACTS` permission if not granted

---

### 20. SenderPickerDialog
**File:** `SenderPickerDialog.kt`
**Purpose:** Choose which WhatsApp sender to use

**Elements:**
- List of configured sender devices from SenderConfig
- Each item: device name, status (connected/disconnected)
- Select → calls `SenderConfig.setActiveSender()`
- Option to add new sender → triggers onboarding flow

---

## Navigation Flow

```
App Launch
  ├─ AuthScreen (if not logged in)
  │    └─ onAuthenticated → [check paywall]
  ├─ PaywallScreen (if trial expired and not unlocked)
  │    └─ onUnlocked → [show app]
  └─ MainNavigation (6 tabs)
       ├─ HomeScreen (start destination)
       │    ├─ "New Campaign" → tab: Campaigns
       │    ├─ "Broadcast Lists" → tab: Brokers
       │    └─ "Dashboard" → tab: Dashboard
       ├─ Brokers
       │    ├─ BrokerListScreen → BrokerDetailScreen → BrokerEditScreen
       │    └─ BroadcastListsScreen (accessed via separate route)
       ├─ Listings → ListingManagerScreen
       ├─ Campaigns → CampaignScreen → CampaignDashboard
       │    └─ CampaignOverviewScreen → CampaignDashboard
       ├─ Dashboard → CampaignOverviewScreen → ResponseDashboardScreen → LeadDetailScreen
       └─ Settings → SettingsScreen
```

---

## API Endpoints (Backend at app.propai.live/api/wabro/)

```
POST   /auth/password              # Login/signup (proxied to PropAI)
POST   /auth/refresh               # Refresh token
GET    /auth/me                    # Current user info
GET    /app-version                # Version check (versionCode, versionName, apkUrl)
GET    /dashboard/stats?email=     # Aggregate stats
GET    /contacts?email=            # Broadcast lists
GET    /contacts/:listName         # Contacts in a list
GET    /campaigns                  # Campaign list (stub)
```

---

## Key State Management

- **Auth:** `AuthManager.isLoggedIn()` → SharedPreferences token
- **Paywall:** `PaymentManager.isUnlocked` → SharedPreferences unlock flag OR `elapsed < 7 days`
- **Lists:** `BroadcastListDao.getAllFlow()` → Room `Flow` (reactive)
- **Campaigns:** `CampaignDao.getAll()` → Room `Flow`
- **API calls:** `WaBroApiClient` → OkHttp on `Dispatchers.IO`
- **Nav state:** `rememberNavController()` + `currentTab` (mutableIntStateOf)
