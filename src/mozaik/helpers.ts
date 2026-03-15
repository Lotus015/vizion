/** Mozaik act() returns { data, usage } — extract the data payload */
export function parseAgentResult<T>(raw: unknown): T {
  const obj = raw as any
  if (obj?.data != null) {
    return typeof obj.data === 'string' ? JSON.parse(obj.data) as T : obj.data as T
  }
  return obj as T
}
