import { Request, Response } from 'express'
import { runGenerateWorkflow } from '../workflows/vizion-generate'

export async function generateRoute(req: Request, res: Response) {
  const pageId = req.body?.data?.id
  const databaseId = req.body?.data?.parent?.database_id

  if (!pageId || !databaseId) {
    return res.status(400).json({ error: 'Missing page_id or database_id', received: req.body })
  }

  const base = process.env.VIZION_BASE_URL!

  try {
    const result = await runGenerateWorkflow({
      pageId,
      databaseId,
      proxyBaseUrl: base,
      refineWebhookUrl: `${base}/api/refine`,
    })
    return res.status(200).json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[generate]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
