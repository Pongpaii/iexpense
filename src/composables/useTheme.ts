import { readonly, ref } from 'vue'

export type AppTheme = 'default' | 'opium'

export interface ThemeSaveResult {
  ok: true
  persisted: boolean
}

const THEME_STORAGE_KEY = 'money-flow.theme.v1'
const DEFAULT_THEME: AppTheme = 'default'
const THEME_COLORS: Record<AppTheme, string> = {
  default: '#194d3b',
  opium: '#070607',
}

const isAppTheme = (value: unknown): value is AppTheme =>
  value === 'default' || value === 'opium'

const loadTheme = (): AppTheme => {
  if (typeof window === 'undefined') return DEFAULT_THEME

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isAppTheme(storedTheme) ? storedTheme : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

const theme = ref<AppTheme>(loadTheme())
const readonlyTheme = readonly(theme)

const applyTheme = (value: AppTheme) => {
  if (typeof document === 'undefined') return

  document.documentElement.dataset.theme = value
  document.documentElement.style.colorScheme = value === 'opium' ? 'dark' : 'light'
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[value])
}

export const initializeTheme = () => applyTheme(theme.value)

const setTheme = (value: AppTheme): ThemeSaveResult => {
  theme.value = value
  applyTheme(value)

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, value)
    return { ok: true, persisted: true }
  } catch {
    return { ok: true, persisted: false }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== THEME_STORAGE_KEY) return

    const nextTheme = isAppTheme(event.newValue) ? event.newValue : DEFAULT_THEME
    theme.value = nextTheme
    applyTheme(nextTheme)
  })
}

export const useTheme = () => ({
  theme: readonlyTheme,
  setTheme,
})
