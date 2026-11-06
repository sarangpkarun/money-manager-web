import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(join(process.cwd(), 'supabase/templates', f), 'utf8')
const config = readFileSync(join(process.cwd(), 'supabase/config.toml'), 'utf8')

describe.each(['confirmation.html', 'recovery.html'])('%s', (file) => {
  const html = read(file)
  it('has the action link and the address, in plain text too (for clients that block buttons)', () => {
    expect((html.match(/\{\{ \.ConfirmationURL \}\}/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(html).toContain('{{ .Email }}')
  })
  it('tracks nothing: no images, scripts, external stylesheets or other links', () => {
    expect(html).not.toMatch(/<img|<script|<link|<iframe|url\(/i)
    expect([...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1])).toEqual(['{{ .ConfirmationURL }}'])
    expect(html).not.toMatch(/https?:\/\//)
  })
  it('is wired up in config.toml', () => {
    const kind = file.replace('.html', '')
    expect(config).toMatch(new RegExp(`\\[auth\\.email\\.template\\.${kind}\\]\\s+subject = "[^"]+"\\s+content_path = "\\./supabase/templates/${file}"`))
  })
})
