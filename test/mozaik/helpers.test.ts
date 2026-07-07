import { parseAgentResult } from '../../src/mozaik/helpers'

describe('parseAgentResult', () => {
  it('returns the object as-is when .data is an object', () => {
    const data = { foo: 'bar', count: 42 }
    const input = { data, usage: { tokens: 100 } }
    expect(parseAgentResult(input)).toEqual(data)
  })

  it('parses .data when it is a JSON string', () => {
    const data = { foo: 'bar', count: 42 }
    const input = { data: JSON.stringify(data), usage: { tokens: 100 } }
    expect(parseAgentResult(input)).toEqual(data)
  })

  it('returns the whole object when it has no .data property', () => {
    const input = { message: 'hello', nested: { a: 1 } }
    expect(parseAgentResult(input)).toEqual(input)
  })

  it('returns null as-is without throwing', () => {
    expect(parseAgentResult(null)).toBeNull()
  })

  it('returns undefined as-is without throwing', () => {
    expect(parseAgentResult(undefined)).toBeUndefined()
  })

  it('returns the raw value when .data is null', () => {
    const input = { data: null }
    const result = parseAgentResult(input)
    expect(result).toEqual(input)
  })

  it('returns the raw value when .data is undefined', () => {
    const input = { data: undefined }
    // When data is explicitly undefined, obj?.data != null is false
    // so the raw object is returned
    const result = parseAgentResult(input)
    expect(result).toEqual(input)
  })
})
