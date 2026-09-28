import type { Block, WoodType } from '../types/block'

/** 各木料停版修整的累计印数额度：梨木八千印，黄杨一万二千印 */
export const PRINT_QUOTA: Record<WoodType, number> = {
  梨木: 8000,
  黄杨: 12000,
}

export function printQuota(woodType: WoodType): number {
  return PRINT_QUOTA[woodType]
}

/** 距停版还能印多少（不为负） */
export function remainingPrints(block: Pick<Block, 'woodType' | 'printCount'>): number {
  return Math.max(0, printQuota(block.woodType) - block.printCount)
}

/** 本批印数累加后是否超过额度（超过则整批不能保存） */
export function wouldExceedQuota(block: Pick<Block, 'woodType' | 'printCount'>, qty: number): boolean {
  return block.printCount + qty > printQuota(block.woodType)
}

/** 本批印数累加后是否正好到线（到线即转待修版） */
export function reachesQuota(block: Pick<Block, 'woodType' | 'printCount'>, qty: number): boolean {
  return block.printCount + qty === printQuota(block.woodType)
}
