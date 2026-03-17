import { Request, Response } from 'express'
import { notion } from '../notion/api'
import { normalizeRows } from '../notion/normalize'
import { getAllDatabaseIds } from '../lib/dashboard-registry'

/** Clean database name: "customers.csv" → "customers" */
function cleanName(name: string): string {
  return name.replace(/\.csv$/i, '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
}

export async function dataRoute(req: Request, res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=25')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const raw = req.query.databaseId
  let databaseIds: string[] = Array.isArray(raw)
    ? (raw as string[])
    : raw ? [raw as string] : []

  // Fallback to known database IDs when Spektrum app sends wrong params
  if (!databaseIds.length) {
    databaseIds = getAllDatabaseIds()
  }

  if (!databaseIds.length) {
    return res.status(400).json({ error: 'At least one databaseId required' })
  }

  try {
    const n = notion()
    const results = await Promise.all(
      databaseIds.map(async (id) => {
        const [schema, rows] = await Promise.all([
          n.databases.retrieve({ database_id: id }),
          n.databases.query({ database_id: id, page_size: 100 }),
        ])
        const name = (schema as any).title?.[0]?.plain_text ?? id
        return { id, name, rows: normalizeRows(rows.results), total: rows.results.length }
      })
    )

    // Simple flat format: { customers: [...rows], revenue: [...rows], _meta: { ... } }
    const response: Record<string, any> = {}
    for (const r of results) {
      response[cleanName(r.name)] = r.rows
    }
    response._meta = {
      lastUpdated: new Date().toISOString(),
      databases: Object.fromEntries(results.map(r => [cleanName(r.name), { databaseId: r.id, total: r.total, originalName: r.name }])),
    }

    return res.status(200).json(response)
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
