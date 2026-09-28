import { derived, writable } from 'svelte/store'
import type { Block } from '../types/block'
import type { RepairRecord } from '../types/repair'
import { db } from '../utils/db'

const blockList = writable<Block[]>([])

export interface DraftBlockStats {
  total: number
  carved: number
  rate: number
}

const statsByDraft = derived(blockList, ($blocks) => {
  const stats: Record<string, DraftBlockStats> = {}
  for (const block of $blocks) {
    const current = stats[block.draftId] ?? { total: 0, carved: 0, rate: 0 }
    current.total += 1
    if (block.state === '已刻成' || block.state === '已修版' || block.state === '待修版') current.carved += 1
    current.rate = current.total === 0 ? 0 : Math.round((current.carved / current.total) * 100)
    stats[block.draftId] = current
  }
  return stats
})

async function load(): Promise<void> {
  const records = await db.blocks.toArray()
  records.sort((a, b) => a.draftId.localeCompare(b.draftId) || a.colorNo - b.colorNo)
  blockList.set(records)
}

async function create(input: Omit<Block, 'id'>): Promise<string> {
  const id = `block-${crypto.randomUUID()}`
  await db.blocks.add({ id, ...input })
  await load()
  return id
}

async function update(id: string, changes: Partial<Omit<Block, 'id'>>): Promise<void> {
  await db.blocks.update(id, changes)
  await load()
}

async function reorder(ordered: Array<Pick<Block, 'id' | 'colorNo'>>): Promise<void> {
  await db.transaction('rw', db.blocks, async () => {
    for (const item of ordered) {
      await db.blocks.update(item.id, { colorNo: item.colorNo })
    }
  })
  await load()
}

async function removeByDraft(draftId: string): Promise<void> {
  await db.blocks.where('draftId').equals(draftId).delete()
  await load()
}

export interface RepairInput {
  repairQty: number
  durationMin: number
  operator: string
  note?: string
  repairedAt?: string
}

/**
 * 完成待修版的修整：旧印数留档进 repairs，印数归零从头计印，状态转「已修版」，
 * 同时补一条修版工序节点。
 */
async function completeRepair(block: Block, input: RepairInput): Promise<void> {
  const existingRepairs = await db.repairs.where('blockId').equals(block.id).toArray()
  const existingNodes = await db.nodes.where('blockId').equals(block.id).toArray()

  await db.transaction('rw', db.blocks, db.repairs, db.nodes, async () => {
    const record: RepairRecord = {
      id: `repair-${crypto.randomUUID()}`,
      blockId: block.id,
      draftId: block.draftId,
      seq: Math.max(0, ...existingRepairs.map((item) => item.seq)) + 1,
      repairedAt: input.repairedAt ?? new Date().toISOString().slice(0, 10),
      repairQty: Math.max(0, Math.floor(Number(input.repairQty))),
      durationMin: Math.max(0, Math.floor(Number(input.durationMin))),
      operator: input.operator.trim() || block.carvedBy || '修版刻工',
      note: input.note?.trim() || `第${existingRepairs.length + 1}次修版，修整 ${input.repairQty} 处。`,
      previousPrintCount: block.printCount,
      schemaRev: 3,
    }
    await db.repairs.add(record)
    await db.blocks.update(block.id, { state: '已修版', printCount: 0 })
    await db.nodes.add({
      id: `node-${crypto.randomUUID()}`,
      blockId: block.id,
      stage: '修版',
      seq: Math.max(0, ...existingNodes.map((node) => node.seq)) + 1,
      operator: record.operator,
      startedAt: new Date().toISOString().slice(0, 16),
      durationMin: record.durationMin,
      note: `修版 ${record.repairQty} 处；旧轮累计印 ${record.previousPrintCount} 已留档，印数归零。`,
    })
  })
  await load()
}

export const blockStore = {
  subscribe: blockList.subscribe,
  statsByDraft,
  load,
  create,
  update,
  reorder,
  removeByDraft,
  completeRepair,
}
