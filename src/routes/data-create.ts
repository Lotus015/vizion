import { Request, Response } from 'express'
import { createDatabaseRow } from '../notion/api'

export async function dataCreateRoute(req: Request, res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const { databaseId, properties } = req.body ?? {}

  if (!databaseId || !properties) {
    return res.status(400).json({
      error: 'Missing required fields: databaseId, properties',
    })
  }

  try {
    const result = await createDatabaseRow(databaseId, properties)
    return res.status(201).json({ ok: true, id: result.id })
  } catch (err: any) {
    console.error('[data-create] failed:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
