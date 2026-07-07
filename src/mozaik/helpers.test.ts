import { describe, it, expect } from 'vitest'
import { parseAgentResult } from './helpers'

describe('parseAgentResult', () => {
  it('returns obj.data when it is a non-string value', () => {
    const result = parseAgentResult<{ name: string }>({ data: { name: 'Alice' } })
    expect(result).toEqual({ name: 'Alice' })
  })

  it('JSON-parses obj.data when it is a string', () => {
    const result = parseAgentResult<{ count: number }>({ data: '{"count":42}' })
    expect(result).toEqual({ count: 42 })
  })

  it('returns the raw object when data is absent', () => {
    const result = parseAgentResult<{ foo: string }>({ foo: 'bar' })
    expect(result).toEqual({ foo: 'bar' })
  })

  it('returns the raw value when it is null', () => {
    const result = parseAgentResult<null>(null)
    expect(result).toBeNull()
  })

  it('returns the raw value when it is undefined', () => {
    const result = parseAgentResult<undefined>(undefined)
    expect(result).toBeUndefined()
  })

  it('returns obj.data when data is a number (falsy but non-null)', () => {
    const result = parseAgentResult<number>({ data: 0 })
    expect(result).toBe(0)
  })

  it('returns obj.data when data is a boolean (falsy but non-null)', () => {
    const result = parseAgentResult<boolean>({ data: false })
    expect(result).toBe(false)
  })

  it('returns obj when data is null explicitly (data is null, not absent)', () => {
    const result = parseAgentResult<{ nested?: string }>({ data: null, other: 'x' })
    // obj?.data != null — null is NOT != null, so it falls through to return obj
    expect(result).toEqual({ data: null, other: 'x' })
  })
})
