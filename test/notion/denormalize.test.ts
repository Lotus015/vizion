import { denormalizeProperties } from '../../src/notion/denormalize'

const writableSchema: Record<string, { type: string }> = {
  Title: { type: 'title' },
  Description: { type: 'rich_text' },
  Price: { type: 'number' },
  Category: { type: 'select' },
  Tags: { type: 'multi_select' },
  Stage: { type: 'status' },
  DueDate: { type: 'date' },
  Active: { type: 'checkbox' },
  Website: { type: 'url' },
  Email: { type: 'email' },
  Phone: { type: 'phone_number' },
}

const readOnlySchema: Record<string, { type: string }> = {
  Formula: { type: 'formula' },
  Rollup: { type: 'rollup' },
  Relation: { type: 'relation' },
  People: { type: 'people' },
  Created: { type: 'created_time' },
  Edited: { type: 'last_edited_time' },
  Creator: { type: 'created_by' },
  Editor: { type: 'last_edited_by' },
  Files: { type: 'files' },
}

describe('denormalizeProperties', () => {
  describe('writable types round-trip', () => {
    it('denormalizes title', () => {
      const flat = { Title: 'Hello World' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Title).toEqual({ title: [{ text: { content: 'Hello World' } }] })
    })

    it('denormalizes title with empty string', () => {
      const flat = { Title: '' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Title).toEqual({ title: [{ text: { content: '' } }] })
    })

    it('coerces title to string', () => {
      const flat = { Title: 42 }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Title).toEqual({ title: [{ text: { content: '42' } }] })
    })

    it('denormalizes rich_text', () => {
      const flat = { Description: 'Some description' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Description).toEqual({ rich_text: [{ text: { content: 'Some description' } }] })
    })

    it('denormalizes rich_text as empty string', () => {
      const flat = { Description: '' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Description).toEqual({ rich_text: [{ text: { content: '' } }] })
    })

    it('denormalizes number', () => {
      const flat = { Price: 29.99 }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Price).toEqual({ number: 29.99 })
    })

    it('denormalizes number as null when value is null', () => {
      const flat = { Price: null }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Price).toEqual({ number: null })
    })

    it('denormalizes number as null when value is empty string', () => {
      const flat = { Price: '' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Price).toEqual({ number: null })
    })

    it('coerces number string to Number', () => {
      const flat = { Price: '42' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Price).toEqual({ number: 42 })
    })

    it('denormalizes select with a value', () => {
      const flat = { Category: 'Electronics' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Category).toEqual({ select: { name: 'Electronics' } })
    })

    it('denormalizes select as {select: null} when value is null', () => {
      const flat = { Category: null }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Category).toEqual({ select: null })
    })

    it('denormalizes select as {select: null} when value is empty string', () => {
      const flat = { Category: '' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Category).toEqual({ select: null })
    })

    it('denormalizes select as {select: null} when value is false', () => {
      const flat = { Category: false }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Category).toEqual({ select: null })
    })

    it('denormalizes multi_select with array value', () => {
      const flat = { Tags: ['tag1', 'tag2'] }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Tags).toEqual({
        multi_select: [{ name: 'tag1' }, { name: 'tag2' }],
      })
    })

    it('coerces scalar multi_select value to array', () => {
      const flat = { Tags: 'single-tag' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Tags).toEqual({
        multi_select: [{ name: 'single-tag' }],
      })
    })

    it('filters falsy values from multi_select array', () => {
      const flat = { Tags: ['a', null, 'b', '', undefined, 'c'] }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Tags).toEqual({
        multi_select: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      })
    })

    it('denormalizes status with a value', () => {
      const flat = { Stage: 'In Progress' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Stage).toEqual({ status: { name: 'In Progress' } })
    })

    it('denormalizes status as null when value is null', () => {
      const flat = { Stage: null }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Stage).toEqual({ status: null })
    })

    it('denormalizes status as {status: null} when value is empty string', () => {
      const flat = { Stage: '' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Stage).toEqual({ status: null })
    })

    it('denormalizes date with a value', () => {
      const flat = { DueDate: '2024-06-15' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.DueDate).toEqual({ date: { start: '2024-06-15' } })
    })

    it('denormalizes date as null when value is null', () => {
      const flat = { DueDate: null }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.DueDate).toEqual({ date: null })
    })

    it('denormalizes checkbox as true', () => {
      const flat = { Active: true }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Active).toEqual({ checkbox: true })
    })

    it('denormalizes checkbox as false', () => {
      const flat = { Active: false }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Active).toEqual({ checkbox: false })
    })

    it('coerces truthy values to boolean for checkbox', () => {
      const flat = { Active: 1 }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Active).toEqual({ checkbox: true })
    })

    it('coerces falsy values to boolean for checkbox', () => {
      const flat = { Active: 0 }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Active).toEqual({ checkbox: false })
    })

    it('denormalizes url with a value', () => {
      const flat = { Website: 'https://example.com' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Website).toEqual({ url: 'https://example.com' })
    })

    it('denormalizes url as null when value is null', () => {
      const flat = { Website: null }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Website).toEqual({ url: null })
    })

    it('denormalizes url as null when value is empty string', () => {
      const flat = { Website: '' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Website).toEqual({ url: null })
    })

    it('denormalizes email with a value', () => {
      const flat = { Email: 'test@example.com' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Email).toEqual({ email: 'test@example.com' })
    })

    it('denormalizes email as null when value is null', () => {
      const flat = { Email: null }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Email).toEqual({ email: null })
    })

    it('denormalizes phone_number with a value', () => {
      const flat = { Phone: '+1-555-1234' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Phone).toEqual({ phone_number: '+1-555-1234' })
    })

    it('denormalizes phone_number as null when value is null', () => {
      const flat = { Phone: null }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result.Phone).toEqual({ phone_number: null })
    })
  })

  describe('id key is skipped', () => {
    it('omits the id key from the result', () => {
      const flat = { id: 'page-abc123', Title: 'Test', Price: 10 }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result).not.toHaveProperty('id')
      expect(result.Title).toBeDefined()
    })
  })

  describe('unknown schema key is skipped', () => {
    it('omits properties not present in the schema', () => {
      const flat = { Title: 'Test', UnknownField: 'should be ignored' }
      const result = denormalizeProperties(flat, writableSchema)
      expect(result).not.toHaveProperty('UnknownField')
      expect(result.Title).toBeDefined()
    })

    it('skips entry when propType is undefined', () => {
      const flat = { NoType: 'value' }
      const schema = { NoType: {} as { type: string } } // type is undefined
      const result = denormalizeProperties(flat, schema)
      expect(result).not.toHaveProperty('NoType')
    })
  })

  describe('read-only types return undefined', () => {
    it('formula returns undefined (removed by caller)', () => {
      const flat = { Formula: 'some value' }
      const result = denormalizeProperties(flat, readOnlySchema)
      expect(result.Formula).toBeUndefined()
    })

    it('rollup returns undefined', () => {
      const flat = { Rollup: 42 }
      const result = denormalizeProperties(flat, readOnlySchema)
      expect(result.Rollup).toBeUndefined()
    })

    it('relation returns undefined', () => {
      const flat = { Relation: ['rel-1'] }
      const result = denormalizeProperties(flat, readOnlySchema)
      expect(result.Relation).toBeUndefined()
    })

    it('people returns undefined', () => {
      const flat = { People: ['Alice'] }
      const result = denormalizeProperties(flat, readOnlySchema)
      expect(result.People).toBeUndefined()
    })

    it('created_time returns undefined', () => {
      const flat = { Created: '2024-01-01T00:00:00.000Z' }
      const result = denormalizeProperties(flat, readOnlySchema)
      expect(result.Created).toBeUndefined()
    })

    it('last_edited_time returns undefined', () => {
      const flat = { Edited: '2024-01-01T00:00:00.000Z' }
      const result = denormalizeProperties(flat, readOnlySchema)
      expect(result.Edited).toBeUndefined()
    })

    it('created_by returns undefined', () => {
      const flat = { Creator: 'Bob' }
      const result = denormalizeProperties(flat, readOnlySchema)
      expect(result.Creator).toBeUndefined()
    })

    it('last_edited_by returns undefined', () => {
      const flat = { Editor: 'Carol' }
      const result = denormalizeProperties(flat, readOnlySchema)
      expect(result.Editor).toBeUndefined()
    })

    it('files returns undefined', () => {
      const flat = { Files: ['https://example.com/file.pdf'] }
      const result = denormalizeProperties(flat, readOnlySchema)
      expect(result.Files).toBeUndefined()
    })
  })

  describe('empty input', () => {
    it('returns empty object when flat is empty', () => {
      const result = denormalizeProperties({}, writableSchema)
      expect(result).toEqual({})
    })

    it('returns empty object when flat has only id', () => {
      const result = denormalizeProperties({ id: 'page-1' }, writableSchema)
      expect(result).toEqual({})
    })
  })

  describe('mixed writable and read-only', () => {
    it('denormalizes writable fields and skips read-only fields', () => {
      const flat = { Title: 'Product', Formula: 'should be ignored', Price: 50 }
      const schema = { Title: { type: 'title' }, Formula: { type: 'formula' }, Price: { type: 'number' } }
      const result = denormalizeProperties(flat, schema)
      expect(result.Title).toBeDefined()
      expect(result.Price).toBeDefined()
      expect(result.Formula).toBeUndefined()
    })
  })
})
