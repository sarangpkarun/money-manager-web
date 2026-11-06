import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { backup, stamp, sumsLine } from '../../scripts/backup.mjs'
import { same } from '../../scripts/restore-drill.mjs'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const NOW = new Date('2026-11-06T09:30:05.123Z')

describe('stamp', () => {
  it('is a UTC time that is safe in a file name', () => {
    expect(stamp(NOW)).toBe('2026-11-06T09-30-05Z')
    expect(stamp(NOW)).not.toMatch(/[:.]/)
  })
})

describe('backup', () => {
  const fakeRun = (calls: string[][], writes: Record<string, string> = {}) => (args: string[]) => {
    calls.push(args)
    const file = args[args.indexOf('-f') + 1]!
    writeFileSync(file, writes[args.includes('--data-only') ? 'data' : 'schema'] ?? 'x')
  }

  it('dumps schema, then auth + public data in COPY format, and writes checksums that match', () => {
    const root = mkdtempSync(join(tmpdir(), 'bk-'))
    const calls: string[][] = []
    const dir = backup({ local: true, root, now: NOW, run: fakeRun(calls, { schema: 'create table t();', data: 'copy t from stdin;' }) })
    expect(dir).toBe(join(root, '2026-11-06T09-30-05Z'))
    expect(calls[0]).toEqual(['db', 'dump', '--local', '-f', join(dir, 'schema.sql')])
    expect(calls[1]).toEqual(['db', 'dump', '--local', '--data-only', '--use-copy', '-s', 'auth,public', '-f', join(dir, 'data.sql')])
    expect(readFileSync(join(dir, 'SHA256SUMS'), 'utf8')).toBe(`${sumsLine(sha('create table t();'), 'schema.sql')}\n${sumsLine(sha('copy t from stdin;'), 'data.sql')}\n`)
  })
  it('targets the linked cloud project by default', () => {
    const calls: string[][] = []
    backup({ root: mkdtempSync(join(tmpdir(), 'bk-')), now: NOW, run: fakeRun(calls) })
    expect(calls.every((c) => c.includes('--linked') && !c.includes('--local'))).toBe(true)
  })
  it('an empty dump is an error, never a silent "backup"', () => {
    expect(() => backup({ local: true, root: mkdtempSync(join(tmpdir(), 'bk-')), now: NOW, run: fakeRun([], { data: '' }) })).toThrow('data.sql is empty')
  })
})

describe('same', () => {
  it('compares fingerprints by value', () => {
    expect(same({ a: 1, b: { c: '2' } }, { a: 1, b: { c: '2' } })).toBe(true)
    expect(same({ a: 1 }, { a: 2 })).toBe(false)
  })
})
