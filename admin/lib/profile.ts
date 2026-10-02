// プロフィールの選択肢 (mirrors account_profiles / the iOS VehicleClass).

export const VEHICLE_CLASSES = [
  ['loader', 'ローダー'],
  ['two_car', '2積み'],
  ['heavy', '増トン'],
  ['three_car', '3積み'],
  ['five_car', '5積み'],
  ['trailer_hanging', 'トレーラー（非キャブ・宙吊り）'],
  ['trailer_lifter', 'トレーラー（非キャブ・リフター）'],
  ['cab_trailer_hanging', 'トレーラー（キャブ搭・宙吊り）'],
  ['cab_trailer_lifter', 'トレーラー（キャブ搭・リフター）'],
] as const

export type VehicleClass = (typeof VEHICLE_CLASSES)[number][0]

export function vehicleClassLabel(value: string | null | undefined): string {
  return VEHICLE_CLASSES.find(([v]) => v === value)?.[1] ?? '未設定'
}

export function isTrailerClass(value: string | null | undefined): boolean {
  return !!value && value.includes('trailer')
}

export const VEHICLE_KINDS = [
  ['truck', '単車'],
  ['head', 'ヘッド'],
  ['chassis', '台車'],
] as const

export function vehicleKindLabel(kind: string): string {
  return VEHICLE_KINDS.find(([v]) => v === kind)?.[1] ?? kind
}

/** "" → null for optional form values. */
export function optional(form: FormData, key: string): string | null {
  const v = String(form.get(key) ?? '').trim()
  return v === '' ? null : v
}

/** Validates the vehicles against the class: trailers use a head + 台車, others a 単車. */
export function vehicleProblem(vehicleClass: string | null, vehicleKind: string | null, chassisKind: string | null): string | null {
  if (vehicleKind && isTrailerClass(vehicleClass) && vehicleKind !== 'head') return 'トレーラーの担当車両は「ヘッド」を選んでください。'
  if (vehicleKind && vehicleClass && !isTrailerClass(vehicleClass) && vehicleKind !== 'truck') return '単車の車格には「単車」の車両を選んでください。'
  if (chassisKind && chassisKind !== 'chassis') return '台車には「台車」の車両を選んでください。'
  if (chassisKind && !isTrailerClass(vehicleClass)) return '台車を割り当てられるのはトレーラーだけです。'
  return null
}
