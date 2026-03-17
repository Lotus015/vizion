import { Request, Response } from 'express'
import { notion } from '../notion/api'
import { normalizeRows } from '../notion/normalize'
import { getAllDatabaseIds } from '../lib/dashboard-registry'

const POLL_INTERVAL_MS = 5_000 // poll Notion every 5 seconds

/** Clean database name: "customers.csv" → "customers" */
function cleanName(name: string): string {
  return name.replace(/\.csv$/i, '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
}

export async function dataStreamRoute(req: Request, res: Response) {
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

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  let lastHash = ''

  async function fetchAndPush() {
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

      // Simple flat format
      const response: Record<string, any> = {}
      for (const r of results) {
        response[cleanName(r.name)] = r.rows
      }
      response._meta = {
        lastUpdated: new Date().toISOString(),
        databases: Object.fromEntries(results.map(r => [cleanName(r.name), { databaseId: r.id, total: r.total }])),
      }

      // Hash only the data, not the timestamp
      const dataHash = JSON.stringify(results.map(r => r.rows))

      // Only push if actual data changed
      if (dataHash !== lastHash) {
        lastHash = dataHash
        res.write(`data: ${JSON.stringify(response)}\n\n`)
      }
    } catch (err: any) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`)
    }
  }

  // Send initial data immediately
  await fetchAndPush()

  // Poll and push changes
  const interval = setInterval(fetchAndPush, POLL_INTERVAL_MS)

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(interval)
  })
}
