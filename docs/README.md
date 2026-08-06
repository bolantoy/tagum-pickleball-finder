# Tagum Pickleball Finder — Complete Documentation

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Installation Guide](#installation-guide)
5. [Backend Setup](#backend-setup)
6. [Frontend Setup](#frontend-setup)
7. [Supabase Setup](#supabase-setup)
8. [Running Locally](#running-locally)
9. [Running in Replit](#running-in-replit)
10. [Adding a New Court Parser](#adding-a-new-court-parser)
11. [Environment Variables](#environment-variables)
12. [Deployment Guide](#deployment-guide)
13. [Troubleshooting](#troubleshooting)
14. [Future Features](#future-features)

---

## Project Overview

**Tagum Pickleball Finder** is a mobile app that lets users in Tagum City, Davao del Norte, Philippines search for available pickleball courts in real time.

**Key design decisions:**

- The app **never stores booking schedules** in its own database. All availability data is fetched live from court booking websites whenever a user searches.
- Court metadata (name, address, GPS, contact info) is stored in Supabase.
- A modular **parser architecture** makes it trivial to add new courts.
- The backend aggregates results from multiple sites in parallel and merges them into one response.

---

## Architecture

```
tagum-pickleball-finder/
├── frontend/          # React Native / Expo mobile app
├── backend/           # Express.js REST API
├── shared/            # TypeScript types shared by both
├── database/          # Supabase SQL schema and seed files
├── assets/            # App icon, splash screen
└── docs/              # This documentation
```

### Data Flow

```
Mobile App
  │
  ├─ GET /api/v1/courts         → Supabase (court metadata)
  │
  └─ GET /api/v1/availability?date=YYYY-MM-DD
           │
           └─ Backend spawns parallel scrapers:
               ├─ PickleballersParser  → scrapes website A
               ├─ PickleCityParser     → scrapes website B (Playwright)
               └─ HideoutParser        → scrapes website C
           │
           └─ Merges results → JSON response
```

### Key Principle: No Schedule Storage

The backend never persists schedule data to a database. Every `/availability` request fetches fresh data from the source websites. This ensures accuracy but means response times depend on external site speeds (typically 2–10 seconds).

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18.0.0 | https://nodejs.org |
| npm | ≥ 9.0.0 | Bundled with Node.js |
| Expo CLI | Latest | `npm install -g expo-cli` |
| Git | Any | https://git-scm.com |
| Supabase account | — | https://supabase.com (free tier works) |
| Google Maps API key | — | https://console.cloud.google.com |

For Playwright (needed by some parsers):

```bash
cd backend
npx playwright install chromium
```

---

## Installation Guide

### Clone and install all dependencies

```bash
# 1. Clone the project
git clone <your-repo-url>
cd tagum-pickleball-finder

# 2. Install backend dependencies
cd backend && npm install && cd ..

# 3. Install frontend dependencies
cd frontend && npm install && cd ..

# 4. Install shared package
cd shared && npm install && cd ..
```

---

## Backend Setup

### 1. Create the environment file

```bash
cp backend/.env.example backend/.env
```

### 2. Fill in your credentials

Open `backend/.env` and set:

```env
PORT=3000
NODE_ENV=development
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Install Playwright browsers

```bash
cd backend
npx playwright install chromium
```

### 4. Build shared types

```bash
cd shared && npm run build && cd ..
```

---

## Frontend Setup

### 1. Create the environment file

```bash
cp frontend/.env.example frontend/.env
```

### 2. Fill in your credentials

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

### 3. Add app assets

Place the following in the `assets/` directory (see `assets/README.md`):
- `icon.png` (1024×1024)
- `splash.png` (1284×2778)
- `adaptive-icon.png` (1024×1024)
- `favicon.png` (32×32)

### 4. Enable Google Maps APIs

In the Google Cloud Console, enable:
- Maps SDK for Android
- Maps SDK for iOS
- Directions API

Update the API key in `frontend/app.json`.

---

## Supabase Setup

### 1. Create a project

1. Go to https://supabase.com
2. Create a new project
3. Wait for it to provision (~2 minutes)

### 2. Run the schema

1. Go to **SQL Editor** in your Supabase dashboard
2. Copy and paste `database/schema.sql`
3. Click **Run**

### 3. Seed with court data

1. In the same SQL Editor, run `database/seed.sql`
2. Update the seed data with real court details before going live

### 4. Copy your credentials

In **Settings → API**, copy:
- Project URL → `SUPABASE_URL`
- `anon` key → `SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## Running Locally

### Start the backend

```bash
cd backend
npm run dev
```

The API will be available at `http://localhost:3000/api/v1`.

Test it:
```bash
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/v1/courts
curl "http://localhost:3000/api/v1/availability?date=2024-03-15"
```

### Start the frontend (new terminal)

```bash
cd frontend
npx expo start
```

Then:
- Press `a` to open on Android emulator
- Press `i` to open on iOS simulator
- Scan the QR code with the **Expo Go** app on a real device

---

## Running in Replit

### Backend

1. Open the **Shell** tab
2. Run: `cd tagum-pickleball-finder/backend && npm install && npm run dev`
3. The backend URL will be `https://<your-repl>.repl.co`

### Frontend (Expo)

Expo on Replit requires the Expo Go app on a physical device:

1. Run: `cd tagum-pickleball-finder/frontend && npm install && npx expo start --tunnel`
2. The `--tunnel` flag creates a public URL accessible from your phone
3. Scan the QR code in Expo Go

Update `EXPO_PUBLIC_API_BASE_URL` in `frontend/.env` to point to your Replit backend URL.

---

## Adding a New Court Parser

### Step 1: Create the parser file

```bash
# Create a new file in backend/src/parsers/
touch backend/src/parsers/myNewCourtParser.ts
```

### Step 2: Implement the IParser interface

```typescript
// backend/src/parsers/myNewCourtParser.ts
import * as cheerio from "cheerio";
import { IParser } from "../interfaces/IParser";
import { ParseResult, ParsedSlot } from "../types";
import { fetchWithRetry } from "../utils/httpClient";
import { logger } from "../utils/logger";

export class MyNewCourtParser implements IParser {
  readonly parserName = "my_new_court"; // Must match parser_name in Supabase
  readonly displayName = "My New Court";

  private readonly baseUrl =
    process.env.MY_COURT_URL || "https://my-court-website.com/book";

  async checkAvailability(
    date: string,
    courtId: string,
    courtName: string
  ): Promise<ParseResult> {
    const sourceUrl = `${this.baseUrl}?date=${date}`;

    try {
      logger.info(`[${this.displayName}] Checking ${date}`);
      const html = await fetchWithRetry(sourceUrl);
      const slots = this.parseSlots(html);

      return { courtId, courtName, date, slots, sourceUrl, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error(`[${this.displayName}] Failed: ${message}`);
      return { courtId, courtName, date, slots: [], sourceUrl, error: message };
    }
  }

  private parseSlots(html: string): ParsedSlot[] {
    const $ = cheerio.load(html);
    const slots: ParsedSlot[] = [];

    // TODO: Add selectors matching the real website
    $(".time-slot").each((_i, el) => {
      const time = $(el).attr("data-time");
      if (!time) return;
      slots.push({
        startTime: time,
        endTime: /* calculate */ time,
        available: !$(el).hasClass("booked"),
        price: $(el).find(".price").text() || null,
      });
    });

    return slots;
  }
}
```

### Step 3: Register the parser

Open `backend/src/parsers/index.ts` and add:

```typescript
import { MyNewCourtParser } from "./myNewCourtParser";

const PARSER_REGISTRY: Record<string, IParser> = {
  pickleballers: new PickleballersParser(),
  pickle_city: new PickleCityParser(),
  hideout: new HideoutParser(),
  my_new_court: new MyNewCourtParser(), // ← Add this
};
```

### Step 4: Add the court to Supabase

In the Supabase SQL Editor:

```sql
INSERT INTO courts (name, address, latitude, longitude, website, phone, parser_name, active)
VALUES (
  'My New Court',
  '123 Main Street, Tagum City',
  7.4478,   -- replace with real GPS
  125.8087, -- replace with real GPS
  'https://my-court-website.com',
  '+63 9XX XXX XXXX',
  'my_new_court', -- must match parserName in your class
  true
);
```

### Step 5: Add environment variable (optional)

If the booking URL needs to be configurable:

```bash
# Add to backend/.env
MY_COURT_URL=https://my-court-website.com/booking
```

### Step 6: Test it

```bash
cd backend
npm run dev

# In another terminal:
curl "http://localhost:3000/api/v1/availability?date=$(date +%Y-%m-%d)"
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `development` or `production` |
| `SUPABASE_URL` | **Yes** | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | **Yes** | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Supabase service role (for admin ops) |
| `PLAYWRIGHT_HEADLESS` | No | `true` (default) or `false` (show browser) |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins |
| `LOG_LEVEL` | No | `info`, `debug`, `warn`, `error` |
| `PICKLEBALLERS_URL` | No | Override Pickleballers booking URL |
| `PICKLE_CITY_URL` | No | Override Pickle City booking URL |
| `HIDEOUT_URL` | No | Override Hideout booking URL |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | **Yes** | Backend API URL |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | **Yes** | Google Maps API key |

---

## Deployment Guide

### Backend Deployment (Railway / Render / Fly.io)

**Railway (recommended for free tier):**

1. Push your code to GitHub
2. Go to https://railway.app and create a new project from your repo
3. Set the root directory to `backend`
4. Set the start command: `npm start`
5. Add environment variables in the Railway dashboard
6. Deploy — Railway assigns a public URL automatically

**Render:**

1. Create a new **Web Service** on https://render.com
2. Connect your GitHub repo
3. Root directory: `backend`
4. Build command: `npm install && npm run build`
5. Start command: `npm start`
6. Add environment variables

**Note:** Playwright requires Chromium. Add to your Dockerfile or use the `playwright` environment config:

```dockerfile
# Dockerfile for backend with Playwright
FROM mcr.microsoft.com/playwright:v1.41.0-jammy
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

### Frontend Deployment (Expo EAS)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure the project
cd frontend
eas build:configure

# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios

# Submit to stores
eas submit --platform android
eas submit --platform ios
```

Update `frontend/app.json`:
- `extra.eas.projectId` — your EAS project ID
- `ios.bundleIdentifier` — com.yourname.tagumpickleball
- `android.package` — com.yourname.tagumpickleball
- Google Maps API keys in `ios.config.googleMapsApiKey` and `android.config.googleMaps.apiKey`

---

## Troubleshooting

### "SUPABASE_URL or SUPABASE_ANON_KEY not set"
Set these in `backend/.env`. Never commit `.env` files.

### "No courts found" on availability check
- Run `database/seed.sql` to add courts
- Ensure courts have `active = true` and a valid `parser_name`

### Parser returns empty slots
- The real website HTML structure likely differs from the parser's CSS selectors
- Open the site in a browser, inspect the HTML, and update the `$()` selectors in the parser
- Set `PLAYWRIGHT_HEADLESS=false` to watch the browser during debugging

### Expo app can't connect to backend
- Make sure the backend is running and accessible
- On a physical device, use your computer's local IP (not `localhost`): `http://192.168.x.x:3000/api/v1`
- Or use `npx expo start --tunnel` to expose via a public URL

### Maps not showing
- Ensure `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is set
- Verify the key has Maps SDK for Android/iOS enabled in Google Cloud Console
- Check `app.json` has the key in both `ios.config.googleMapsApiKey` and `android.config.googleMaps.apiKey`

---

## Future Features

The architecture is designed to support these without major rewrites:

| Feature | Where to add |
|---------|-------------|
| User login / accounts | Add Supabase Auth; create a `users` table |
| Push notifications | Use Expo Notifications + a cron job on the backend |
| GCash / payment integration | Add a `payments` service; integrate GCash API |
| Court owner accounts | Add `court_owners` table; owner dashboard frontend |
| Tournament schedules | Add `tournaments` table + new API endpoints |
| Player matching | Add `players` table + matching service |
| Nationwide support | Add `city` field to courts; location-based filtering |
| Offline support | Cache court list in AsyncStorage; show stale state when offline |
| Rating & reviews | Add `reviews` table; star rating component |
