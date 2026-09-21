import { z } from 'zod'

// Shape of the data extracted from a driver's 配車表 PDF by the AI model
// (see app/api/dispatch-sheet/extract/route.ts). Mirrors the fields shown
// on 縦型運行指示書 (the target vertical/mobile layout this app renders
// into), minus the handwritten-in-the-field columns (天候・出庫/帰庫時
// 間・メーター・休憩時間) which this viewer intentionally omits — it
// displays dispatch instructions, not a place to log a drive.
export const dispatchVehicleSchema = z.object({
  order: z
    .number()
    .describe('1から始まる、配車表内でのこの車両の連番（何台目か）'),
  round: z
    .number()
    .describe('回戦番号（第1回戦なら1、第2回戦なら2など）。不明な場合は1'),
  roundDepot: z
    .string()
    .nullable()
    .describe('その回戦の搬送元となる基地・ヤード名（例: 共栄 本郷ヤード）'),
  carModel: z.string().describe('車両の品名・車種名（例: BMW ミニクーパー）'),
  vin: z.string().nullable().describe('車体番号（VIN）'),
  pickupLocation: z.string().describe('積地（出荷地）'),
  dropoffLocation: z.string().describe('降地（納入地）'),
  billingDestination: z.string().nullable().describe('請求先'),
  loadDate: z.string().nullable().describe('積の日付（例: 09/18）'),
  unloadCondition: z
    .string()
    .nullable()
    .describe('降の日付・条件（例: 09/20以降、指定迄）'),
  venue: z
    .string()
    .nullable()
    .describe('会場・オークション名と番号（例: USS横浜 9/22(K8104)）'),
  auctionNumber: z.string().nullable().describe('オークションNo（会場情報とは別に記載されている場合）'),
  notes: z
    .string()
    .nullable()
    .describe(
      '連絡先・注意事項・鍵の指定など、その他の補足情報をまとめた自由記述',
    ),
})

export const dispatchSheetSchema = z.object({
  dispatchDate: z
    .string()
    .nullable()
    .describe('配車日。月日のみ記載されている場合はそのまま（例: 09月19日）'),
  dispatchNumber: z.string().nullable().describe('配車番号'),
  vehicleNumber: z.string().nullable().describe('号車'),
  driverName: z.string().nullable().describe('乗務員名'),
  vehicles: z.array(dispatchVehicleSchema),
})

export type DispatchVehicle = z.infer<typeof dispatchVehicleSchema>
export type ExtractedDispatchSheet = z.infer<typeof dispatchSheetSchema>
