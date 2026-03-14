# vizion

> Notion as a natural language interface for custom React apps.

Click a button. An AI agent reads your databases, understands their relationships, and generates a bespoke interactive dashboard — embedded live in your Notion page. Not happy? Write a comment and click Refine.

## How it works

1. **Generate** — Add databases to a Notion page, click "📊 Generate Dashboard". A multi-agent workflow scans your databases, discovers relationships, and generates a fully interactive React dashboard via Spektrum.

2. **Refine** — Write feedback below the embedded dashboard, click "✏️ Refine Dashboard". The agent reads your comment and iterates on the existing app.

## What makes this different

| | Notion native charts | Third-party tools | **vizion** |
|--|--|--|--|
| Configuration | Manual | Manual | **Zero — AI decides** |
| Chart types | 4 fixed | ~10 fixed | **Arbitrary React** |
| Multiple databases | ❌ | ❌ | ✅ **AI joins them** |
| Interactivity | Basic | Basic | **Filters, search, drill-down** |
| Refinement | ❌ | ❌ | ✅ **Comment → regenerate** |

## Stack

- **Mozaik** — AI agent orchestration
- **Notion MCP** — database reading & page writing
- **Spektrum SDK** — React app generation & deployment

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys
npm run dev
```

## License

MIT
