export type BlockName = '墨线版' | '黄版' | '红版' | '绿版'
export type WoodType = '梨木' | '黄杨'
export type BlockState = '待刻' | '在刻' | '已刻成' | '待修版' | '已修版'

export interface Block {
  id: string
  draftId: string
  blockName: BlockName
  colorNo: number
  woodType: WoodType
  thicknessMm: number
  carvedBy: string
  state: BlockState
  defectNote: string
  /** 本版当前周期累计印数；修整后归零从头计印 */
  printCount: number
  /** 历史修整次数 */
  repairCount: number
}
