export const THEME_STORAGE_KEY = 'crew.theme'

export type CrewTheme = 'dark' | 'light'

export function normalizeTheme(value: unknown): CrewTheme {
  return value === 'light' ? 'light' : 'dark'
}

export function readTheme(storage?: Pick<Storage, 'getItem'> | null): CrewTheme {
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage)
    return normalizeTheme(store?.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'dark'
  }
}

export function writeTheme(
  theme: CrewTheme,
  storage?: Pick<Storage, 'setItem'> | null,
): CrewTheme {
  const next = normalizeTheme(theme)
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage)
    store?.setItem(THEME_STORAGE_KEY, next)
  } catch {
    /* private mode */
  }
  return next
}

export function applyTheme(theme: CrewTheme, root?: { setAttribute: (name: string, value: string) => void }): CrewTheme {
  const next = normalizeTheme(theme)
  const el =
    root ??
    (typeof document === 'undefined' ? null : document.documentElement)
  el?.setAttribute('data-theme', next)
  return next
}
