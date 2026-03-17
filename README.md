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

## Setup

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
VIZION_BASE_URL=       # your deployed URL (e.g. https://vizion-production.up.railway.app)
```

### Deploy to Railway

1. Push to GitHub
2. Railway → New Project → Deploy from GitHub
3. Add environment variables
4. Generate domain → set as `VIZION_BASE_URL`

### Notion setup

1. Create an integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) with read/write/comment permissions
2. Add the integration to each Notion page you want to use (••• → Connections)
3. Create buttons on your pages with webhook URLs pointing to vizion endpoints

## License

MIT
