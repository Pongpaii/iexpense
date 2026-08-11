import type { HabitGroup } from './spendingHabits'

/**
 * ฟิสิกส์และการจัดวางของฟองเงิน แยกออกจากคอมโพเนนต์เพื่อให้ทดสอบได้
 *
 * ขนาดฟอง = จำนวนครั้งที่จ่ายซ้ำ ไม่ใช่ยอดเงิน เพราะเป้าหมายของหน้านี้คือ
 * ให้เห็นว่า "ใช้กับอะไรบ่อย" และฟองต้องโตพอที่จะเขียนชื่อลงไปได้จริง
 */
export const BUBBLE_ATTRACTION = 0.006
export const BUBBLE_DAMPING = 0.9
export const BUBBLE_MAX_SPEED = 6
export const POINTER_RADIUS = 120
export const POINTER_STRENGTH = 2.4
export const GOLDEN_ANGLE = 2.399963

/**
 * ช่วงรัศมีที่มาจากจำนวนครั้ง กว้างพอให้เห็นความต่างชัด
 * ของที่จ่ายบ่อยจะใหญ่กว่าของที่จ่ายครั้งเดียวหลายเท่า
 */
export const COUNT_MIN_RADIUS = 15
export const COUNT_MAX_RADIUS = 110
/** จำนวนตัวอักษรต่อบรรทัดมากสุดก่อนจะเริ่มลดลงให้พอดีฟอง */
const MAX_CHARS_PER_LINE = 18

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
  name: string
  /** ข้อความที่ตัดเป็นบรรทัดพร้อมวาดในฟองแล้ว */
  lines: string[]
  /** ขนาดตัวอักษรของฟองนี้ ฟองที่จ่ายบ่อยได้ตัวใหญ่กว่า */
  fontSize: number
  count: number
  total: number
  lastDate: string
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
  /** จำนวนฟองที่ตัดออกเพราะพื้นที่ไม่พอ */
  omitted: number
}

export interface PointerState {
  x: number
  y: number
  active: boolean
}

export interface LabelLayout {
  lines: string[]
  requiredRadius: number
}

/**
 * จัดชื่อเป็นไม่เกินสองบรรทัด แล้วบอกว่าฟองต้องมีรัศมีเท่าไรจึงใส่ได้พอดี
 * รับฟังก์ชันวัดความกว้างเข้ามา เพื่อทดสอบได้โดยไม่ต้องมี canvas
 */
export const layoutBubbleLabel = (
  text: string,
  fontSize: number,
  measure: (value: string) => number,
  maxCharsPerLine = 14,
): LabelLayout => {
  const source = text.trim()
  const words = source.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let consumed = 0

  for (const word of words) {
    const current = lines[lines.length - 1]

    if (current !== undefined && current.length + 1 + word.length <= maxCharsPerLine) {
      lines[lines.length - 1] = `${current} ${word}`
      consumed += word.length + 1
      continue
    }

    if (lines.length >= 2) break

    let remaining = word
    while (remaining.length > maxCharsPerLine && lines.length < 2) {
      lines.push(remaining.slice(0, maxCharsPerLine))
      consumed += maxCharsPerLine
      remaining = remaining.slice(maxCharsPerLine)
    }

    if (remaining && lines.length < 2) {
      lines.push(remaining)
      consumed += remaining.length
    }
  }

  if (lines.length === 0) lines.push(source.slice(0, maxCharsPerLine))

  // ยังเหลือข้อความที่ใส่ไม่หมด ต่อจุดสามจุดไว้ให้รู้ว่าถูกตัด
  if (consumed < source.length) {
    const last = lines.length - 1
    const room = Math.max(1, maxCharsPerLine - 1)
    lines[last] = `${lines[last].slice(0, room)}…`
  }

  const widest = lines.reduce((largest, line) => Math.max(largest, measure(line)), 0)
  const lineHeight = fontSize * 1.2
  // ข้อความต้องอยู่ในคอร์ดของวงกลม ใช้พื้นที่ได้ราว 1.5 เท่าของรัศมี
  const radiusForWidth = widest / 1.5
  const radiusForHeight = (lines.length * lineHeight + fontSize * 1.1) / 1.5

  return {
    lines,
    requiredRadius: Math.ceil(Math.max(radiusForWidth, radiusForHeight) + 2),
  }
}

interface BuildOptions {
  groups: HabitGroup[]
  width: number
  height: number
  /** จำนวนฟองมากสุดที่ยอมวาด */
  maxBubbles: number
  /** เพดานขนาดตัวอักษร ฟองเล็กจะได้ตัวเล็กลงตามรัศมีเอง */
  maxFontSize: number
  measure: (value: string, fontSize: number) => number
  /** สัดส่วนพื้นที่เวทีที่ยอมให้ฟองกินรวมกัน กันไม่ให้แน่นจนอ่านไม่ออก */
  areaBudgetRatio?: number
  previous?: Map<number, Bubble>
  random?: () => number
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

export const buildBubbleField = ({
  groups,
  width,
  height,
  maxBubbles,
  maxFontSize,
  measure,
  areaBudgetRatio = 0.5,
  previous,
  random = Math.random,
}: BuildOptions): BubbleField => {
  if (width <= 0 || height <= 0 || groups.length === 0) {
    return { bubbles: [], labels: [], omitted: 0 }
  }

  const candidates = groups.flatMap((group) => group.habits.map((habit) => ({ group, habit })))
  if (candidates.length === 0) return { bubbles: [], labels: [], omitted: 0 }

  const maxCount = candidates.reduce((largest, { habit }) => Math.max(largest, habit.count), 1)
  const budget = width * height * areaBudgetRatio

  // เลือกสิ่งที่จ่ายบ่อยที่สุดก่อน แล้วหยุดเมื่อพื้นที่จะแน่นเกินไป
  const ranked = [...candidates].sort(
    (left, right) => right.habit.count - left.habit.count || right.habit.total - left.habit.total,
  )

  const shortlist = ranked.slice(0, maxBubbles)

  // ขั้นแรกคิดขนาดเป็นสัดส่วนจากความถี่ ฟองที่จ่ายบ่อยสุดใหญ่กว่าที่จ่ายครั้งเดียวราว 3 เท่า
  const relativeRadii = shortlist.map(
    ({ habit }) => 1 + 2.1 * Math.sqrt(habit.count / maxCount),
  )
  const relativeArea = relativeRadii.reduce((sum, value) => sum + Math.PI * value * value, 0)
  // ขั้นสองย่อทั้งชุดพร้อมกันให้พื้นที่รวมพอดีเวที สัดส่วนระหว่างฟองจึงไม่เปลี่ยน
  const scale = Math.sqrt(budget / relativeArea)

  const accepted = shortlist.map((candidate, index) => {
    const radius = clamp(relativeRadii[index] * scale, COUNT_MIN_RADIUS, COUNT_MAX_RADIUS)
    const bubbleFontSize = clamp(Math.round(radius * 0.26), 9, maxFontSize)

    // ขั้นสามค่อยจัดชื่อให้พอดีฟองที่ได้ ถ้ายังล้นก็ลดจำนวนตัวอักษรต่อบรรทัดลงเรื่อย ๆ
    let layout = layoutBubbleLabel(
      candidate.habit.name,
      bubbleFontSize,
      (value) => measure(value, bubbleFontSize),
      MAX_CHARS_PER_LINE,
    )

    for (
      let maxChars = MAX_CHARS_PER_LINE - 1;
      maxChars >= 4 && layout.requiredRadius > radius;
      maxChars -= 1
    ) {
      layout = layoutBubbleLabel(
        candidate.habit.name,
        bubbleFontSize,
        (value) => measure(value, bubbleFontSize),
        maxChars,
      )
    }

    return {
      group: candidate.group,
      habit: candidate.habit,
      radius,
      // ฟองเล็กเกินกว่าจะอ่านตัวหนังสือได้ ปล่อยว่างไว้แล้วไปโชว์ชื่อตอนชี้แทน
      lines: layout.requiredRadius <= radius ? layout.lines : [],
      fontSize: bubbleFontSize,
    }
  })

  const usedGroups = groups.filter((group) =>
    accepted.some(({ group: candidateGroup }) => candidateGroup.key === group.key),
  )
  const columns = Math.max(1, Math.min(usedGroups.length, Math.ceil(Math.sqrt(usedGroups.length))))
  const rows = Math.ceil(usedGroups.length / columns)
  const cellWidth = width / columns
  const cellHeight = height / rows

  const bubbles: Bubble[] = []
  const labels: ClusterLabel[] = []

  usedGroups.forEach((group, groupIndex) => {
    const column = groupIndex % columns
    const row = Math.floor(groupIndex / columns)
    const centerX = (column + 0.5) * cellWidth
    const centerY = (row + 0.5) * cellHeight
    const members = accepted.filter(({ group: candidateGroup }) => candidateGroup.key === group.key)
    const averageRadius = members.reduce((sum, { radius }) => sum + radius, 0) / members.length

    labels.push({
      key: group.key,
      label: `${group.emoji} ${group.label}`,
      x: centerX,
      y: centerY,
    })

    members.forEach(({ habit, radius, lines, fontSize: bubbleFontSize }, memberIndex) => {
      const angle = memberIndex * GOLDEN_ANGLE
      const distance = Math.sqrt(memberIndex) * averageRadius * 1.35
      const homeX = clamp(centerX + Math.cos(angle) * distance, radius, Math.max(width - radius, radius))
      const homeY = clamp(centerY + Math.sin(angle) * distance, radius, Math.max(height - radius, radius))
      const existing = previous?.get(habit.id)

      bubbles.push({
        id: habit.id,
        x: existing?.x ?? homeX + (random() - 0.5) * 40,
        y: existing?.y ?? homeY + (random() - 0.5) * 40,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
        homeX,
        homeY,
        radius,
        color: group.color,
        categoryKey: group.key,
        categoryLabel: group.label,
        emoji: group.emoji,
        name: habit.name,
        lines,
        fontSize: bubbleFontSize,
        count: habit.count,
        total: habit.total,
        lastDate: habit.lastDate,
      })
    })
  })

  return { bubbles, labels, omitted: candidates.length - bubbles.length }
}

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
