import { Client } from '@notionhq/client'

export function notion() {
  return new Client({ auth: process.env.NOTION_API_KEY })
}

/** Normalize a Notion UUID — strip extra dashes that LLMs sometimes introduce */
export function cleanId(id: string): string {
  const hex = id.replace(/-/g, '')
  if (hex.length === 32) {
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
  }
  return id
}

/** Leave a comment on a Notion page, optionally @mentioning a user */
export async function notifyUser(pageId: string, userId: string, message: string) {
  const n = notion()
  const richText: any[] = []

  if (userId && userId !== 'vizion') {
    richText.push({
      type: 'mention',
      mention: { type: 'user', user: { id: userId } },
    })
    richText.push({ type: 'text', text: { content: ' ' } })
  }

  richText.push({ type: 'text', text: { content: message } })

  await n.comments.create({
    parent: { page_id: cleanId(pageId) },
    rich_text: richText,
  })
}

/** Retrieve database schema (MCP data_source endpoints are broken — makenotion/notion-mcp-server#218) */
export async function retrieveDatabaseSchema(databaseId: string) {
  const n = notion()
  const id = cleanId(databaseId)
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
    database_id: databaseId,
    name: (db as any).title?.[0]?.plain_text ?? 'Untitled',
    columns,
  }
}

/** Query database rows (MCP data_source endpoints are broken — makenotion/notion-mcp-server#218) */
export async function queryDatabase(databaseId: string, pageSize = 30) {
  const n = notion()
  const id = cleanId(databaseId)
  const result = await n.databases.query({
    database_id: id,
    page_size: Math.min(pageSize, 100),
  })
  const { normalizeRows } = await import('./normalize')
  return { rows: normalizeRows(result.results), total: result.results.length }
}

/** Update a row (page) in a Notion database */
export async function updateDatabaseRow(
  databaseId: string,
  pageId: string,
  properties: Record<string, any>,
) {
  const n = notion()
  // Fetch schema to know property types
  const db = await n.databases.retrieve({ database_id: cleanId(databaseId) })
  const schema: Record<string, { type: string }> = {}
  for (const [name, prop] of Object.entries(db.properties)) {
    schema[name] = { type: (prop as any).type }
  }

  const { denormalizeProperties } = await import('./denormalize')
  const notionProps = denormalizeProperties(properties, schema)

  // Remove undefined entries (read-only properties)
  for (const key of Object.keys(notionProps)) {
    if (notionProps[key] === undefined) delete notionProps[key]
  }

  await n.pages.update({
    page_id: cleanId(pageId),
    properties: notionProps,
  })
}

/** Property type mapping for database creation */
const PROPERTY_CREATORS: Record<string, (options?: string[]) => any> = {
  title: () => ({ title: {} }),
  rich_text: () => ({ rich_text: {} }),
  number: () => ({ number: { format: 'number' } }),
  select: (options) => ({ select: { options: (options ?? []).map(name => ({ name })) } }),
  multi_select: (options) => ({ multi_select: { options: (options ?? []).map(name => ({ name })) } }),
  email: () => ({ email: {} }),
  url: () => ({ url: {} }),
  phone_number: () => ({ phone_number: {} }),
  checkbox: () => ({ checkbox: {} }),
  date: () => ({ date: {} }),
  status: (options) => ({ status: { options: (options ?? ['Not started', 'In progress', 'Done']).map(name => ({ name })) } }),
}

/** Create a new Notion database on a page */
export async function createNotionDatabase(
  pageId: string,
  title: string,
  columns: Array<{ name: string; type: string; options?: string[] }>,
): Promise<{ databaseId: string; columns: Array<{ name: string; type: string }> }> {
  const n = notion()
  const properties: Record<string, any> = {}

  for (const col of columns) {
    const creator = PROPERTY_CREATORS[col.type]
    if (creator) {
      properties[col.name] = creator(col.options)
    }
  }

  // Ensure there's exactly one title property
  const hasTitle = columns.some(c => c.type === 'title')
  if (!hasTitle && columns.length > 0) {
    properties[columns[0].name] = { title: {} }
  }

  const db = await n.databases.create({
    parent: { page_id: cleanId(pageId) },
    title: [{ type: 'text', text: { content: title } }],
    properties,
  })

  return {
    databaseId: db.id,
    columns: columns.map(c => ({ name: c.name, type: c.type })),
  }
}

/** Create a new row (page) in a Notion database */
export async function createDatabaseRow(
  databaseId: string,
  properties: Record<string, any>,
) {
  const n = notion()
  const dbId = cleanId(databaseId)
  const db = await n.databases.retrieve({ database_id: dbId })
  const schema: Record<string, { type: string }> = {}
  for (const [name, prop] of Object.entries(db.properties)) {
    schema[name] = { type: (prop as any).type }
  }

  const { denormalizeProperties } = await import('./denormalize')
  const notionProps = denormalizeProperties(properties, schema)

  for (const key of Object.keys(notionProps)) {
    if (notionProps[key] === undefined) delete notionProps[key]
  }

  const page = await n.pages.create({
    parent: { database_id: dbId },
    properties: notionProps,
  })

  return { id: page.id }
}

/** Find the embed block on a page and update its URL */
export async function updateEmbed(pageId: string, newAppUrl: string) {
  const n = notion()
  const id = cleanId(pageId)
  const blocks = await n.blocks.children.list({ block_id: id, page_size: 100 })

  const embedBlock = blocks.results.find((b: any) => b.type === 'embed')
  if (!embedBlock) throw new Error('No embed block found on page')

  await n.blocks.update({
    block_id: embedBlock.id,
    embed: { url: newAppUrl },
  } as any)
}
