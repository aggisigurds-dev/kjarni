---
name: ajour-endpoint-capture
description: >
  Capture the real HTTP request behind Ajour's (ajoursystem.net) "generate
  reports → NLSH → fetch → download CSV" buttons — the XHR/fetch that actually
  returns the AjourRegistrationData CSV/JSON — and report it back as a cURL plus
  an auth summary, so the brunahólf hub can replay it server-side on a schedule
  (no browser, no clicking). Use when turning the manual Ajour export into an
  automated API pull, or whenever the Ajour data endpoint needs to be (re)found.
  Runs on a desktop with a browser (Cowork); ideal with the Playwright MCP.
---

# Ajour endpoint capture

**Goal:** find the single HTTP request that returns the Ajour report data, and
report it as a **cURL** + an **auth summary**, so the hub can fetch it directly
— turning the whole manual export into a scheduled, unattended pull.

**Why it matters:** Ajour's "download CSV" is driven by an XHR/fetch under the
hood. Capture that one request (URL, method, headers, auth, payload) and the
brunahólf hub can call it itself — no Outlook/Chrome, no Cowork, no babysitting.

## Prerequisites
- A browser already **logged in to Ajour** (`brunaholf.ajoursystem.net`).
- Preferred: **Playwright MCP** for automatic network capture
  - install once: `claude mcp add playwright npx @playwright/mcp@latest`
- Known URLs:
  - Report generator: `https://brunaholf.ajoursystem.net/ReportGenerator/Construction`
  - Construction: `https://brunaholf.ajoursystem.net/construction`

## Method A — Playwright MCP (preferred, auto-capture)
1. Open the Ajour report page with Playwright and start **network logging**
   (capture every request + response).
2. Drive the exact flow the user does: **generate reports → NLSH → fetch →
   download CSV**.
3. In the captured log, find the request whose **response IS the data** —
   content-type `text/csv` or `application/json`, a large body, or a file
   download. Ignore static assets (js/css/img), analytics, and auth pings.
4. Extract for that request:
   - full **URL** + query string
   - **method** (GET/POST)
   - **request headers** — especially auth: `Cookie`, `Authorization`,
     `X-*-Token`, API keys
   - **request body / payload** (POST report params: NLSH project id, date
     range, etc.)
   - **response** content-type + first ~20 lines (confirm it's the CSV/JSON)
5. Reconstruct it as a **cURL** command.

## Method B — Manual F12 (fallback, no Playwright)
1. Chrome → **F12** → **Network** tab → filter **Fetch/XHR**.
2. Run the flow: generate reports → NLSH → fetch → download CSV.
3. Find the request whose response is the CSV/JSON data.
4. **Right-click → Copy → "Copy as cURL".**

## Report back
1. The **cURL** for the data request.
2. **Auth type** — session **Cookie**, **Bearer token / API key**, or a
   query-param token? (Decides whether the hub can call it unattended, or needs
   a login/refresh step.)
3. The **report parameters** in the URL/body (so we can parameterize
   month/project — especially the NLSH selection).
4. Whether the response is **CSV or JSON**, plus a short sample.

## ⚠️ Security
The captured cURL contains a **live auth token/cookie** for the Ajour account —
treat it like a password. Share it only through the private agreed channel
(never anywhere public). It gets moved into a server-side secret (hub env var)
when wiring the automated fetch.

## Next step (the hub does this)
With the cURL, the hub gets an `ajour-fetch` function that replays the request
server-side and drops the CSV where `nlsh-update` / `ajour-ingest` already pick
it up — the manual export becomes a scheduled, unattended pull.
