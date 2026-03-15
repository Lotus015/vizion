import { Request, Response } from 'express'
import { runGenerateWorkflow } from '../workflows/generate'

export async function generateRoute(req: Request, res: Response) {
  const pageId = req.body?.data?.id
  const userId = req.body?.source?.user_id ?? 'vizion'

  if (!pageId) {
    return res.status(400).json({ error: 'Missing page_id in webhook payload', received: req.body })
  }

  const base = process.env.VIZION_BASE_URL!

  // Respond immediately so Notion doesn't timeout
  res.status(202).json({ ok: true, message: 'Dashboard generation started' })

  // Run workflow in background
  runGenerateWorkflow({
    pageId,
    userId,
    proxyBaseUrl: base,
    refineWebhookUrl: `${base}/api/refine`,
  })
    .then((result) => console.log('[generate] done:', result.appUrl))
    .catch((err) => console.error('[generate] failed:', err.message, err.stack))
}
