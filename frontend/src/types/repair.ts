export interface RepairRecord {
  id: string
  blockId: string
  draftId: string
  /** 该版片第几次修版（从 1 起） */
  seq: number
  repairedAt: string
  /** 修版量（处） */
  repairQty: number
  /** 修版用时（分钟） */
  durationMin: number
  operator: string
  note: string
  /** 修版前本轮累计印数，旧用量留档 */
  previousPrintCount: number
  schemaRev?: number
}
