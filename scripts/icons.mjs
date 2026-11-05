import sharp from 'sharp'
import { readFile } from 'node:fs/promises'

const svg = await readFile('public/icon.svg')
const out = (name, size, pad = 0) =>
  sharp(svg)
    .resize(size - pad * 2, size - pad * 2)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#0b0f14' })
    .png()
    .toFile(`public/${name}`)

await Promise.all([
  out('icon-192.png', 192),
  out('icon-512.png', 512),
  out('icon-maskable-512.png', 512, 64),
  out('apple-touch-icon.png', 180),
])
console.log('icons generated')
