import { Client } from '@notionhq/client'
import { Tool } from '@mozaik-ai/core'

function notion() {
  return new Client({ auth: process.env.NOTION_API_KEY })
}

/** Normalize a Notion UUID — strip extra dashes that LLMs sometimes introduce */
function cleanId(id: string): string {
  const hex = id.replace(/-/g, '')
  if (hex.length === 32) {
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
  }
  return id
}

// ── Retrieve Page + Block Children ────────────────────────────────────
export const notionGetPageContentTool: Tool = {
  name: 'notion_get_page_content',
  description:
    'Retrieves a Notion page and all its child blocks. Use this to scan ' +
    'a page for linked databases, existing embeds, callout blocks with ' +
    'metadata, and any text content written by the user.',
  schema: {
    type: 'object',
    properties: { page_id: { type: 'string' } },
    required: ['page_id'],
  },
  async invoke({ page_id }: any) {
    const id = cleanId(page_id)
    const n = notion()
    const [page, blocks] = await Promise.all([
      n.pages.retrieve({ page_id: id }),
      n.blocks.children.list({ block_id: id, page_size: 100 }),
    ])
    return { page, blocks: blocks.results }
  },
}

// ── Retrieve Database Schema ──────────────────────────────────────────
export const notionRetrieveDatabaseTool: Tool = {
  name: 'notion_retrieve_database',
  description:
    'Retrieves schema of a Notion database: column names, types, options.',
  schema: {
    type: 'object',
    properties: { database_id: { type: 'string' } },
    required: ['database_id'],
  },
  async invoke({ database_id }: any) {
    const id = cleanId(database_id)
    const n = notion()
    const db = await n.databases.retrieve({ database_id: id })
    const columns: Record<string, any> = {}
    for (const [name, prop] of Object.entries(db.properties)) {
      const p = prop as any
      columns[name] = {
        type: p.type,
        options: ['select', 'multi_select', 'status'].includes(p.type)
          ? (p[p.type]?.options ?? []).map((o: any) => o.name)
          : undefined,
      }
    }
    return {
      database_id,
      name: (db as any).title?.[0]?.plain_text ?? 'Untitled',
      columns,
    }
  },
}

// ── Query Database Rows ───────────────────────────────────────────────
export const notionQueryDatabaseTool: Tool = {
  name: 'notion_query_database',
  description: 'Queries rows from a Notion database. Returns normalized flat objects.',
  schema: {
    type: 'object',
    properties: {
      database_id: { type: 'string' },
      page_size: { type: 'number', description: 'Max rows (1-100, default 30)' },
    },
    required: ['database_id'],
  },
  async invoke({ database_id, page_size = 30 }: any) {
    const id = cleanId(database_id)
    const n = notion()
    const result = await n.databases.query({
      database_id: id,
      page_size: Math.min(page_size, 100),
    })
    const { normalizeRows } = await import('../lib/normalize')
    return { rows: normalizeRows(result.results), total: result.results.length }
  },
}

// ── Append Dashboard Blocks ───────────────────────────────────────────
export const notionAppendDashboardTool: Tool = {
  name: 'notion_append_dashboard',
  description: 'Appends dashboard embed, Refine instructions, and metadata to a Notion page.',
  schema: {
    type: 'object',
    properties: {
      page_id: { type: 'string' },
      app_url: { type: 'string' },
      dashboard_name: { type: 'string' },
      project_id: { type: 'string' },
      task_id: { type: 'string' },
      refine_webhook_url: { type: 'string' },
    },
    required: ['page_id', 'app_url', 'dashboard_name', 'project_id', 'task_id', 'refine_webhook_url'],
  },
  async invoke({ page_id, app_url, dashboard_name, project_id, task_id }: any) {
    const id = cleanId(page_id)
    const n = notion()
    await n.blocks.children.append({
      block_id: id,
      children: [
        { type: 'divider', divider: {} } as any,
        {
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: `📊 ${dashboard_name}` } }],
          },
        } as any,
        { type: 'embed', embed: { url: app_url } } as any,
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: '✏️ Want changes? Write your request below, then click ' } },
              { type: 'text', text: { content: 'Refine Dashboard' }, annotations: { bold: true } },
              { type: 'text', text: { content: '.' } },
            ],
          },
        } as any,
        {
          type: 'callout',
          callout: {
            icon: { type: 'emoji', emoji: '🔧' },
            rich_text: [{ type: 'text', text: { content: `vizion:${project_id}:${task_id}` } }],
            color: 'gray_background',
          },
        } as any,
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: 'Generated by ' } },
              { type: 'text', text: { content: 'vizion', link: { url: 'https://github.com/Lotus015/vizion' } } },
            ],
          },
        } as any,
      ],
    })
    return { ok: true }
  },
}

// ── Update Embed Block URL ────────────────────────────────────────────
export const notionUpdateEmbedTool: Tool = {
  name: 'notion_update_embed',
  description: 'Finds the existing embed block on a page and updates its URL.',
  schema: {
    type: 'object',
    properties: {
      page_id: { type: 'string' },
      new_app_url: { type: 'string' },
    },
    required: ['page_id', 'new_app_url'],
  },
  async invoke({ page_id, new_app_url }: any) {
    const id = cleanId(page_id)
    const n = notion()
    const blocks = await n.blocks.children.list({ block_id: id, page_size: 100 })

    const embedBlock = blocks.results.find((b: any) => b.type === 'embed')
    if (!embedBlock) throw new Error('No embed block found on page')

    await n.blocks.update({
      block_id: embedBlock.id,
      embed: { url: new_app_url },
    } as any)

    return { ok: true, updated_block_id: embedBlock.id }
  },
}

