import type { Block, WoodType } from '../types/block'
import type { PrintBatch } from '../types/batch'
import { db } from './db'

/** 不同木料的停版修整额度：梨木八千印，黄杨一万二千印 */
export const PRINT_LIMIT_BY_WOOD: Record<WoodType, number> = {
  梨木: 8000,
  黄杨: 12000,
}

export function printLimit(woodType: WoodType): number {
  return PRINT_LIMIT_BY_WOOD[woodType]
}

/** 当前周期剩余可印数；到线后为 0 */
export function remainingPrints(block: Pick<Block, 'printCount' | 'woodType'>): number {
  return Math.max(0, printLimit(block.woodType) - block.printCount)
}

export interface BlockQuota {
  block: Block
  limit: number
  remaining: number
}

/** 列出某画稿各版片的停版额度余量 */
export async function loadDraftQuota(draftId: string): Promise<BlockQuota[]> {
  const blocks = await db.blocks.where('draftId').equals(draftId).toArray()
  blocks.sort((a, b) => a.colorNo - b.colorNo)
  return blocks.map((block) => ({
    block,
    limit: printLimit(block.woodType),
    remaining: remainingPrints(block),
  }))
}

export interface BatchDraftInput {
  draftId: string
  batchNo: string
  printedAt: string
  paperBatch: string
  inkNote: string
  qty: number
  pieceCount: number
  qcNote: string
}

export type BatchSaveResult =
  | { ok: true; batchId: string; reachedLimitBlockNames: string[] }
  | { ok: false; reason: 'duplicate'; message: string }
  | { ok: false; reason: 'overflow'; overflow: Array<{ block: Block; remaining: number; limit: number }>; message: string }

/**
 * 保存印制批次：
 * 1. 同一画稿批次号不得重复；
 * 2. 本批印数累加到该画稿各版片，任一版片超过停版额度则整批不保存；
 * 3. 恰好到线的版片转为「待修版」。
 */
export async function savePrintBatch(input: BatchDraftInput): Promise<BatchSaveResult> {
  const batchNo = input.batchNo.trim()

  return db.transaction(
    'rw',
    db.batches,
    db.blocks,
    async (): Promise<BatchSaveResult> => {
      const sameDraftBatches = await db.batches.where('draftId').equals(input.draftId).toArray()
      if (sameDraftBatches.some((batch) => batch.batchNo.trim() === batchNo)) {
        return {
          ok: false,
          reason: 'duplicate',
          message: `同一画稿里批次号「${batchNo}」已经记过，不能重复登记。`,
        }
      }

      const blocks = await db.blocks.where('draftId').equals(input.draftId).toArray()
      blocks.sort((a, b) => a.colorNo - b.colorNo)

      const overflow = blocks
        .map((block) => ({ block, remaining: remainingPrints(block), limit: printLimit(block.woodType) }))
        .filter((item) => item.remaining < input.qty)

      if (overflow.length > 0) {
        const detail = overflow
          .map((item) => `${item.block.blockName}（${item.block.woodType}）还剩 ${item.remaining} 印，额度 ${item.limit} 印`)
          .join('；')
        return {
          ok: false,
          reason: 'overflow',
          overflow,
          message: `本批 ${input.qty} 印会使版片超过停版额度，批次未保存：${detail}。`,
        }
      }

      const batchId = `batch-${crypto.randomUUID()}`
      const record: PrintBatch = {
        id: batchId,
        draftId: input.draftId,
        batchNo,
        printedAt: input.printedAt,
        paperBatch: input.paperBatch.trim(),
        inkNote: input.inkNote.trim() || '颜料与胶量待续记',
        qty: input.qty,
        pieceCount: input.pieceCount,
        qcNote: input.qcNote,
      }
      await db.batches.add(record)

      const reachedLimitBlockNames: string[] = []
      for (const block of blocks) {
        const nextCount = block.printCount + input.qty
        const limit = printLimit(block.woodType)
        const changes: Partial<Block> = { printCount: nextCount }
        if (nextCount >= limit && block.state !== '待修版') {
          changes.state = '待修版'
          reachedLimitBlockNames.push(block.blockName)
        }
        await db.blocks.update(block.id, changes)
      }

      return { ok: true, batchId, reachedLimitBlockNames }
    },
  )
}

export interface RepairInput {
  block: Block
  repairArea: number
  durationMin: number
  repairedBy: string
  note: string
}

/**
 * 完成修版：旧周期印数留档到 repairs，版片印数归零从头计印，
 * 状态转为「已修版」，修版次数加一。
 */
export async function completeRepair(input: RepairInput): Promise<void> {
  await db.transaction('rw', db.blocks, db.repairs, db.nodes, async () => {
    const existingNodes = await db.nodes.where('blockId').equals(input.block.id).toArray()
    const nextSeq = Math.max(0, ...existingNodes.map((node) => node.seq)) + 1

    await db.repairs.add({
      id: `repair-${crypto.randomUUID()}`,
      blockId: input.block.id,
      retiredPrintCount: input.block.printCount,
      repairArea: input.repairArea,
      durationMin: input.durationMin,
      repairedAt: new Date().toISOString().slice(0, 16),
      repairedBy: input.repairedBy,
      note: input.note,
    })

    await db.nodes.add({
      id: `node-${crypto.randomUUID()}`,
      blockId: input.block.id,
      stage: '修版',
      seq: nextSeq,
      operator: input.repairedBy,
      startedAt: new Date().toISOString().slice(0, 16),
      durationMin: input.durationMin,
      note: input.note || `停版修整 ${input.repairArea} 平方厘米，旧周期 ${input.block.printCount} 印留档后从头计印。`,
    })

    await db.blocks.update(input.block.id, {
      printCount: 0,
      repairCount: input.block.repairCount + 1,
      state: '已修版',
    })
  })
}
