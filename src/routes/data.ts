import { Request, Response } from 'express'
import { Client } from '@notionhq/client'
import { normalizeRows } from '../lib/normalize'

const notion = new Client({ auth: process.env.NOTION_API_KEY })

export async function dataRoute(req: Request, res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=25')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const raw = req.query.databaseId
  const databaseIds: string[] = Array.isArray(raw)
    ? (raw as string[])
    : raw ? [raw as string] : []

  if (!databaseIds.length) {
    return res.status(400).json({ error: 'At least one databaseId required' })
  }

  try {
    const results = await Promise.all(
      databaseIds.map(async (id) => {
        const [schema, rows] = await Promise.all([
          notion.databases.retrieve({ database_id: id }),
          notion.databases.query({ database_id: id, page_size: 100 }),
        ])
        const name = (schema as any).title?.[0]?.plain_text ?? id
        return { id, name, rows: normalizeRows(rows.results), total: rows.results.length }
      })
    )

    const databases: Record<string, any> = {}
    for (const r of results) {
      databases[r.name] = { rows: r.rows, total: r.total, databaseId: r.id }
    }

    return res.status(200).json({
      databases,
      lastUpdated: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
