import { computed, readonly, ref } from 'vue'

/** วันทำงาน (จ.-ศ.) หรือวันหยุด (ส.-อา.) */
export type DayKind = 'weekday' | 'weekend'

export interface CapPlanItem {
  id: string
  emoji: string
  label: string
  amount: number
}

export interface DailyCapProfile {
  /** เพดานรายจ่ายของวัน (บาท) */
  cap: number
  /** แผนค่าใช้จ่ายย่อยที่ตั้งใจใช้ในวันนั้น */
  items: CapPlanItem[]
}

export interface DailyCapSettings {
  enabled: boolean
  weekday: DailyCapProfile
  weekend: DailyCapProfile
}

export const MAX_DAILY_CAP = 1_000_000
export const MAX_PLAN_ITEMS = 10

const STORAGE_KEY = 'money-flow.daily-cap.v1'

export const dayKindLabels: Record<DayKind, string> = {
  weekday: 'วันทำงาน (จ.-ศ.)',
  weekend: 'วันหยุด (ส.-อา.)',
}

export const dayKindEmojis: Record<DayKind, string> = {
  weekday: '📅',
  weekend: '🌤️',
}

const createDefaultSettings = (): DailyCapSettings => ({
  enabled: true,
  weekday: {
    cap: 320,
    items: [
      { id: 'weekday-breakfast', emoji: '🍜', label: 'เช้า', amount: 65 },
      { id: 'weekday-lunch', emoji: '🍜', label: 'กลางวัน', amount: 70 },
      { id: 'weekday-dinner', emoji: '🍜', label: 'เย็น', amount: 70 },
      { id: 'weekday-commute', emoji: '🚗', label: 'เดินทาง', amount: 77 },
    ],
  },
  weekend: {
    cap: 243,
    items: [
      { id: 'weekend-breakfast', emoji: '🍜', label: 'เช้า', amount: 65 },
      { id: 'weekend-lunch', emoji: '🍜', label: 'กลางวัน', amount: 70 },
      { id: 'weekend-dinner', emoji: '🍜', label: 'เย็น', amount: 70 },
    ],
  },
})

export const defaultDailyCapSettings = createDefaultSettings()

export const createPlanItemId = () =>
  `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const normalizeAmount = (value: unknown, max: number) => {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0 || amount > max) return null
  return Math.round(amount * 100) / 100
}

const normalizeCap = (value: unknown) => {
  const cap = normalizeAmount(value, MAX_DAILY_CAP)
  if (cap === null || cap <= 0) return null
  return cap
}

const normalizeItem = (value: unknown, index: number): CapPlanItem | null => {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  const amount = normalizeAmount(raw.amount, MAX_DAILY_CAP)
  if (amount === null) return null

  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 24) : ''
  const emoji = typeof raw.emoji === 'string' ? raw.emoji.trim().slice(0, 4) : ''
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 48) : `plan-${index}`

  return {
    id,
    emoji: emoji || '💸',
    label: label || `รายการที่ ${index + 1}`,
    amount,
  }
}

const normalizeProfile = (value: unknown, fallback: DailyCapProfile): DailyCapProfile => {
  if (typeof value !== 'object' || value === null) return { cap: fallback.cap, items: [...fallback.items] }
  const raw = value as Record<string, unknown>

  const items = Array.isArray(raw.items)
    ? raw.items
        .slice(0, MAX_PLAN_ITEMS)
        .map((item, index) => normalizeItem(item, index))
        .filter((item): item is CapPlanItem => item !== null)
    : [...fallback.items]

  return {
    cap: normalizeCap(raw.cap) ?? fallback.cap,
    items,
  }
}

const normalizeSettings = (value: unknown): DailyCapSettings => {
  const fallback = createDefaultSettings()
  if (typeof value !== 'object' || value === null) return fallback
  const raw = value as Record<string, unknown>

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    weekday: normalizeProfile(raw.weekday, fallback.weekday),
    weekend: normalizeProfile(raw.weekend, fallback.weekend),
  }
}

const loadSettings = (): DailyCapSettings => {
  if (typeof window === 'undefined') return createDefaultSettings()

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return createDefaultSettings()
    return normalizeSettings(JSON.parse(stored) as unknown)
  } catch {
    return createDefaultSettings()
  }
}

const settings = ref<DailyCapSettings>(loadSettings())
const readonlySettings = readonly(settings)

export interface CapSaveResult {
  ok: boolean
  persisted: boolean
  reason?: 'invalid-cap' | 'invalid-item'
}

const persist = (): boolean => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
    return true
  } catch {
    return false
  }
}

/** จ.-ศ. คืน 'weekday' · ส.-อา. คืน 'weekend' */
export const dayKindForDate = (isoDate: string): DayKind => {
  const day = new Date(`${isoDate}T12:00:00`).getDay()
  return day === 0 || day === 6 ? 'weekend' : 'weekday'
}

export const sumPlanItems = (items: readonly Pick<CapPlanItem, 'amount'>[]) =>
  Math.round(items.reduce((total, item) => total + Number(item.amount || 0), 0) * 100) / 100

const setCapEnabled = (enabled: boolean): CapSaveResult => {
  settings.value = { ...settings.value, enabled }
  return { ok: true, persisted: persist() }
}

const saveProfile = (kind: DayKind, profile: DailyCapProfile): CapSaveResult => {
  const cap = normalizeCap(profile.cap)
  if (cap === null) return { ok: false, persisted: false, reason: 'invalid-cap' }

  const items: CapPlanItem[] = []
  for (const [index, item] of profile.items.slice(0, MAX_PLAN_ITEMS).entries()) {
    const amount = normalizeAmount(item.amount, MAX_DAILY_CAP)
    if (amount === null) return { ok: false, persisted: false, reason: 'invalid-item' }

    items.push({
      id: item.id || createPlanItemId(),
      emoji: (item.emoji || '').trim().slice(0, 4) || '💸',
      label: (item.label || '').trim().slice(0, 24) || `รายการที่ ${index + 1}`,
      amount,
    })
  }

  settings.value = { ...settings.value, [kind]: { cap, items } }
  return { ok: true, persisted: persist() }
}

const resetProfile = (kind: DayKind): CapSaveResult => {
  const defaults = createDefaultSettings()
  settings.value = { ...settings.value, [kind]: defaults[kind] }
  return { ok: true, persisted: persist() }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    if (event.newValue === null) {
      settings.value = createDefaultSettings()
      return
    }

    try {
      settings.value = normalizeSettings(JSON.parse(event.newValue) as unknown)
    } catch {
      /* ค่าที่อ่านไม่ได้ ให้คงค่าปัจจุบันไว้ */
    }
  })
}

const capEnabled = computed(() => settings.value.enabled)

export const useDailyCap = () => ({
  capSettings: readonlySettings,
  capEnabled,
  profileForDate: (isoDate: string) => settings.value[dayKindForDate(isoDate)],
  capForDate: (isoDate: string) => settings.value[dayKindForDate(isoDate)].cap,
  dayKindForDate,
  sumPlanItems,
  setCapEnabled,
  saveProfile,
  resetProfile,
})
