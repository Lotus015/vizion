import { normalizeRows } from '../../src/notion/normalize'

describe('normalizeRows', () => {
  it('returns one row per page with an id field', () => {
    const pages = [
      { id: 'page-1', properties: {} },
      { id: 'page-2', properties: {} },
    ]
    const rows = normalizeRows(pages)
    expect(rows).toHaveLength(2)
    expect(rows[0].id).toBe('page-1')
    expect(rows[1].id).toBe('page-2')
  })

  describe('property type branches', () => {
    it('extracts title value', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'Hello World' }] },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Name).toBe('Hello World')
    })

    it('extracts title as empty string when title array is empty', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Name: { type: 'title', title: [] },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Name).toBe('')
    })

    it('joins multiple rich_text segments', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Description: {
              type: 'rich_text',
              rich_text: [
                { plain_text: 'Hello ' },
                { plain_text: 'World' },
              ],
            },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Description).toBe('Hello World')
    })

    it('extracts rich_text as empty string when missing', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Description: { type: 'rich_text', rich_text: undefined },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Description).toBe('')
    })

    it('extracts number value', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Price: { type: 'number', number: 42.5 },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Price).toBe(42.5)
    })

    it('extracts number as null when missing', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Price: { type: 'number', number: null },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Price).toBeNull()
    })

    it('extracts select name', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Status: { type: 'select', select: { name: 'Done' } },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Status).toBe('Done')
    })

    it('extracts select as null when missing', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Status: { type: 'select', select: null },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Status).toBeNull()
    })

    it('extracts multi_select names as array', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Tags: {
              type: 'multi_select',
              multi_select: [{ name: 'tag1' }, { name: 'tag2' }],
            },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Tags).toEqual(['tag1', 'tag2'])
    })

    it('extracts multi_select as empty array when missing', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Tags: { type: 'multi_select', multi_select: undefined },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Tags).toEqual([])
    })

    it('extracts status name', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Stage: { type: 'status', status: { name: 'In Progress' } },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Stage).toBe('In Progress')
    })

    it('extracts status as null when missing', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Stage: { type: 'status', status: null },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Stage).toBeNull()
    })

    it('extracts date start', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Due: { type: 'date', date: { start: '2024-01-15' } },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Due).toBe('2024-01-15')
    })

    it('extracts date as null when missing', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Due: { type: 'date', date: null },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Due).toBeNull()
    })

    it('extracts checkbox defaulting to false', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Active: { type: 'checkbox', checkbox: true },
            Inactive: { type: 'checkbox', checkbox: false },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Active).toBe(true)
      expect(rows[0].Inactive).toBe(false)
    })

    it('extracts url as null when missing', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Website: { type: 'url', url: null },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Website).toBeNull()
    })

    it('extracts url value', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Website: { type: 'url', url: 'https://example.com' },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Website).toBe('https://example.com')
    })

    it('extracts email as null when missing', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Email: { type: 'email', email: null },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Email).toBeNull()
    })

    it('extracts phone_number as null when missing', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Phone: { type: 'phone_number', phone_number: null },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Phone).toBeNull()
    })

    describe('formula', () => {
      it('extracts formula string', () => {
        const pages = [
          {
            id: 'p1',
            properties: {
              Computed: { type: 'formula', formula: { type: 'string', string: 'result' } },
            },
          },
        ]
        const rows = normalizeRows(pages)
        expect(rows[0].Computed).toBe('result')
      })

      it('extracts formula number', () => {
        const pages = [
          {
            id: 'p1',
            properties: {
              Computed: { type: 'formula', formula: { type: 'number', number: 99 } },
            },
          },
        ]
        const rows = normalizeRows(pages)
        expect(rows[0].Computed).toBe(99)
      })

      it('extracts formula boolean', () => {
        const pages = [
          {
            id: 'p1',
            properties: {
              Computed: { type: 'formula', formula: { type: 'boolean', boolean: true } },
            },
          },
        ]
        const rows = normalizeRows(pages)
        expect(rows[0].Computed).toBe(true)
      })

      it('extracts formula date start', () => {
        const pages = [
          {
            id: 'p1',
            properties: {
              Computed: { type: 'formula', formula: { type: 'date', date: { start: '2024-06-01' } } },
            },
          },
        ]
        const rows = normalizeRows(pages)
        expect(rows[0].Computed).toBe('2024-06-01')
      })

      it('extracts formula with unknown type as null', () => {
        const pages = [
          {
            id: 'p1',
            properties: {
              Computed: { type: 'formula', formula: { type: 'unknown' } },
            },
          },
        ]
        const rows = normalizeRows(pages)
        expect(rows[0].Computed).toBeNull()
      })

      it('extracts formula as null when formula is null', () => {
        const pages = [
          {
            id: 'p1',
            properties: {
              Computed: { type: 'formula', formula: null },
            },
          },
        ]
        const rows = normalizeRows(pages)
        expect(rows[0].Computed).toBeNull()
      })
    })

    describe('rollup', () => {
      it('extracts rollup number', () => {
        const pages = [
          {
            id: 'p1',
            properties: {
              Total: { type: 'rollup', rollup: { type: 'number', number: 100 } },
            },
          },
        ]
        const rows = normalizeRows(pages)
        expect(rows[0].Total).toBe(100)
      })

      it('extracts rollup date', () => {
        const pages = [
          {
            id: 'p1',
            properties: {
              Latest: { type: 'rollup', rollup: { type: 'date', date: { start: '2024-03-01' } } },
            },
          },
        ]
        const rows = normalizeRows(pages)
        expect(rows[0].Latest).toBe('2024-03-01')
      })

      it('extracts rollup array by mapping extractValue over items', () => {
        const pages = [
          {
            id: 'p1',
            properties: {
              Items: {
                type: 'rollup',
                rollup: {
                  type: 'array',
                  array: [
                    { type: 'title', title: [{ plain_text: 'Item A' }] },
                    { type: 'number', number: 42 },
                  ],
                },
              },
            },
          },
        ]
        const rows = normalizeRows(pages)
        expect(rows[0].Items).toEqual(['Item A', 42])
      })

      it('extracts rollup with unknown type as null', () => {
        const pages = [
          {
            id: 'p1',
            properties: {
              Items: { type: 'rollup', rollup: { type: 'unknown' } },
            },
          },
        ]
        const rows = normalizeRows(pages)
        expect(rows[0].Items).toBeNull()
      })

      it('extracts rollup as null when rollup is null', () => {
        const pages = [
          {
            id: 'p1',
            properties: {
              Items: { type: 'rollup', rollup: null },
            },
          },
        ]
        const rows = normalizeRows(pages)
        expect(rows[0].Items).toBeNull()
      })
    })

    it('extracts relation as array of IDs', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Related: {
              type: 'relation',
              relation: [{ id: 'rel-1' }, { id: 'rel-2' }],
            },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Related).toEqual(['rel-1', 'rel-2'])
    })

    it('extracts relation as empty array when missing', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Related: { type: 'relation', relation: undefined },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Related).toEqual([])
    })

    it('extracts people using name with fallback to id', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Assignee: {
              type: 'people',
              people: [
                { name: 'Alice', id: 'user-1' },
                { id: 'user-2' }, // no name – falls back to id
              ],
            },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Assignee).toEqual(['Alice', 'user-2'])
    })

    it('extracts people as empty array when missing', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Assignee: { type: 'people', people: undefined },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Assignee).toEqual([])
    })

    it('extracts created_time', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Created: { type: 'created_time', created_time: '2024-01-01T00:00:00.000Z' },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Created).toBe('2024-01-01T00:00:00.000Z')
    })

    it('extracts last_edited_time', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Edited: { type: 'last_edited_time', last_edited_time: '2024-02-01T00:00:00.000Z' },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Edited).toBe('2024-02-01T00:00:00.000Z')
    })

    it('extracts created_by using name with fallback to id', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Creator: { type: 'created_by', created_by: { name: 'Bob', id: 'user-bob' } },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Creator).toBe('Bob')
    })

    it('extracts created_by falling back to id when name is missing', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Creator: { type: 'created_by', created_by: { id: 'user-orphan' } },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Creator).toBe('user-orphan')
    })

    it('extracts created_by as null when both name and id are missing', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Creator: { type: 'created_by', created_by: {} },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Creator).toBeNull()
    })

    it('extracts last_edited_by using name with fallback to id', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Editor: { type: 'last_edited_by', last_edited_by: { name: 'Carol', id: 'user-carol' } },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Editor).toBe('Carol')
    })

    it('extracts last_edited_by falling back to id when name is missing', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Editor: { type: 'last_edited_by', last_edited_by: { id: 'user-anon' } },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Editor).toBe('user-anon')
    })

    it('extracts files using file.url with fallback to external.url', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Attachments: {
              type: 'files',
              files: [
                { file: { url: 'https://files.example.com/doc.pdf' } },
                { external: { url: 'https://external.example.com/img.png' } },
                { file: { url: 'https://files.example.com/sheet.csv' }, external: { url: 'https://ignored.example.com/x' } },
              ],
            },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Attachments).toEqual([
        'https://files.example.com/doc.pdf',
        'https://external.example.com/img.png',
        'https://files.example.com/sheet.csv',
      ])
    })

    it('extracts files as empty array when missing', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Attachments: { type: 'files', files: undefined },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Attachments).toEqual([])
    })

    it('returns null for unknown property type (default branch)', () => {
      const pages = [
        {
          id: 'p1',
          properties: {
            Mystery: { type: 'unknown_type_xyz' },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].Mystery).toBeNull()
    })

    it('handles a page with mixed property types in one row', () => {
      const pages = [
        {
          id: 'p-mixed',
          properties: {
            Title: { type: 'title', title: [{ plain_text: 'Product' }] },
            Price: { type: 'number', number: 29.99 },
            InStock: { type: 'checkbox', checkbox: true },
            Tags: { type: 'multi_select', multi_select: [{ name: 'sale' }, { name: 'new' }] },
          },
        },
      ]
      const rows = normalizeRows(pages)
      expect(rows[0].id).toBe('p-mixed')
      expect(rows[0].Title).toBe('Product')
      expect(rows[0].Price).toBe(29.99)
      expect(rows[0].InStock).toBe(true)
      expect(rows[0].Tags).toEqual(['sale', 'new'])
    })
  })
})
