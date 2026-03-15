/**
 * Converts flat { key: value } properties back into Notion's nested format.
 * Requires the database schema to know each property's type.
 */
export function denormalizeProperties(
  flat: Record<string, any>,
  schema: Record<string, { type: string }>
): Record<string, any> {
  const properties: Record<string, any> = {}

  for (const [key, value] of Object.entries(flat)) {
    if (key === 'id') continue // skip row ID
    const propType = schema[key]?.type
    if (!propType) continue // skip unknown properties

    properties[key] = toNotionProperty(propType, value)
  }

  return properties
}

function toNotionProperty(type: string, value: any): any {
  switch (type) {
    case 'title':
      return { title: [{ text: { content: String(value ?? '') } }] }
    case 'rich_text':
      return { rich_text: [{ text: { content: String(value ?? '') } }] }
    case 'number':
      return { number: value === null || value === '' ? null : Number(value) }
    case 'select':
      return value ? { select: { name: String(value) } } : { select: null }
    case 'multi_select':
      return {
        multi_select: (Array.isArray(value) ? value : [value])
          .filter(Boolean)
          .map((name: string) => ({ name: String(name) })),
      }
    case 'status':
      return value ? { status: { name: String(value) } } : { status: null }
    case 'date':
      return value ? { date: { start: String(value) } } : { date: null }
    case 'checkbox':
      return { checkbox: Boolean(value) }
    case 'url':
      return { url: value ? String(value) : null }
    case 'email':
      return { email: value ? String(value) : null }
    case 'phone_number':
      return { phone_number: value ? String(value) : null }
    default:
      // formula, rollup, relation, people, etc. are read-only
      return undefined
  }
}
