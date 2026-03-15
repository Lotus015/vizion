import { Request, Response } from 'express'
import { notion } from '../notion/api'
import { normalizeRows } from '../notion/normalize'
import { getAllDatabaseIds } from '../lib/dashboard-registry'

const POLL_INTERVAL_MS = 5_000 // poll Notion every 5 seconds

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

      const databases: Record<string, any> = {}
      for (const r of results) {
        databases[r.name] = { rows: r.rows, total: r.total, databaseId: r.id }
      }

      const payload = { databases, lastUpdated: new Date().toISOString() }
      const hash = JSON.stringify(payload)

      // Only push if data changed
      if (hash !== lastHash) {
        lastHash = hash
        res.write(`data: ${hash}\n\n`)
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
