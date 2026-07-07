import { vi } from 'vitest'

export function mockRes() {
  const res: any = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
    setHeader: vi.fn(),
    end: vi.fn(),
    write: vi.fn(),
    flushHeaders: vi.fn(),
  }
  return res
}

export function mockReq(
  body: any = {},
  query: any = {},
  overrides: Record<string, any> = {},
) {
  return { body, query, on: vi.fn(() => undefined), ...overrides } as any
}
