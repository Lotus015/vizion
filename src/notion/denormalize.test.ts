import { describe, it, expect } from 'vitest'
import { denormalizeProperties } from './denormalize'

const schema = {
  Title: { type: 'title' },
  Notes: { type: 'rich_text' },
  Score: { type: 'number' },
  Category: { type: 'select' },
  Tags: { type: 'multi_select' },
  Status: { type: 'status' },
  DueDate: { type: 'date' },
  Active: { type: 'checkbox' },
  Website: { type: 'url' },
  Email: { type: 'email' },
  Phone: { type: 'phone_number' },
  Formula: { type: 'formula' },
  Rollup: { type: 'rollup' },
  Relation: { type: 'relation' },
  People: { type: 'people' },
}

describe('denormalizeProperties', () => {
  it('skips the id key', () => {
    const result = denormalizeProperties({ id: 'page-1', Title: 'Hello' }, schema)
    expect(result).not.toHaveProperty('id')
  })

  it('skips properties not present in the schema', () => {
    const result = denormalizeProperties({ Unknown: 'val', Title: 'Hello' }, schema)
    expect(result).not.toHaveProperty('Unknown')
    expect(result.Title).toBeDefined()
  })

  describe('type: title', () => {
    it('wraps the value in a Notion title block', () => {
      const result = denormalizeProperties({ Title: 'Dashboard Name' }, schema)
      expect(result.Title).toEqual({ title: [{ text: { content: 'Dashboard Name' } }] })
    })

    it('coerces non-string values to string', () => {
      const result = denormalizeProperties({ Title: 42 }, schema)
      expect(result.Title).toEqual({ title: [{ text: { content: '42' } }] })
    })

    it('handles null by converting to empty string', () => {
      const result = denormalizeProperties({ Title: null }, schema)
      expect(result.Title).toEqual({ title: [{ text: { content: '' } }] })
    })
  })

  describe('type: rich_text', () => {
    it('wraps the value in a Notion rich_text block', () => {
      const result = denormalizeProperties({ Notes: 'Some notes' }, schema)
      expect(result.Notes).toEqual({ rich_text: [{ text: { content: 'Some notes' } }] })
    })

    it('coerces non-string values to string', () => {
      const result = denormalizeProperties({ Notes: true }, schema)
      expect(result.Notes).toEqual({ rich_text: [{ text: { content: 'true' } }] })
    })
  })

  describe('type: number', () => {
    it('converts valid numeric strings to numbers', () => {
      const result = denormalizeProperties({ Score: '42' }, schema)
      expect(result.Score).toEqual({ number: 42 })
    })

    it('passes numbers through', () => {
      const result = denormalizeProperties({ Score: 3.14 }, schema)
      expect(result.Score).toEqual({ number: 3.14 })
    })

    it('returns null when value is null', () => {
      const result = denormalizeProperties({ Score: null }, schema)
      expect(result.Score).toEqual({ number: null })
    })

    it('returns null when value is empty string', () => {
      const result = denormalizeProperties({ Score: '' }, schema)
      expect(result.Score).toEqual({ number: null })
    })
  })

  describe('type: select', () => {
    it('wraps truthy value in a select object', () => {
      const result = denormalizeProperties({ Category: 'Done' }, schema)
      expect(result.Category).toEqual({ select: { name: 'Done' } })
    })

    it('returns { select: null } for falsy value', () => {
      const result = denormalizeProperties({ Category: null }, schema)
      expect(result.Category).toEqual({ select: null })
    })

    it('returns { select: null } for empty string', () => {
      const result = denormalizeProperties({ Category: '' }, schema)
      expect(result.Category).toEqual({ select: null })
    })
  })

  describe('type: multi_select', () => {
    it('handles an array of values', () => {
      const result = denormalizeProperties({ Tags: ['A', 'B'] }, schema)
      expect(result.Tags).toEqual({
        multi_select: [{ name: 'A' }, { name: 'B' }],
      })
    })

    it('handles a single scalar value', () => {
      const result = denormalizeProperties({ Tags: 'A' }, schema)
      expect(result.Tags).toEqual({
        multi_select: [{ name: 'A' }],
      })
    })

    it('filters out falsy entries', () => {
      const result = denormalizeProperties({ Tags: ['A', '', null, 'B'] }, schema)
      expect(result.Tags).toEqual({
        multi_select: [{ name: 'A' }, { name: 'B' }],
      })
    })

    it('returns empty array when value is null', () => {
      const result = denormalizeProperties({ Tags: null }, schema)
      expect(result.Tags).toEqual({ multi_select: [] })
    })
  })

  describe('type: status', () => {
    it('wraps truthy value in a status object', () => {
      const result = denormalizeProperties({ Status: 'In Progress' }, schema)
      expect(result.Status).toEqual({ status: { name: 'In Progress' } })
    })

    it('returns { status: null } for falsy value', () => {
      const result = denormalizeProperties({ Status: null }, schema)
      expect(result.Status).toEqual({ status: null })
    })
  })

  describe('type: date', () => {
    it('wraps truthy value in a date object', () => {
      const result = denormalizeProperties({ DueDate: '2024-01-15' }, schema)
      expect(result.DueDate).toEqual({ date: { start: '2024-01-15' } })
    })

    it('returns { date: null } for null value', () => {
      const result = denormalizeProperties({ DueDate: null }, schema)
      expect(result.DueDate).toEqual({ date: null })
    })

    it('returns { date: null } for empty string', () => {
      const result = denormalizeProperties({ DueDate: '' }, schema)
      expect(result.DueDate).toEqual({ date: null })
    })
  })

  describe('type: checkbox', () => {
    it('coerces true to boolean true', () => {
      const result = denormalizeProperties({ Active: true }, schema)
      expect(result.Active).toEqual({ checkbox: true })
    })

    it('coerces false to boolean false', () => {
      const result = denormalizeProperties({ Active: false }, schema)
      expect(result.Active).toEqual({ checkbox: false })
    })

    it('coerces truthy strings to boolean true', () => {
      const result = denormalizeProperties({ Active: 'yes' }, schema)
      expect(result.Active).toEqual({ checkbox: true })
    })

    it('coerces 0 to boolean false', () => {
      const result = denormalizeProperties({ Active: 0 }, schema)
      expect(result.Active).toEqual({ checkbox: false })
    })

    it('coerces null to boolean false', () => {
      const result = denormalizeProperties({ Active: null }, schema)
      expect(result.Active).toEqual({ checkbox: false })
    })
  })

  describe('type: url', () => {
    it('wraps a truthy url', () => {
      const result = denormalizeProperties({ Website: 'https://example.com' }, schema)
      expect(result.Website).toEqual({ url: 'https://example.com' })
    })

    it('returns { url: null } for null', () => {
      const result = denormalizeProperties({ Website: null }, schema)
      expect(result.Website).toEqual({ url: null })
    })

    it('returns { url: null } for empty string', () => {
      const result = denormalizeProperties({ Website: '' }, schema)
      expect(result.Website).toEqual({ url: null })
    })
  })

  describe('type: email', () => {
    it('wraps a truthy email', () => {
      const result = denormalizeProperties({ Email: 'a@b.com' }, schema)
      expect(result.Email).toEqual({ email: 'a@b.com' })
    })

    it('returns { email: null } for null', () => {
      const result = denormalizeProperties({ Email: null }, schema)
      expect(result.Email).toEqual({ email: null })
    })
  })

  describe('type: phone_number', () => {
    it('wraps a truthy phone number', () => {
      const result = denormalizeProperties({ Phone: '+1-555-1234' }, schema)
      expect(result.Phone).toEqual({ phone_number: '+1-555-1234' })
    })

    it('returns { phone_number: null } for null', () => {
      const result = denormalizeProperties({ Phone: null }, schema)
      expect(result.Phone).toEqual({ phone_number: null })
    })
  })

  describe('read-only types', () => {
    it('returns undefined for formula', () => {
      const result = denormalizeProperties({ Formula: 'computed' }, schema)
      expect(result.Formula).toBeUndefined()
    })

    it('returns undefined for rollup', () => {
      const result = denormalizeProperties({ Rollup: 99 }, schema)
      expect(result.Rollup).toBeUndefined()
    })

    it('returns undefined for relation', () => {
      const result = denormalizeProperties({ Relation: ['r1'] }, schema)
      expect(result.Relation).toBeUndefined()
    })

    it('returns undefined for people', () => {
      const result = denormalizeProperties({ People: ['Alice'] }, schema)
      expect(result.People).toBeUndefined()
    })

    it('returns undefined for any type not in the switch', () => {
      const schemaWithUnknown = { Custom: { type: 'unknown_type' } }
      const result = denormalizeProperties({ Custom: 'val' }, schemaWithUnknown)
      expect(result.Custom).toBeUndefined()
    })
  })

  it('handles multiple properties at once', () => {
    const result = denormalizeProperties(
      { Title: 'My Page', Score: 100, Active: true, Category: 'Active', Tags: ['a', 'b'] },
      schema,
    )
    expect(result).toEqual({
      Title: { title: [{ text: { content: 'My Page' } }] },
      Score: { number: 100 },
      Active: { checkbox: true },
      Category: { select: { name: 'Active' } },
      Tags: { multi_select: [{ name: 'a' }, { name: 'b' }] },
    })
  })

  it('returns an empty object when no schema-matched properties exist', () => {
    const result = denormalizeProperties({ id: 'p1', unknownProp: 'val' }, schema)
    expect(result).toEqual({})
  })
})
