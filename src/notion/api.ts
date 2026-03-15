import { Client } from '@notionhq/client'

export function notion() {
  return new Client({ auth: process.env.NOTION_API_KEY })
}

/** Normalize a Notion UUID — strip extra dashes that LLMs sometimes introduce */
export function cleanId(id: string): string {
  const hex = id.replace(/-/g, '')
  if (hex.length === 32) {
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
  }
  return id
}

/** Leave a comment on a Notion page, optionally @mentioning a user */
export async function notifyUser(pageId: string, userId: string, message: string) {
  const n = notion()
  const richText: any[] = []

  if (userId && userId !== 'vizion') {
    richText.push({
      type: 'mention',
      mention: { type: 'user', user: { id: userId } },
    })
    richText.push({ type: 'text', text: { content: ' ' } })
  }

  richText.push({ type: 'text', text: { content: message } })

  await n.comments.create({
    parent: { page_id: cleanId(pageId) },
    rich_text: richText,
  })
}

/** Find the embed block on a page and update its URL */
export async function updateEmbed(pageId: string, newAppUrl: string) {
  const n = notion()
  const id = cleanId(pageId)
  const blocks = await n.blocks.children.list({ block_id: id, page_size: 100 })

  const embedBlock = blocks.results.find((b: any) => b.type === 'embed')
  if (!embedBlock) throw new Error('No embed block found on page')

  await n.blocks.update({
    block_id: embedBlock.id,
    embed: { url: newAppUrl },
  } as any)
}
