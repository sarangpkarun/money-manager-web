import { explain } from '@/lib/online'
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccounts } from '@/features/accounts/queries'
import { useCategories } from '@/features/categories/queries'
import { useToday, useWeekStart } from '@/features/profile/useToday'
import type { ActivityRow } from '@/lib/db'
import { formatMoney } from '@/lib/money'
import { useUi } from '@/lib/uiStore'
import { Amount } from '@/ui/Amount'
import { Chip } from '@/ui/Chip'
import { EmptyState } from '@/ui/EmptyState'
import { inputCls } from '@/ui/Field'
import { ErrorState } from '@/ui/ErrorState'
import { Skeleton } from '@/ui/Skeleton'
import { SwipeRow } from '@/ui/SwipeRow'
import { showUndo, useToasts } from '@/ui/toastStore'
import { toRpcFilters, activeFilterCount } from './filters'
import { dayLabel, flattenGroups, groupByDay, monthLabel, shiftMonth } from './group'
import { useActivity, useActivitySummary, useDeleteTransaction, useRestoreTransaction } from './queries'
import { useDeleteTransactionWithOthers, useRestorePurchase } from './othersQueries'
import { FilterSheet } from './FilterSheet'
import { TxnDetail } from './TxnDetail'
import { isEditable, isLinked, rowTitle, TxnRow } from './TxnRow'
import { useActivityFilters } from './useActivityFilters'

// stable empty lists
const ROW_H = 64
const HEADER_H = 40

function useDeleteWithUndo() {
  const del = useDeleteTransaction()
  const restore = useRestoreTransaction()
  const delPurchase = useDeleteTransactionWithOthers()
  const restorePurchase = useRestorePurchase()
  return useCallback(async (row: ActivityRow) => {
    try {
      if (row.others?.length) {
        // a purchase friends owe money on: blocked with a clear message once anyone has paid; otherwise Undo restores it with the friends
        const snap = await delPurchase.mutateAsync(row.id)
        showUndo(`Deleted ${formatMoney(row.amount_paise)} · ${rowTitle(row)}`, () => restorePurchase.mutate(snap))
        return
      }
      const full = await del.mutateAsync(row.id)
      showUndo(`Deleted ${formatMoney(row.amount_paise)} · ${rowTitle(row)}`, () => restore.mutate(full))
    } catch (e) {
      useToasts.getState().show({ message: `Couldn't delete: ${explain(e)}`, duration: 8000 })
    }
  }, [del, restore, delPurchase, restorePurchase])
}

export default function ActivityScreen() {
  const navigate = useNavigate()
  const today = useToday()
  const weekStart = useWeekStart()
  const month = useUi((s) => s.month)
  const setMonth = useUi((s) => s.setMonth)
  const openQuickAdd = useUi((s) => s.openQuickAdd)
  const { filters, setFilters } = useActivityFilters()
  const remove = useDeleteWithUndo()

  const rpc = useMemo(() => toRpcFilters(filters, today, month, weekStart), [filters, today, month, weekStart])
  const list = useActivity(rpc)
  const summary = useActivitySummary(rpc)
  const rows = useMemo(() => list.data?.pages.flat() ?? [], [list.data])
  const items = useMemo(() => flattenGroups(groupByDay(rows)), [rows])
  const [selected, setSelected] = useState<ActivityRow | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const accounts = useAccounts().data ?? []
  const categories = useCategories().data ?? []

  // search box: local text, debounced into the URL
  const [text, setText] = useState(filters.q ?? '')
  const [prevQ, setPrevQ] = useState(filters.q)
  if (filters.q !== prevQ) {
    setPrevQ(filters.q)
    setText(filters.q ?? '')
  }
  useEffect(() => {
    const id = window.setTimeout(() => {
      const next = text.trim() || undefined
      if (next !== filters.q) setFilters({ ...filters, q: next })
    }, 250)
    return () => window.clearTimeout(id)
  }, [text, filters, setFilters])

  // virtualised list with sticky day headers
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickyIdx = useMemo(() => items.flatMap((it, i) => (it.type === 'header' ? [i] : [])), [items])
  const activeSticky = useRef(0)
  const rangeExtractor = useCallback((range: Range) => {
    activeSticky.current = [...stickyIdx].reverse().find((i) => range.startIndex >= i) ?? 0
    return [...new Set([activeSticky.current, ...defaultRangeExtractor(range)])].sort((a, b) => a - b)
  }, [stickyIdx])
  // TanStack Virtual's functions are not memoisable; the React Compiler is not used here, so the lint note does not apply.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virt = useVirtualizer({
    count: items.length, getScrollElement: () => scrollRef.current, overscan: 8, rangeExtractor,
    estimateSize: (i) => (items[i]?.type === 'header' ? HEADER_H : ROW_H), getItemKey: (i) => items[i]?.key ?? i,
  })
  const vItems = virt.getVirtualItems()
  const lastIndex = vItems[vItems.length - 1]?.index ?? 0
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && items.length > 0 && lastIndex >= items.length - 10) void fetchNextPage()
  }, [lastIndex, items.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const filterCount = activeFilterCount(filters)
  const filtered = filterCount > 0 || !!filters.q
  const hasPreset = !!filters.preset
  const accountSel = filters.accounts ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-4 pb-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-3xl font-bold">Activity</h1>
          <div className={`flex items-center gap-1 ${hasPreset ? 'opacity-40' : ''}`}>
            <button aria-label="Previous month" disabled={hasPreset} onClick={() => setMonth(shiftMonth(month, -1))} className="h-11 w-11 text-xl">‹</button>
            <span className="min-w-32 text-center text-sm font-medium">{monthLabel(month)}</span>
            <button aria-label="Next month" disabled={hasPreset} onClick={() => setMonth(shiftMonth(month, 1))} className="h-11 w-11 text-xl">›</button>
          </div>
        </div>

        <div className="flex gap-2">
          <input type="search" aria-label="Search transactions" placeholder="Search title, place, notes, tags…" value={text}
                 onChange={(e) => setText(e.target.value)} className={inputCls} />
          <button onClick={() => setFilterOpen(true)} aria-label={filterCount ? `Filters, ${filterCount} active` : 'Filters'}
                  className={`relative h-12 w-12 shrink-0 rounded-xl border ${filterCount ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface-2'}`}>
            <span aria-hidden>⚙︎</span>
            {filterCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-money-red px-1 text-xs text-on-accent">{filterCount}</span>}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-surface p-3 text-center" aria-label="Totals">
          {(['spent', 'received', 'net'] as const).map((k) => (
            <div key={k}>
              <div className="text-xs capitalize text-muted">{k}</div>
              {summary.data
                ? <Amount paise={summary.data[k]} tone={k === 'spent' ? 'out' : k === 'received' ? 'in' : 'neutral'} className="text-lg font-semibold" />
                : <Skeleton className="mx-auto mt-1 h-6 w-16" />}
            </div>
          ))}
        </div>

        {(summary.data?.by_account.length ?? 0) > 1 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Filter by account">
            {summary.data?.by_account.map((a) => (
              <Chip key={a.account_id} selected={accountSel.includes(a.account_id)}
                    onClick={() => setFilters({ ...filters, accounts: accountSel.includes(a.account_id) ? undefined : [a.account_id] })}>
                {a.name} <span className="tabular opacity-80">{formatMoney(a.spent)}</span>
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="activity-list">
        {list.isPending ? (
          <div className="space-y-2 px-4 pt-2" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : list.isError ? (
          <ErrorState what="activity" className="mx-4 mt-4" onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          filtered
            ? <EmptyState title="No matches" hint="Nothing fits these filters." action={<button onClick={() => setFilters({})} className="min-h-11 rounded-full bg-accent px-5 text-on-accent">Clear filters</button>} />
            : <EmptyState title="Nothing here yet" hint={`No transactions in ${monthLabel(month)}.`} action={<button onClick={() => openQuickAdd()} className="min-h-11 rounded-full bg-accent px-5 text-on-accent">Add your first expense</button>} />
        ) : (
          <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
            {vItems.map((v) => {
              const it = items[v.index]
              if (!it) return null
              const sticky = it.type === 'header' && activeSticky.current === v.index
              const style = sticky
                ? { position: 'sticky' as const, top: 0, zIndex: 2, height: v.size }
                : { position: 'absolute' as const, top: 0, left: 0, width: '100%', height: v.size, transform: `translateY(${v.start}px)` }
              return (
                <div key={v.key} data-index={v.index} style={style}>
                  {it.type === 'header' ? (
                    <div className="flex h-full items-center justify-between bg-bg px-4 text-sm font-semibold text-muted">
                      <span>{dayLabel(it.date, today)}</span>
                      <span className="tabular font-normal">
                        {it.received > 0 && <span className="text-money-green">+{formatMoney(it.received)} </span>}
                        {it.spent > 0 && <span>{formatMoney(it.spent)} spent</span>}
                      </span>
                    </div>
                  ) : (
                    <SwipeRow onSwipeRight={isEditable(it.row) ? () => openQuickAdd({ edit: it.row }) : undefined}
                              onSwipeLeft={isLinked(it.row) ? undefined : () => void remove(it.row)}>
                      <TxnRow row={it.row} onOpen={() => setSelected(it.row)} />
                    </SwipeRow>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {isFetchingNextPage && <div className="p-4 text-center text-sm text-muted">Loading more…</div>}
      </div>

      {filterOpen && <FilterSheet filters={filters} accounts={accounts} categories={categories} onApply={setFilters} onClose={() => setFilterOpen(false)} />}
      {selected && (
        <TxnDetail row={selected} onClose={() => setSelected(null)}
                   onEdit={() => { openQuickAdd({ edit: selected }); setSelected(null) }}
                   onDelete={() => { void remove(selected); setSelected(null) }}
                   onOpenEntry={(id) => { setSelected(null); navigate(`/money/entry/${id}`) }} />
      )}
    </div>
  )
}
