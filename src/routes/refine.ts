import { Request, Response } from 'express'
import { runRefineWorkflow } from '../workflows/vizion-refine'

export async function refineRoute(req: Request, res: Response) {
  const pageId = req.body?.data?.id

  if (!pageId) {
    return res.status(400).json({ error: 'Missing page_id', received: req.body })
  }

  try {
    const result = await runRefineWorkflow({ pageId })
    return res.status(200).json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[refine]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
