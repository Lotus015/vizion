import { Request, Response } from 'express'
import { updateDatabaseRow } from '../notion/api'

export async function dataWriteRoute(req: Request, res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const { databaseId, pageId, properties } = req.body ?? {}

  if (!databaseId || !pageId || !properties) {
    return res.status(400).json({
      error: 'Missing required fields: databaseId, pageId, properties',
    })
  }

  try {
    await updateDatabaseRow(databaseId, pageId, properties)
    return res.status(200).json({ ok: true })
  } catch (err: any) {
    console.error('[data-write] failed:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
