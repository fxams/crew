import { describe, expect, it } from 'vitest'
import { applyTheme, readTheme, THEME_STORAGE_KEY, writeTheme } from './theme'

function memoryStore(init?: Record<string, string>) {
  const mem = new Map<string, string>(Object.entries(init || {}))
  return {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  }
}

describe('theme', () => {
  it('defaults to dark and persists light/dark in storage', () => {
    const store = memoryStore()
    expect(readTheme(store)).toBe('dark')
    writeTheme('light', store)
    expect(store.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(readTheme(store)).toBe('light')
    writeTheme('dark', store)
    expect(readTheme(store)).toBe('dark')
    expect(readTheme(memoryStore({ [THEME_STORAGE_KEY]: 'nope' }))).toBe('dark')
  })

  it('applies data-theme on the root', () => {
    const attrs = new Map<string, string>()
    applyTheme('light', { setAttribute: (k, v) => void attrs.set(k, v) })
    expect(attrs.get('data-theme')).toBe('light')
  })
})
