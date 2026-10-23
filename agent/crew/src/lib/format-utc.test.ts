import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatUtc, formatUtcCountdown } from './format-utc'

const here = dirname(fileURLToPath(import.meta.url))

describe('formatUtc', () => {
  it('renders ISO Z times as YYYY-MM-DD HH:MM UTC', () => {
    expect(formatUtc('2026-10-26T14:00:00.000Z')).toBe('2026-10-26 14:00 UTC')
    expect(formatUtc('2026-10-23T18:51:52Z')).toBe('2026-10-23 18:51 UTC')
  })

  it('uses UTC getters, not the viewer timezone', () => {
    const ms = Date.UTC(2026, 9, 26, 14, 0, 0)
    expect(formatUtc(ms)).toBe('2026-10-26 14:00 UTC')
    expect(formatUtc(new Date(ms))).toBe('2026-10-26 14:00 UTC')
  })

  it('accepts unix seconds and millisecond instants', () => {
    expect(formatUtc(1_793_023_200)).toBe('2026-10-26 14:00 UTC')
    expect(formatUtc(1_793_023_200_000)).toBe('2026-10-26 14:00 UTC')
    expect(formatUtc('1793023200')).toBe('2026-10-26 14:00 UTC')
  })

  it('returns an em dash for empty or invalid values', () => {
    expect(formatUtc(null)).toBe('—')
    expect(formatUtc(undefined)).toBe('—')
    expect(formatUtc('')).toBe('—')
    expect(formatUtc('not-a-date')).toBe('—')
  })
})

describe('formatUtcCountdown', () => {
  it('counts remaining days and hours until a UTC instant', () => {
    const now = Date.UTC(2026, 9, 24, 14, 0, 0)
    expect(formatUtcCountdown('2026-10-26T14:00:00.000Z', now)).toBe('2d 0h')
    expect(formatUtcCountdown('2026-10-24T16:30:00.000Z', now)).toBe('2h 30m')
    expect(formatUtcCountdown('2026-10-24T14:00:00.000Z', now)).toBe(null)
  })
})

describe('site clock rendering', () => {
  it('does not call viewer-local Date#toLocale* in pages or helpers', () => {
    const roots = [join(here, '../components'), here]
    const banned = /toLocaleTimeString|toLocaleDateString|new Date\([^)]*\)\.toLocaleString\(/
    const files: string[] = []
    function walk(dir: string) {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, name.name)
        if (name.isDirectory()) walk(p)
        else if (
          /\.(ts|tsx)$/.test(name.name) &&
          !name.name.endsWith('.test.ts') &&
          name.name !== 'format-utc.ts'
        ) {
          files.push(p)
        }
      }
    }
    for (const root of roots) walk(root)
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).not.toMatch(banned)
    }
  })
})
