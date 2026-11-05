import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { CSV_HEADER, EXPORT_TABLES, buildExportJson, csvCell, exportFileName, fetchAll, saveFile, transactionsCsv } from './exportData'

describe('fetchAll', () => {
  const data = Array.from({ length: 2500 }, (_, i) => i)
  const pager = (calls: [number, number][] = []) => async (from: number, to: number) => { calls.push([from, to]); return data.slice(from, to + 1) }

  it('reads page by page until a short page, and reports progress', async () => {
    const calls: [number, number][] = []
    const progress: number[] = []
    const rows = await fetchAll(pager(calls), { onProgress: (n) => progress.push(n) })
    expect(rows).toEqual(data)
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
    expect(progress).toEqual([1000, 2000, 2500])
  })
  it('an exact multiple of the page size needs one extra (empty) page; an empty table is one call', async () => {
    const calls: [number, number][] = []
    expect(await fetchAll(async (f, t) => { calls.push([f, t]); return data.slice(f, Math.min(t + 1, 2000)) }, { pageSize: 1000 })).toHaveLength(2000)
    expect(calls).toHaveLength(3)
    const none: [number, number][] = []
    expect(await fetchAll(async (f, t) => { none.push([f, t]); return [] })).toEqual([])
    expect(none).toHaveLength(1)
  })
  it('stops at the safety limit and passes errors up', async () => {
    expect((await fetchAll(pager(), { pageSize: 500, maxRows: 1000 })).length).toBe(1000)
    await expect(fetchAll(async () => { throw new Error('offline') })).rejects.toThrow('offline')
  })
  it('property: any length comes back whole and in order', async () => {
    await fc.assert(fc.asyncProperty(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 1, max: 50 }), async (n, size) => {
      const d = Array.from({ length: n }, (_, i) => i)
      expect(await fetchAll(async (f, t) => d.slice(f, t + 1), { pageSize: size })).toEqual(d)
    }))
  })
})

describe('buildExportJson', () => {
  it('has every table (empty if missing), counts, the profile and a timestamp; no push data', () => {
    const doc = buildExportJson({ accounts: [{ id: 'a' }], transactions: [{ id: 't1' }, { id: 't2' }] }, { name: 'Sarang' }, new Date('2026-11-05T10:00:00Z'))
    expect(doc).toMatchObject({ app: 'money-manager', format_version: 1, exported_at: '2026-11-05T10:00:00.000Z', profile: { name: 'Sarang' } })
    expect(Object.keys(doc.tables)).toEqual([...EXPORT_TABLES])
    expect(doc.counts).toMatchObject({ accounts: 1, transactions: 2, entries: 0, notes: 0 })
    expect(JSON.stringify(doc)).not.toMatch(/push|endpoint/)
  })
  it('works with no profile', () => expect(buildExportJson({}, null).profile).toBeNull())
})

describe('csvCell', () => {
  it('quotes commas, quotes and line breaks; doubles inner quotes', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
    expect(csvCell('a\r\nb')).toBe('"a\r\nb"')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(12.5)).toBe('12.5')
  })
  it('neutralises formulas in free text only', () => {
    for (const bad of ['=SUM(A1)', '+1', '-1', '@cmd', '\tx', '\rx']) expect(csvCell(bad, { text: true }).replace(/^"/, '')).toMatch(/^'/)
    expect(csvCell('=1+1')).toBe('=1+1') // numeric/date columns are never altered
    expect(csvCell('fine = ok', { text: true })).toBe('fine = ok')
    expect(csvCell('=A,B', { text: true })).toBe('"\'=A,B"')
  })
  it('property: a cell never ends a field early (parsing it back yields one field)', () => {
    fc.assert(fc.property(fc.string(), (s) => {
      const cell = csvCell(s, { text: true })
      if (cell.startsWith('"')) expect(cell.endsWith('"') && (cell.slice(1, -1).replace(/""/g, '').indexOf('"') === -1)).toBe(true)
      else expect(cell).not.toMatch(/[,"\r\n]/)
    }))
  })
})

describe('transactionsCsv', () => {
  const accounts = [{ id: 'a1', name: 'Cash' }, { id: 'a2', name: 'HDFC, Card' }]
  const categories = [{ id: 'c1', name: 'Food' }]
  const t = (o: Record<string, unknown>) => ({ id: 'x', kind: 'expense', amount_paise: 25_000, for_other_paise: 0, date: '2026-11-05', account_id: 'a1', to_account_id: null, category_id: 'c1', title: 'Lunch', place: null, notes: null, tags: [], created_at: '2026-11-05T10:00:00Z', ...o }) as never

  it('header, names instead of ids, rupees, your share, newest first, CRLF lines', () => {
    const csv = transactionsCsv([
      t({ date: '2026-11-01', title: 'Old' }),
      t({ date: '2026-11-05', kind: 'expense', amount_paise: 3_000_000, for_other_paise: 2_000_000, account_id: 'a2', title: 'Dinner, with "Arun"', tags: ['work', 'trip'], notes: 'split\n3 ways' }),
      t({ date: '2026-11-03', kind: 'transfer', amount_paise: 100_000, account_id: 'a1', to_account_id: 'a2', category_id: null, title: null }),
      t({ date: '2026-11-04', kind: 'income', amount_paise: 500_000, category_id: null, title: '=HACK()' }),
    ], accounts, categories)
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(CSV_HEADER.join(','))
    expect(lines[1]).toBe('2026-11-05,Spent,30000.00,"HDFC, Card",,Food,"Dinner, with ""Arun""",,"split\n3 ways",work trip,20000.00,10000.00')
    expect(lines[4]).toBe('2026-11-01,Spent,250.00,Cash,,Food,Old,,,,,250.00')
    expect(csv).toContain('2026-11-03,Transfer,1000.00,Cash,"HDFC, Card",,,,,,,')
    expect(csv).toContain("2026-11-04,Received,5000.00,Cash,,,'=HACK(),,,,,")
    expect(csv.endsWith('\r\n')).toBe(true)
  })
  it('empty input is just the header; unknown kinds and missing lookups do not break it', () => {
    expect(transactionsCsv([], [], [])).toBe(CSV_HEADER.join(',') + '\r\n')
    expect(transactionsCsv([t({ kind: 'mystery', account_id: 'gone', category_id: 'gone' })], [], [])).toContain('2026-11-05,mystery,250.00,,,,Lunch')
  })
})

describe('exportFileName', () => {
  it('names files by date', () => {
    expect(exportFileName('json', '2026-11-05')).toBe('money-manager-2026-11-05.json')
    expect(exportFileName('csv', '2026-11-05')).toBe('money-manager-2026-11-05.csv')
  })
})

describe('saveFile', () => {
  const doc = () => {
    const a = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    return { a, document: { createElement: vi.fn(() => a), body: { appendChild: vi.fn() } } as unknown as Document }
  }
  const URLmock = () => ({ createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }) as unknown as typeof URL

  it('shares the file where the browser can', async () => {
    const share = vi.fn(async () => undefined)
    const nav = { canShare: () => true, share } as unknown as Navigator
    expect(await saveFile('a.json', '{}', 'application/json', { navigator: nav })).toBe('shared')
    expect(share).toHaveBeenCalledOnce()
    expect((share.mock.calls[0] as unknown as [{ files: File[] }])[0].files[0]!.name).toBe('a.json')
  })
  it('closing the share sheet is not an error and does not download', async () => {
    const nav = { canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) } } as unknown as Navigator
    const d = doc()
    expect(await saveFile('a.json', '{}', 'application/json', { navigator: nav, ...d, URL: URLmock() })).toBe('cancelled')
    expect(d.a.click).not.toHaveBeenCalled()
  })
  it('downloads when sharing is unavailable or fails', async () => {
    const d = doc(); const url = URLmock()
    expect(await saveFile('a.csv', 'x', 'text/csv', { navigator: {} as Navigator, ...d, URL: url })).toBe('downloaded')
    expect(d.a).toMatchObject({ href: 'blob:x', download: 'a.csv' })
    expect(d.a.click).toHaveBeenCalledOnce()
    expect(d.a.remove).toHaveBeenCalled()
    const failing = { canShare: () => true, share: async () => { throw new Error('nope') } } as unknown as Navigator
    const d2 = doc()
    expect(await saveFile('b.csv', 'x', 'text/csv', { navigator: failing, ...d2, URL: URLmock() })).toBe('downloaded')
    expect(d2.a.click).toHaveBeenCalled()
    const cantShareFiles = { canShare: () => false, share: vi.fn() } as unknown as Navigator
    const d3 = doc()
    expect(await saveFile('c.csv', 'x', 'text/csv', { navigator: cantShareFiles, ...d3, URL: URLmock() })).toBe('downloaded')
    expect(cantShareFiles.share).not.toHaveBeenCalled()
  })
})
