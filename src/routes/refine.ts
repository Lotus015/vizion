import { Request, Response } from 'express'
import { runRefineWorkflow } from '../workflows/vizion-refine'

export async function refineRoute(req: Request, res: Response) {
  const pageId = req.body?.data?.id
  const userId = req.body?.source?.user_id

  if (!pageId) {
    return res.status(400).json({ error: 'Missing page_id', received: req.body })
  }

  // Respond immediately so Notion doesn't timeout
  res.status(202).json({ ok: true, message: 'Dashboard refinement started' })

  // Run workflow in background
  runRefineWorkflow({ pageId, userId })
    .then((result) => console.log('[refine] done:', result.appUrl))
    .catch((err) => console.error('[refine] failed:', err.message, err.stack))
}
