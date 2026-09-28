import { writable } from 'svelte/store'
import type { RepairRecord } from '../types/repair'
import { db } from '../utils/db'

const repairList = writable<RepairRecord[]>([])

async function load(): Promise<void> {
  const records = await db.repairs.toArray()
  records.sort((a, b) => b.repairedAt.localeCompare(a.repairedAt) || b.seq - a.seq)
  repairList.set(records)
}

/** 各版片的累计修版次数 */
function countByBlock(records: RepairRecord[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const record of records) {
    counts[record.blockId] = (counts[record.blockId] ?? 0) + 1
  }
  return counts
}

export const repairStore = {
  subscribe: repairList.subscribe,
  load,
  countByBlock,
}
