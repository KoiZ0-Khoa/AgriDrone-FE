// Keep the user's text in the form. Convert only after validation so typing,
// blur and Enter cannot silently clamp coordinates or round the survey area.
export function intakeDecimal(value: string | number) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  const text = value.trim()
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return NaN
  return Number(text.replace(',', '.'))
}

export function intakeArea(value: string | number) {
  const amount = intakeDecimal(value)
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 100_000_000) throw new Error('Nhập diện tích lớn hơn 0 và nhỏ hơn 100.000.000 ha.')
  const [coefficient, exponent = '0'] = String(value).trim().replace(',', '.').toLowerCase().split('e')
  const fraction = coefficient.split('.')[1]?.replace(/0+$/, '') ?? ''
  if (fraction.length - Number(exponent) > 4) throw new Error('Diện tích tối đa 4 chữ số thập phân, ví dụ 2,5123 ha.')
  return amount
}

export function intakeCoordinate(value: string | number, axis: 'longitude' | 'latitude') {
  const amount = intakeDecimal(value)
  const limit = axis === 'latitude' ? 90 : 180
  const label = axis === 'latitude' ? 'Vĩ độ' : 'Kinh độ'
  if (!Number.isFinite(amount) || amount < -limit || amount > limit) throw new Error(`${label} phải nằm trong khoảng -${limit} đến ${limit}.`)
  return amount
}

/** Positive decimal, e.g. threshold (0.1–50). */
export function intakePositiveDecimal(value: string | number, min: number, max: number, label: string) {
  const amount = intakeDecimal(value)
  if (!Number.isFinite(amount) || amount < min || amount > max) throw new Error(`${label} phải từ ${min} đến ${max}.`)
  return amount
}

/** Non-negative integer (pole count, row, column). Returns the integer or throws. */
export function intakeInteger(value: string | number, min: number, max: number, label: string) {
  const amount = intakeDecimal(value)
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < min || amount > max) throw new Error(`${label} phải là số nguyên từ ${min} đến ${max}.`)
  return amount
}

/** Parse an optional numeric field — returns null for empty/undefined, otherwise delegates to parser. */
export function intakeOptional<T>(value: string | number | undefined | null, parser: (v: string | number) => T): T | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return null
  return parser(value)
}

/** Optional area for farm edit forms (≥0, no precision limit). */
export function intakeOptionalArea(value: string | number | undefined | null) {
  return intakeOptional(value, v => {
    const amount = intakeDecimal(v)
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Diện tích phải là số không âm.')
    return amount
  })
}
