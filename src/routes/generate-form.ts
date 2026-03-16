import { Request, Response } from 'express'
import { runFormWorkflow } from '../workflows/form'

export async function generateFormRoute(req: Request, res: Response) {
  const pageId = req.body?.data?.id
  const userId = req.body?.source?.user_id ?? 'vizion'

  if (!pageId) {
    return res.status(400).json({ error: 'Missing page_id in webhook payload', received: req.body })
  }

  const base = process.env.VIZION_BASE_URL!

  res.status(202).json({ ok: true, message: 'Form generation started' })

  runFormWorkflow({ pageId, userId, proxyBaseUrl: base })
    .then((result) => console.log('[generate-form] done:', result.appUrl))
    .catch((err) => console.error('[generate-form] failed:', err.message, err.stack))
}
