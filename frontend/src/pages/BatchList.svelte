<script lang="ts">
  import { onMount } from 'svelte'
  import EmptyBox from '../components/common/EmptyBox.svelte'
  import { draftStore } from '../stores/draftStore'
  import { blockStore } from '../stores/blockStore'
  import { buildDeviationNote } from '../utils/seq'
  import { downloadJson } from '../utils/export'
  import { printLimit, remainingPrints, savePrintBatch } from '../utils/print'
  import { db } from '../utils/db'
  import type { PrintBatch } from '../types/batch'

  let batches = $state<PrintBatch[]>([])
  let showForm = $state(false)
  let draftId = $state('')
  let batchNo = $state('')
  let printedAt = $state(new Date().toISOString().slice(0, 10))
  let paperBatch = $state('')
  let inkNote = $state('')
  let qty = $state(100)
  let pieceCount = $state(4)
  let qcNote = $state('')
  let deviations = $state<Record<string, string>>({})
  let formMessage = $state('')
  let pageNotice = $state('')

  const selectedDraft = $derived($draftStore.find((draft) => draft.id === draftId) ?? null)
  const selectedBlocks = $derived(
    draftId ? [...$blockStore].filter((block) => block.draftId === draftId).sort((a, b) => a.colorNo - b.colorNo) : [],
  )
  const selectedQuota = $derived(
    selectedBlocks.map((block) => ({
      block,
      limit: printLimit(block.woodType),
      remaining: remainingPrints(block),
    })),
  )
  const overQuota = $derived(selectedQuota.filter((quota) => quota.remaining < Number(qty) || quota.block.state === '待修版'))

  onMount(() => {
    void Promise.all([draftStore.load(), blockStore.load(), refreshBatches()])
  })

  async function refreshBatches(): Promise<void> {
    const records = await db.batches.toArray()
    records.sort((a, b) => b.printedAt.localeCompare(a.printedAt) || b.batchNo.localeCompare(a.batchNo, 'zh-CN'))
    batches = records
  }

  function openForm(): void {
    showForm = true
    formMessage = ''
    if (!draftId) {
      const firstDraft = $draftStore[0]
      if (firstDraft) selectDraft(firstDraft.id)
    }
  }

  function selectDraft(nextId: string): void {
    draftId = nextId
    deviations = {}
    const target = $draftStore.find((draft) => draft.id === nextId)
    if (target) batchNo = `${target.title}-${new Date().getFullYear()}-01`
  }
  function draftTitle(targetId: string): string {
    return $draftStore.find((draft) => draft.id === targetId)?.title ?? '未知画稿'
  }

  async function submitBatch(): Promise<void> {
    if (!draftId || !batchNo.trim() || !paperBatch.trim() || qty <= 0 || pieceCount <= 0) {
      formMessage = '请选择画稿，并补全批次号、纸张批号和印数。'
      return
    }

    const deviationText = buildDeviationNote(
      selectedBlocks.map((block) => ({
        blockName: block.blockName,
        deviation: deviations[block.id] ?? '',
      })),
    )

    const finalQcNote = qcNote.trim() ? `${qcNote.trim()}；${deviationText}` : deviationText

    const result = await savePrintBatch({
      draftId,
      batchNo: batchNo.trim(),
      printedAt,
      paperBatch: paperBatch.trim(),
      inkNote: inkNote.trim() || '颜料与胶量待续记',
      qty: Number(qty),
      pieceCount: Number(pieceCount),
      qcNote: finalQcNote,
    })

    if (!result.ok) {
      formMessage = result.message
      return
    }

    await Promise.all([refreshBatches(), blockStore.load()])
    showForm = false
    batchNo = ''
    paperBatch = ''
    inkNote = ''
    qty = 100
    pieceCount = 4
    qcNote = ''
    deviations = {}
    formMessage = ''
    pageNotice =
      result.reachedLimitBlockNames.length > 0
        ? `批次已保存。${result.reachedLimitBlockNames.join('、')}已到停版额度，转为待修版，请编排台安排修整。`
        : '批次已保存，本批印数已累加到该画稿各版片。'
  }

  async function exportArchive(): Promise<void> {
    const [drafts, blocks, carvers, nodes, repairRecords] = await Promise.all([
      db.drafts.toArray(),
      db.blocks.toArray(),
      db.carvers.toArray(),
      db.nodes.toArray(),
      db.repairs.toArray(),
    ])
    downloadJson('木版年画工序档案.json', {
      exportedAt: new Date().toISOString(),
      drafts,
      blocks,
      batches,
      carvers,
      nodes,
      repairs: repairRecords,
    })
  }
</script>

<svelte:head>
  <title>印制批次登记 · 木版年画刻版工序档案</title>
</svelte:head>

<div class="page-heading">
  <div>
    <p class="eyebrow">套色印制留档</p>
    <h1>印制批次登记</h1>
    <p>登记纸张、颜料与每版印次，逐版留下套色偏差。</p>
  </div>
  <div class="heading-actions">
    <button class="button ghost" type="button" onclick={exportArchive}>导出 JSON</button>
    <button class="button primary" data-testid="new-batch" type="button" onclick={openForm}>新建批次</button>
  </div>
</div>

<section class="summary-strip four">
  <div><span>登记批次</span><strong data-testid="count-batch">{batches.length}</strong></div>
  <div><span>累计印数</span><strong>{batches.reduce((sum, batch) => sum + batch.qty, 0)}</strong></div>
  <div><span>覆盖画稿</span><strong>{new Set(batches.map((batch) => batch.draftId)).size}</strong></div>
  <div><span>在册画稿</span><strong>{$draftStore.length}</strong></div>
</section>

{#if pageNotice}
  <p class="notice page-notice" data-testid="page-notice">
    {pageNotice}
    <button class="text-button" type="button" onclick={() => (pageNotice = '')}>知道了</button>
  </p>
{/if}

{#if showForm}
  <section class="panel form-panel" data-testid="form-batch">
    <div class="panel-heading">
      <div>
        <span class="section-kicker">新印批</span>
        <h2>登记纸张与套色检查</h2>
      </div>
      <button class="text-button" type="button" onclick={() => (showForm = false)}>收起</button>
    </div>

    <div class="form-grid three">
      <label>
        <span>所属画稿</span>
        <select data-testid="field-draftId" value={draftId} onchange={(event) => selectDraft((event.currentTarget as HTMLSelectElement).value)}>
          <option value="">请选择</option>
          {#each $draftStore as draft}<option value={draft.id}>{draft.title} · {draft.genre}</option>{/each}
        </select>
      </label>
      <label>
        <span>批次号</span>
        <input data-testid="field-batchNo" bind:value={batchNo} />
      </label>
      <label>
        <span>印制日期</span>
        <input data-testid="field-printedAt" type="date" bind:value={printedAt} />
      </label>
      <label>
        <span>纸张批号</span>
        <input data-testid="field-paperBatch" bind:value={paperBatch} placeholder="如：泾县-2605" />
      </label>
      <label>
        <span>总印数</span>
        <input data-testid="field-qty" type="number" min="1" bind:value={qty} />
      </label>
      <label>
        <span>每版印次</span>
        <input data-testid="field-pieceCount" type="number" min="1" bind:value={pieceCount} />
      </label>
      <label class="wide">
        <span>颜料与胶量</span>
        <textarea data-testid="field-inkNote" rows="2" bind:value={inkNote} placeholder="分色记录颜料、胶量与稀稠"></textarea>
      </label>
    </div>

    {#if selectedDraft}
      <div class="deviation-block">
        <div class="section-title-row">
          <div>
            <span class="section-kicker">逐版检查</span>
            <h3>{selectedDraft.title}各版余量与套色偏差</h3>
          </div>
          <span>{selectedBlocks.length} 块版片 · 本批 {qty} 印逐版累加</span>
        </div>

        {#if overQuota.length > 0}
          <div class="quota-warning" data-testid="quota-warning">
            <strong>本批 {qty} 印会超限，保存将被拒收：</strong>
            <ul>
              {#each overQuota as quota}
                <li data-testid={`quota-over-${quota.block.id}`}>
                  {quota.block.blockName}（{quota.block.woodType}，额度 {quota.limit} 印）
                  {#if quota.block.state === '待修版'}
                    已到线待修，本批不计印
                  {:else}
                    还剩 <b>{quota.remaining}</b> 印
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        <div class="deviation-grid">
          {#each selectedQuota as quota}
            {@const block = quota.block}
            {@const short = quota.remaining < Number(qty) || block.state === '待修版'}
            <label class:short-quota={short}>
              <span><b>{block.colorNo}</b>{block.blockName}</span>
              <small class="quota-line {short ? 'over' : ''}" data-testid={`quota-${block.id}`}>
                {block.woodType} · 已印 {block.printCount} / {quota.limit} · 剩 {quota.remaining}
                {#if block.state === '待修版'}<em>待修版</em>{/if}
              </small>
              <input
                data-testid={`field-deviation-${block.id}`}
                value={deviations[block.id] ?? ''}
                oninput={(event) => (deviations[block.id] = (event.currentTarget as HTMLInputElement).value)}
                placeholder="如：右下角偏红线半根"
              />
            </label>
          {/each}
        </div>
      </div>
    {/if}

    <label class="stacked-field">
      <span>总检说明</span>
      <textarea data-testid="field-qcNote" rows="2" bind:value={qcNote} placeholder="走版、纸面洇墨与整体套准情况"></textarea>
    </label>

    {#if formMessage}<p class="form-message">{formMessage}</p>{/if}
    <div class="form-actions">
      <button class="button primary" data-testid="submit-batch" type="button" onclick={submitBatch}>保存批次</button>
      <button class="button ghost" type="button" onclick={() => (showForm = false)}>取消</button>
    </div>
  </section>
{/if}

{#if batches.length === 0}
  <EmptyBox
    title="尚无印制批次"
    message="版片刻成后即可逐版试印，登记纸张与套色偏差。"
    actionLabel="新建批次"
    onaction={openForm}
  />
{:else}
  <section class="batch-list">
    {#each batches as batch (batch.id)}
      <article class="panel batch-item" data-testid="row-batch">
        <div class="batch-number">
          <span>{batch.printedAt.replace(/-/g, '.')}</span>
          <h2>{batch.batchNo}</h2>
          <p>{draftTitle(batch.draftId)} · {batch.paperBatch}</p>
        </div>
        <div class="batch-counts">
          <div><span>总印数</span><strong>{batch.qty}</strong></div>
          <div><span>每版印次</span><strong>{batch.pieceCount}</strong></div>
        </div>
        <div class="batch-notes">
          <p><b>颜料胶量：</b>{batch.inkNote}</p>
          <p><b>套色检查：</b>{batch.qcNote}</p>
        </div>
      </article>
    {/each}
  </section>
{/if}
