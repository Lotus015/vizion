import { Request, Response } from 'express'
import { runGenerateWorkflow } from '../workflows/vizion-generate'

export async function generateRoute(req: Request, res: Response) {
  const pageId = req.body?.data?.id

  if (!pageId) {
    return res.status(400).json({ error: 'Missing page_id in webhook payload', received: req.body })
  }

  const base = process.env.VIZION_BASE_URL!

  try {
    const result = await runGenerateWorkflow({
      pageId,
      proxyBaseUrl: base,
      refineWebhookUrl: `${base}/api/refine`,
    })
    return res.status(200).json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[generate]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
