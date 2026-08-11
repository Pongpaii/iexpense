import type { CategorySlice } from './categoryBreakdown'

/** ฟิสิกส์ของฟองเงิน แยกออกจากคอมโพเนนต์เพื่อให้ทดสอบและปรับค่าได้ง่าย */
export const BUBBLE_ATTRACTION = 0.006
export const BUBBLE_DAMPING = 0.9
export const BUBBLE_MAX_SPEED = 6
export const BUBBLE_MIN_RADIUS = 8
export const POINTER_RADIUS = 120
export const POINTER_STRENGTH = 2.4
export const GOLDEN_ANGLE = 2.399963

export interface Bubble {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  homeX: number
  homeY: number
  radius: number
  color: string
  categoryKey: string
  categoryLabel: string
  emoji: string
  description: string
  amount: number
  date: string
}

export interface ClusterLabel {
  key: string
  label: string
  x: number
  y: number
}

export interface BubbleField {
  bubbles: Bubble[]
  labels: ClusterLabel[]
}

export interface PointerState {
  x: number
  y: number
  active: boolean
}

interface BuildOptions {
  slices: CategorySlice[]
  width: number
  height: number
  maxBubbles: number
  /** ตำแหน่งเดิมของฟอง ใช้ให้การเปลี่ยนตัวกรองไม่กระโดด */
  previous?: Map<number, Bubble>
  /** ฉีดค่าสุ่มได้เพื่อให้ทดสอบผลลัพธ์ซ้ำได้ */
  random?: () => number
}

/**
 * วางฟองเป็นกลุ่มตามหมวดหมู่แบบตาราง แล้วกระจายภายในกลุ่มด้วยมุมทอง
 * ทำให้ฟองแน่นสม่ำเสมอโดยไม่ต้องพึ่งการชนเพียงอย่างเดียว
 */
export const buildBubbleField = ({
  slices,
  width,
  height,
  maxBubbles,
  previous,
  random = Math.random,
}: BuildOptions): BubbleField => {
  if (width <= 0 || height <= 0 || slices.length === 0) return { bubbles: [], labels: [] }

  const totalItems = slices.reduce((sum, slice) => sum + slice.items.length, 0)
  if (totalItems === 0) return { bubbles: [], labels: [] }

  const columns = Math.max(1, Math.min(slices.length, Math.ceil(Math.sqrt(slices.length))))
  const rows = Math.ceil(slices.length / columns)
  const cellWidth = width / columns
  const cellHeight = height / rows
  const maxAmount = slices.reduce(
    (largest, slice) =>
      slice.items.reduce((value, item) => Math.max(value, Number(item.amount)), largest),
    1,
  )
  const maxRadius = Math.max(
    BUBBLE_MIN_RADIUS + 4,
    Math.min(36, Math.min(cellWidth, cellHeight) / 5),
  )
  const isCapped = totalItems > maxBubbles

  const bubbles: Bubble[] = []
  const labels: ClusterLabel[] = []

  slices.forEach((slice, groupIndex) => {
    const column = groupIndex % columns
    const row = Math.floor(groupIndex / columns)
    const centerX = (column + 0.5) * cellWidth
    const centerY = (row + 0.5) * cellHeight
    const quota = isCapped
      ? Math.max(1, Math.round((slice.items.length / totalItems) * maxBubbles))
      : slice.items.length
    const spread = Math.max(maxRadius * 1.15, 16)

    labels.push({
      key: slice.key,
      label: `${slice.emoji} ${slice.label}`,
      x: centerX,
      y: centerY,
    })

    slice.items.slice(0, quota).forEach((item, itemIndex) => {
      const angle = itemIndex * GOLDEN_ANGLE
      const distance = Math.sqrt(itemIndex) * spread * 0.62
      const homeX = clamp(centerX + Math.cos(angle) * distance, maxRadius, width - maxRadius)
      const homeY = clamp(centerY + Math.sin(angle) * distance, maxRadius, height - maxRadius)
      const amount = Number(item.amount)
      const radius = BUBBLE_MIN_RADIUS
        + (maxRadius - BUBBLE_MIN_RADIUS) * Math.sqrt(Math.max(amount, 0) / maxAmount)
      const existing = previous?.get(item.id)

      bubbles.push({
        id: item.id,
        x: existing?.x ?? homeX + (random() - 0.5) * 40,
        y: existing?.y ?? homeY + (random() - 0.5) * 40,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
        homeX,
        homeY,
        radius,
        color: slice.color,
        categoryKey: slice.key,
        categoryLabel: slice.label,
        emoji: slice.emoji,
        description: item.description,
        amount,
        date: item.transaction_date,
      })
    })
  })

  return { bubbles, labels }
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

/** เช็คการชนเฉพาะฟองที่อยู่ในช่องตารางใกล้กัน เพื่อไม่ให้ต้องเทียบทุกคู่ */
const resolveCollisions = (bubbles: Bubble[]) => {
  if (bubbles.length < 2) return

  const largestRadius = bubbles.reduce((largest, bubble) => Math.max(largest, bubble.radius), 0)
  const cellSize = largestRadius * 2 + 2
  const grid = new Map<string, Bubble[]>()

  for (const bubble of bubbles) {
    const key = `${Math.floor(bubble.x / cellSize)},${Math.floor(bubble.y / cellSize)}`
    const cell = grid.get(key)
    if (cell) cell.push(bubble)
    else grid.set(key, [bubble])
  }

  for (const bubble of bubbles) {
    const columnIndex = Math.floor(bubble.x / cellSize)
    const rowIndex = Math.floor(bubble.y / cellSize)

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const neighbours = grid.get(`${columnIndex + dx},${rowIndex + dy}`)
        if (!neighbours) continue

        for (const other of neighbours) {
          if (other.id <= bubble.id) continue

          const deltaX = other.x - bubble.x
          const deltaY = other.y - bubble.y
          const minDistance = bubble.radius + other.radius
          const distanceSquared = deltaX * deltaX + deltaY * deltaY
          if (distanceSquared >= minDistance * minDistance || distanceSquared === 0) continue

          const distance = Math.sqrt(distanceSquared)
          const overlap = (minDistance - distance) / 2
          const unitX = deltaX / distance
          const unitY = deltaY / distance

          bubble.x -= unitX * overlap
          bubble.y -= unitY * overlap
          other.x += unitX * overlap
          other.y += unitY * overlap
          bubble.vx -= unitX * overlap * 0.12
          bubble.vy -= unitY * overlap * 0.12
          other.vx += unitX * overlap * 0.12
          other.vy += unitY * overlap * 0.12
        }
      }
    }
  }
}

interface StepOptions {
  width: number
  height: number
  pointer: PointerState
}

/** เดินฟิสิกส์หนึ่งเฟรม: ดึงเข้ากลุ่ม ผลักหนีเมาส์ หนืด แล้วแยกฟองที่ทับกัน */
export const stepBubbleField = (bubbles: Bubble[], { width, height, pointer }: StepOptions) => {
  for (const bubble of bubbles) {
    bubble.vx += (bubble.homeX - bubble.x) * BUBBLE_ATTRACTION
    bubble.vy += (bubble.homeY - bubble.y) * BUBBLE_ATTRACTION

    if (pointer.active) {
      const deltaX = bubble.x - pointer.x
      const deltaY = bubble.y - pointer.y
      const distanceSquared = deltaX * deltaX + deltaY * deltaY

      if (distanceSquared < POINTER_RADIUS * POINTER_RADIUS) {
        const distance = Math.sqrt(distanceSquared) || 1
        const force = (1 - distance / POINTER_RADIUS) * POINTER_STRENGTH
        bubble.vx += (deltaX / distance) * force
        bubble.vy += (deltaY / distance) * force
      }
    }

    bubble.vx = clamp(bubble.vx * BUBBLE_DAMPING, -BUBBLE_MAX_SPEED, BUBBLE_MAX_SPEED)
    bubble.vy = clamp(bubble.vy * BUBBLE_DAMPING, -BUBBLE_MAX_SPEED, BUBBLE_MAX_SPEED)
    bubble.x = clamp(bubble.x + bubble.vx, bubble.radius, Math.max(width - bubble.radius, bubble.radius))
    bubble.y = clamp(bubble.y + bubble.vy, bubble.radius, Math.max(height - bubble.radius, bubble.radius))
  }

  resolveCollisions(bubbles)
}

export const findBubbleAt = (bubbles: Bubble[], x: number, y: number) => {
  // ไล่จากท้ายไปหน้า เพื่อให้ฟองที่วาดทับอยู่ด้านบนถูกเลือกก่อน
  for (let index = bubbles.length - 1; index >= 0; index -= 1) {
    const bubble = bubbles[index]
    const deltaX = x - bubble.x
    const deltaY = y - bubble.y
    if (deltaX * deltaX + deltaY * deltaY <= bubble.radius * bubble.radius) return bubble
  }
  return null
}
