/**
 * Normalizes Notion database query results into flat objects.
 * Notion returns deeply nested property structures — this flattens them
 * into simple { key: value } rows usable by React dashboards.
 */
export function normalizeRows(pages: any[]): Record<string, any>[] {
  return pages.map((page) => {
    const row: Record<string, any> = { id: page.id }

    for (const [key, prop] of Object.entries(page.properties)) {
      row[key] = extractValue(prop as any)
    }

    return row
  })
}

function extractValue(prop: any): any {
  switch (prop.type) {
    case 'title':
      return prop.title?.[0]?.plain_text ?? ''
    case 'rich_text':
      return prop.rich_text?.map((t: any) => t.plain_text).join('') ?? ''
    case 'number':
      return prop.number
    case 'select':
      return prop.select?.name ?? null
    case 'multi_select':
      return prop.multi_select?.map((s: any) => s.name) ?? []
    case 'status':
      return prop.status?.name ?? null
    case 'date':
      return prop.date?.start ?? null
    case 'checkbox':
      return prop.checkbox ?? false
    case 'url':
      return prop.url ?? null
    case 'email':
      return prop.email ?? null
    case 'phone_number':
      return prop.phone_number ?? null
    case 'formula':
      return extractFormula(prop.formula)
    case 'rollup':
      return extractRollup(prop.rollup)
    case 'relation':
      return prop.relation?.map((r: any) => r.id) ?? []
    case 'people':
      return prop.people?.map((p: any) => p.name ?? p.id) ?? []
    case 'created_time':
      return prop.created_time
    case 'last_edited_time':
      return prop.last_edited_time
    case 'created_by':
      return prop.created_by?.name ?? prop.created_by?.id ?? null
    case 'last_edited_by':
      return prop.last_edited_by?.name ?? prop.last_edited_by?.id ?? null
    case 'files':
      return prop.files?.map((f: any) => f.file?.url ?? f.external?.url) ?? []
    default:
      return null
  }
}

function extractFormula(formula: any): any {
  if (!formula) return null
  switch (formula.type) {
    case 'string': return formula.string
    case 'number': return formula.number
    case 'boolean': return formula.boolean
    case 'date': return formula.date?.start ?? null
    default: return null
  }
}

function extractRollup(rollup: any): any {
  if (!rollup) return null
  switch (rollup.type) {
    case 'number': return rollup.number
    case 'date': return rollup.date?.start ?? null
    case 'array': return rollup.array?.map((item: any) => extractValue(item)) ?? []
    default: return null
  }
}
