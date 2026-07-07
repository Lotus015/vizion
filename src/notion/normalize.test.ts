import { describe, it, expect } from 'vitest'
import { normalizeRows } from './normalize'

describe('normalizeRows', () => {
  it('extracts the page id', () => {
    const pages = [{ id: 'abc123', properties: {} }]
    const rows = normalizeRows(pages)
    expect(rows[0].id).toBe('abc123')
  })

  describe('property type: title', () => {
    it('extracts title plain_text', () => {
      const pages = [{
        id: 'p1',
        properties: { Name: { type: 'title', title: [{ plain_text: 'Hello' }] } },
      }]
      expect(normalizeRows(pages)[0].Name).toBe('Hello')
    })

    it('returns empty string when title array is empty', () => {
      const pages = [{
        id: 'p1',
        properties: { Name: { type: 'title', title: [] } },
      }]
      expect(normalizeRows(pages)[0].Name).toBe('')
    })

    it('returns empty string when title is undefined', () => {
      const pages = [{
        id: 'p1',
        properties: { Name: { type: 'title' } },
      }]
      expect(normalizeRows(pages)[0].Name).toBe('')
    })
  })

  describe('property type: rich_text', () => {
    it('joins multiple rich_text entries', () => {
      const pages = [{
        id: 'p1',
        properties: { Notes: { type: 'rich_text', rich_text: [{ plain_text: 'a' }, { plain_text: 'b' }] } },
      }]
      expect(normalizeRows(pages)[0].Notes).toBe('ab')
    })

    it('returns empty string when rich_text is undefined', () => {
      const pages = [{
        id: 'p1',
        properties: { Notes: { type: 'rich_text' } },
      }]
      expect(normalizeRows(pages)[0].Notes).toBe('')
    })
  })

  describe('property type: number', () => {
    it('extracts the number value', () => {
      const pages = [{
        id: 'p1',
        properties: { Price: { type: 'number', number: 19.99 } },
      }]
      expect(normalizeRows(pages)[0].Price).toBe(19.99)
    })

    it('returns null when number is null', () => {
      const pages = [{
        id: 'p1',
        properties: { Price: { type: 'number', number: null } },
      }]
      expect(normalizeRows(pages)[0].Price).toBeNull()
    })
  })

  describe('property type: select', () => {
    it('extracts the select name', () => {
      const pages = [{
        id: 'p1',
        properties: { Status: { type: 'select', select: { name: 'Done' } } },
      }]
      expect(normalizeRows(pages)[0].Status).toBe('Done')
    })

    it('returns null when select is absent', () => {
      const pages = [{
        id: 'p1',
        properties: { Status: { type: 'select' } },
      }]
      expect(normalizeRows(pages)[0].Status).toBeNull()
    })

    it('returns null when select is null', () => {
      const pages = [{
        id: 'p1',
        properties: { Status: { type: 'select', select: null } },
      }]
      expect(normalizeRows(pages)[0].Status).toBeNull()
    })
  })

  describe('property type: multi_select', () => {
    it('extracts all names as an array', () => {
      const pages = [{
        id: 'p1',
        properties: { Tags: { type: 'multi_select', multi_select: [{ name: 'A' }, { name: 'B' }] } },
      }]
      expect(normalizeRows(pages)[0].Tags).toEqual(['A', 'B'])
    })

    it('returns empty array when multi_select is undefined', () => {
      const pages = [{
        id: 'p1',
        properties: { Tags: { type: 'multi_select' } },
      }]
      expect(normalizeRows(pages)[0].Tags).toEqual([])
    })

    it('returns empty array when multi_select is empty', () => {
      const pages = [{
        id: 'p1',
        properties: { Tags: { type: 'multi_select', multi_select: [] } },
      }]
      expect(normalizeRows(pages)[0].Tags).toEqual([])
    })
  })

  describe('property type: status', () => {
    it('extracts the status name', () => {
      const pages = [{
        id: 'p1',
        properties: { Progress: { type: 'status', status: { name: 'In Progress' } } },
      }]
      expect(normalizeRows(pages)[0].Progress).toBe('In Progress')
    })

    it('returns null when status is absent', () => {
      const pages = [{
        id: 'p1',
        properties: { Progress: { type: 'status' } },
      }]
      expect(normalizeRows(pages)[0].Progress).toBeNull()
    })
  })

  describe('property type: date', () => {
    it('extracts the date start', () => {
      const pages = [{
        id: 'p1',
        properties: { Due: { type: 'date', date: { start: '2024-01-15' } } },
      }]
      expect(normalizeRows(pages)[0].Due).toBe('2024-01-15')
    })

    it('returns null when date is absent', () => {
      const pages = [{
        id: 'p1',
        properties: { Due: { type: 'date' } },
      }]
      expect(normalizeRows(pages)[0].Due).toBeNull()
    })
  })

  describe('property type: checkbox', () => {
    it('extracts true', () => {
      const pages = [{
        id: 'p1',
        properties: { Active: { type: 'checkbox', checkbox: true } },
      }]
      expect(normalizeRows(pages)[0].Active).toBe(true)
    })

    it('extracts false', () => {
      const pages = [{
        id: 'p1',
        properties: { Active: { type: 'checkbox', checkbox: false } },
      }]
      expect(normalizeRows(pages)[0].Active).toBe(false)
    })

    it('defaults to false when checkbox is undefined', () => {
      const pages = [{
        id: 'p1',
        properties: { Active: { type: 'checkbox' } },
      }]
      expect(normalizeRows(pages)[0].Active).toBe(false)
    })
  })

  describe('property type: url', () => {
    it('extracts the url', () => {
      const pages = [{
        id: 'p1',
        properties: { Link: { type: 'url', url: 'https://example.com' } },
      }]
      expect(normalizeRows(pages)[0].Link).toBe('https://example.com')
    })

    it('returns null when url is absent', () => {
      const pages = [{
        id: 'p1',
        properties: { Link: { type: 'url' } },
      }]
      expect(normalizeRows(pages)[0].Link).toBeNull()
    })
  })

  describe('property type: email', () => {
    it('extracts the email', () => {
      const pages = [{
        id: 'p1',
        properties: { Email: { type: 'email', email: 'a@b.com' } },
      }]
      expect(normalizeRows(pages)[0].Email).toBe('a@b.com')
    })

    it('returns null when email is absent', () => {
      const pages = [{
        id: 'p1',
        properties: { Email: { type: 'email' } },
      }]
      expect(normalizeRows(pages)[0].Email).toBeNull()
    })
  })

  describe('property type: phone_number', () => {
    it('extracts the phone number', () => {
      const pages = [{
        id: 'p1',
        properties: { Phone: { type: 'phone_number', phone_number: '+1-555-1234' } },
      }]
      expect(normalizeRows(pages)[0].Phone).toBe('+1-555-1234')
    })

    it('returns null when phone_number is absent', () => {
      const pages = [{
        id: 'p1',
        properties: { Phone: { type: 'phone_number' } },
      }]
      expect(normalizeRows(pages)[0].Phone).toBeNull()
    })
  })

  describe('property type: formula', () => {
    it('extracts string formula', () => {
      const pages = [{
        id: 'p1',
        properties: { F: { type: 'formula', formula: { type: 'string', string: 'computed' } } },
      }]
      expect(normalizeRows(pages)[0].F).toBe('computed')
    })

    it('extracts number formula', () => {
      const pages = [{
        id: 'p1',
        properties: { F: { type: 'formula', formula: { type: 'number', number: 42 } } },
      }]
      expect(normalizeRows(pages)[0].F).toBe(42)
    })

    it('extracts boolean formula', () => {
      const pages = [{
        id: 'p1',
        properties: { F: { type: 'formula', formula: { type: 'boolean', boolean: true } } },
      }]
      expect(normalizeRows(pages)[0].F).toBe(true)
    })

    it('extracts date formula start', () => {
      const pages = [{
        id: 'p1',
        properties: { F: { type: 'formula', formula: { type: 'date', date: { start: '2024-06-01' } } } },
      }]
      expect(normalizeRows(pages)[0].F).toBe('2024-06-01')
    })

    it('returns null when formula is absent', () => {
      const pages = [{
        id: 'p1',
        properties: { F: { type: 'formula' } },
      }]
      expect(normalizeRows(pages)[0].F).toBeNull()
    })

    it('returns null when formula type is unknown', () => {
      const pages = [{
        id: 'p1',
        properties: { F: { type: 'formula', formula: { type: 'unknown' } } },
      }]
      expect(normalizeRows(pages)[0].F).toBeNull()
    })
  })

  describe('property type: rollup', () => {
    it('extracts number rollup', () => {
      const pages = [{
        id: 'p1',
        properties: { R: { type: 'rollup', rollup: { type: 'number', number: 99 } } },
      }]
      expect(normalizeRows(pages)[0].R).toBe(99)
    })

    it('extracts date rollup start', () => {
      const pages = [{
        id: 'p1',
        properties: { R: { type: 'rollup', rollup: { type: 'date', date: { start: '2024-07-01' } } } },
      }]
      expect(normalizeRows(pages)[0].R).toBe('2024-07-01')
    })

    it('extracts array rollup by recursively extracting values', () => {
      const pages = [{
        id: 'p1',
        properties: {
          R: {
            type: 'rollup',
            rollup: {
              type: 'array',
              array: [
                { type: 'title', title: [{ plain_text: 'item1' }] },
                { type: 'title', title: [{ plain_text: 'item2' }] },
              ],
            },
          },
        },
      }]
      expect(normalizeRows(pages)[0].R).toEqual(['item1', 'item2'])
    })

    it('returns null when rollup is absent', () => {
      const pages = [{
        id: 'p1',
        properties: { R: { type: 'rollup' } },
      }]
      expect(normalizeRows(pages)[0].R).toBeNull()
    })

    it('returns null when rollup type is unknown', () => {
      const pages = [{
        id: 'p1',
        properties: { R: { type: 'rollup', rollup: { type: 'unsupported' } } },
      }]
      expect(normalizeRows(pages)[0].R).toBeNull()
    })
  })

  describe('property type: relation', () => {
    it('extracts relation ids as an array', () => {
      const pages = [{
        id: 'p1',
        properties: { Rel: { type: 'relation', relation: [{ id: 'r1' }, { id: 'r2' }] } },
      }]
      expect(normalizeRows(pages)[0].Rel).toEqual(['r1', 'r2'])
    })

    it('returns empty array when relation is undefined', () => {
      const pages = [{
        id: 'p1',
        properties: { Rel: { type: 'relation' } },
      }]
      expect(normalizeRows(pages)[0].Rel).toEqual([])
    })
  })

  describe('property type: people', () => {
    it('extracts people names', () => {
      const pages = [{
        id: 'p1',
        properties: { Assignee: { type: 'people', people: [{ name: 'Alice' }, { name: 'Bob' }] } },
      }]
      expect(normalizeRows(pages)[0].Assignee).toEqual(['Alice', 'Bob'])
    })

    it('falls back to id when name is missing', () => {
      const pages = [{
        id: 'p1',
        properties: { Assignee: { type: 'people', people: [{ id: 'uuid-1' }, { name: 'Alice' }] } },
      }]
      expect(normalizeRows(pages)[0].Assignee).toEqual(['uuid-1', 'Alice'])
    })

    it('returns empty array when people is undefined', () => {
      const pages = [{
        id: 'p1',
        properties: { Assignee: { type: 'people' } },
      }]
      expect(normalizeRows(pages)[0].Assignee).toEqual([])
    })
  })

  describe('property type: created_time', () => {
    it('extracts created_time string', () => {
      const pages = [{
        id: 'p1',
        properties: { Created: { type: 'created_time', created_time: '2024-01-01T00:00:00.000Z' } },
      }]
      expect(normalizeRows(pages)[0].Created).toBe('2024-01-01T00:00:00.000Z')
    })
  })

  describe('property type: last_edited_time', () => {
    it('extracts last_edited_time string', () => {
      const pages = [{
        id: 'p1',
        properties: { Edited: { type: 'last_edited_time', last_edited_time: '2024-02-01T00:00:00.000Z' } },
      }]
      expect(normalizeRows(pages)[0].Edited).toBe('2024-02-01T00:00:00.000Z')
    })
  })

  describe('property type: created_by', () => {
    it('extracts created_by name', () => {
      const pages = [{
        id: 'p1',
        properties: { Creator: { type: 'created_by', created_by: { name: 'Alice' } } },
      }]
      expect(normalizeRows(pages)[0].Creator).toBe('Alice')
    })

    it('falls back to id when name is missing', () => {
      const pages = [{
        id: 'p1',
        properties: { Creator: { type: 'created_by', created_by: { id: 'uuid-1' } } },
      }]
      expect(normalizeRows(pages)[0].Creator).toBe('uuid-1')
    })

    it('returns null when created_by is absent', () => {
      const pages = [{
        id: 'p1',
        properties: { Creator: { type: 'created_by' } },
      }]
      expect(normalizeRows(pages)[0].Creator).toBeNull()
    })
  })

  describe('property type: last_edited_by', () => {
    it('extracts last_edited_by name', () => {
      const pages = [{
        id: 'p1',
        properties: { Editor: { type: 'last_edited_by', last_edited_by: { name: 'Bob' } } },
      }]
      expect(normalizeRows(pages)[0].Editor).toBe('Bob')
    })

    it('falls back to id when name is missing', () => {
      const pages = [{
        id: 'p1',
        properties: { Editor: { type: 'last_edited_by', last_edited_by: { id: 'uuid-2' } } },
      }]
      expect(normalizeRows(pages)[0].Editor).toBe('uuid-2')
    })

    it('returns null when last_edited_by is absent', () => {
      const pages = [{
        id: 'p1',
        properties: { Editor: { type: 'last_edited_by' } },
      }]
      expect(normalizeRows(pages)[0].Editor).toBeNull()
    })
  })

  describe('property type: files', () => {
    it('extracts file urls', () => {
      const pages = [{
        id: 'p1',
        properties: {
          Attachments: {
            type: 'files',
            files: [
              { file: { url: 'https://files.example.com/doc.pdf' } },
              { external: { url: 'https://external.example.com/img.png' } },
            ],
          },
        },
      }]
      expect(normalizeRows(pages)[0].Attachments).toEqual([
        'https://files.example.com/doc.pdf',
        'https://external.example.com/img.png',
      ])
    })

    it('returns empty array when files is undefined', () => {
      const pages = [{
        id: 'p1',
        properties: { Attachments: { type: 'files' } },
      }]
      expect(normalizeRows(pages)[0].Attachments).toEqual([])
    })
  })

  describe('unknown property type', () => {
    it('returns null for unhandled types', () => {
      const pages = [{
        id: 'p1',
        properties: { Unknown: { type: 'unsupported_type', value: 'x' } },
      }]
      expect(normalizeRows(pages)[0].Unknown).toBeNull()
    })
  })

  it('handles multiple rows and multiple properties', () => {
    const pages = [
      {
        id: 'p1',
        properties: {
          Name: { type: 'title', title: [{ plain_text: 'Row 1' }] },
          Count: { type: 'number', number: 10 },
          Active: { type: 'checkbox', checkbox: true },
        },
      },
      {
        id: 'p2',
        properties: {
          Name: { type: 'title', title: [{ plain_text: 'Row 2' }] },
          Count: { type: 'number', number: 20 },
          Active: { type: 'checkbox', checkbox: false },
        },
      },
    ]
    const rows = normalizeRows(pages)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ id: 'p1', Name: 'Row 1', Count: 10, Active: true })
    expect(rows[1]).toEqual({ id: 'p2', Name: 'Row 2', Count: 20, Active: false })
  })
})
