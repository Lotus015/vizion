# vizion

Turn Notion pages into live apps. No code, no setup, no leaving Notion.

---

## What it does

**Write what you want. Click a button. Get a working app.**

Vizion reads your Notion page — databases, text, whatever you wrote — and generates a fully interactive React app, embedded right back into your page. It creates the databases you need, connects them, and keeps everything in sync.

---

## Capabilities

**Visualize your data**
→ Point vizion at your Notion databases and get a live dashboard with KPIs, charts, and tables — auto-generated from your data relationships

**Build anything from a description**
→ Write a product spec on a Notion page, click Build — get a deployed React app. Landing pages, forms, tools, games

**Two-way data sync**
→ Collect data through your app's UI — signups, form submissions, feedback — automatically stored in a Notion database on the same page

**Auto-create databases**
→ Describe what you want ("landing page with email capture") and vizion figures out what databases you need, creates them, and wires everything up

**Real-time updates**
→ Change data in Notion → your app updates within seconds via SSE streaming

**Refine with comments**
→ Not happy with the result? Write feedback below the embed, click Refine — vizion iterates on the existing app

---

## Examples

### Dashboard from databases

Add 3 Notion databases to a page (customers, revenue, support tickets). Click **Generate Dashboard**.

Vizion scans the databases, discovers relationships, and generates a dashboard with:
- MRR and churn KPI cards
- Revenue trend chart
- Support tickets table

The dashboard polls your Notion data every 10 seconds — edit a row in Notion and watch the chart update.

### Landing page with email capture

Create a Notion page and write:

> Landing page for "Acme AI" — hero section with tagline, 3 feature cards, pricing table with Free/Pro/Enterprise tiers. CTA button captures email for waitlist.

Click **Build**. Vizion:
1. Reads your page
2. Creates a "Waitlist" database on your page (Name, Email, Signed Up date)
3. Generates a landing page with a working email capture form
4. Every signup appears as a new row in your Notion database

### Lead capture form

Import a leads database (Name, Email, Company, Role, Interest). Click **Generate Form**.

Vizion reads the database schema and generates a step-by-step Typeform-style form. Submissions go directly into your Notion database.

### Free-form app

Write anything on a Notion page — a game spec, a calculator description, an internal tool brief. Click **Build** and get a deployed React app.

---

## Architecture

```
Notion page
  ↓ webhook
vizion (Express server on Railway)
  ├── Notion MCP server → reads pages & blocks (agent tooling)
  ├── Notion API → creates databases, writes rows, comments
  ├── Mozaik agents → analyze data, plan databases, write specs
  └── Spektrum SDK → generates & deploys React apps
  ↓
Embedded app (*.apps.jigjoy.ai)
  ↔ polls vizion /api/data for live Notion data
  ↔ POSTs to vizion /api/data/create to write back
```

## Stack

- **Mozaik** — multi-agent orchestration with structured output
- **Notion MCP** — page & block reading via Model Context Protocol
- **Notion API** — database creation, row writes, comments
- **Spektrum** — React app generation & deployment

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/generate` | Dashboard from databases |
| POST | `/api/generate-form` | Form from database schema |
| POST | `/api/build` | App from page content |
| POST | `/api/refine` | Iterate on existing app |
| GET | `/api/data` | Read Notion databases |
| GET | `/api/data/stream` | SSE real-time data stream |
| POST | `/api/data` | Update existing row |
| POST | `/api/data/create` | Create new row |
| GET | `/health` | Health check |

## Quick start (live instance)

Vizion is live at `https://vizion-production.up.railway.app`. You can use it right now with your Notion workspace.

### 1. Connect your Notion page

- Go to the Notion page you want to use
- Click `•••` (top right) → **Connections** → add the **vizion** integration
- Do this for every page you want vizion to access

### 2. Add a button

Create a Notion button on your page. Set the webhook URL based on what you want:

| What you want | Webhook URL |
|---------------|-------------|
| Dashboard from databases | `https://vizion-production.up.railway.app/api/generate` |
| Form from database schema | `https://vizion-production.up.railway.app/api/generate-form` |
| App from page description | `https://vizion-production.up.railway.app/api/build` |
| Refine existing app | `https://vizion-production.up.railway.app/api/refine` |

### 3. Click and wait

Click the button. Vizion takes 3-6 minutes to generate your app. You'll get a Notion comment notification when it's ready.

### Try it: Dashboard

1. Create a Notion page with 1-3 inline databases (or import CSVs from `tables/saas-metrics/`)
2. Add the vizion connection
3. Add a button → webhook: `https://vizion-production.up.railway.app/api/generate`
4. Click it — a live dashboard appears embedded in your page

### Try it: Landing page with email capture

1. Create a Notion page and write your landing page spec:
   > "Landing page for Acme AI. Hero with tagline, 3 feature cards, pricing. CTA button captures email for early access."
2. Add a button → webhook: `https://vizion-production.up.railway.app/api/build`
3. Click it — vizion creates a Waitlist database on your page and generates a landing page with a working signup form

### Try it: Free-form app

1. Write anything on a Notion page — a game, a calculator, a tool
2. Add a button → webhook: `https://vizion-production.up.railway.app/api/build`
3. Click it — get a deployed React app

### Data endpoints (for generated apps)

Generated apps use these endpoints to read/write data:

```
GET  https://vizion-production.up.railway.app/api/data          → read all databases
GET  https://vizion-production.up.railway.app/api/data/stream   → SSE real-time stream
POST https://vizion-production.up.railway.app/api/data          → update a row
POST https://vizion-production.up.railway.app/api/data/create   → create a row
GET  https://vizion-production.up.railway.app/health            → health check
```

---

## Self-hosting

### Setup

```bash
git clone https://github.com/Lotus015/vizion
cd vizion
npm install
cp .env.example .env  # fill in API keys
npm run dev
```

### Environment variables

```
OPENAI_API_KEY=        # for Mozaik agents
NOTION_API_KEY=        # Notion integration token
SPEKTRUM_API_KEY=      # Spektrum SDK key
VIZION_BASE_URL=       # your deployed URL (e.g. https://your-app.up.railway.app)
```

### Deploy to Railway

1. Push to GitHub
2. Railway → New Project → Deploy from GitHub
3. Add environment variables in the Variables tab
4. Settings → Networking → Generate Domain → set as `VIZION_BASE_URL`

### Notion integration setup

1. Create an integration at [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Enable capabilities: **Read content**, **Update content**, **Insert content**, **Insert comments**
3. Add the integration to each Notion page (••• → Connections)
4. Create buttons with webhook URLs pointing to your deployed instance

## License

MIT
