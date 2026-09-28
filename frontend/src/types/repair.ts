export interface RepairRecord {
  id: string
  blockId: string
  /** 本周期停版时累计的印数，修整后从头计印，旧值留档 */
  retiredPrintCount: number
  /** 修版量（修补面积，平方厘米） */
  repairArea: number
  /** 修版用时（分钟） */
  durationMin: number
  repairedAt: string
  repairedBy: string
  note: string
}
