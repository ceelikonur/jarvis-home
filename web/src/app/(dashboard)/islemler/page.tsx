'use client'

import { useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, Search, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Pencil, X, ListChecks } from 'lucide-react'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useHouseholdStore } from '@/lib/stores/household-store'
import { formatCurrency } from '@/lib/utils/currency'
import { isInPeriod } from '@/lib/utils/periods'
import { TransactionEditSheet } from '@/components/shared/transaction-edit-sheet'
import { TransactionBulkEditSheet } from '@/components/shared/transaction-bulk-edit-sheet'
import { TransactionRulesSheet } from '@/components/shared/transaction-rules-sheet'
import type { Transaction } from '@/lib/types/budget'

function txKey(t: Transaction): string {
  return `${new Date(t.date).toISOString().slice(0,10)}|${t.source}|${t.amount}`
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Yükleniyor...</div>}>
      <TransactionsContent />
    </Suspense>
  )
}

function TransactionsContent() {
  const searchParams = useSearchParams()
  const { transactions, getMonths, getPayPeriods, getAllTags, deleteTransaction } = useBudgetStore()
  const { config: household } = useHouseholdStore()

  // URL params for deep linking
  const initialType = searchParams.get('type') || 'all'
  const initialMonth = searchParams.get('month') || 'all'
  const initialCategory = searchParams.get('category') || 'all'
  const initialSubCategory = searchParams.get('sub') || 'all'
  const initialTag = searchParams.get('tag') || ''   // tag chart'tan deep link
  const initialPeriod = searchParams.get('period') || 'all'  // analiz drill-down (maaş dönemi)
  const initialSearch = searchParams.get('search') || ''     // analiz drill-down (satıcı)

  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [search, setSearch] = useState(initialSearch)
  const [monthFilter, setMonthFilter] = useState(initialMonth)
  const [categoryFilter, setCategoryFilter] = useState(initialCategory)
  const [subCategoryFilter, setSubCategoryFilter] = useState(initialSubCategory)
  const [typeFilter, setTypeFilter] = useState(initialType)
  const [personFilter, setPersonFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState(initialPeriod)
  const [activeTag, setActiveTag] = useState(initialTag)  // aktif tag filtresi

  // Sorting state
  type SortKey = 'date' | 'source' | 'category' | 'amount'
  type SortDir = 'asc' | 'desc'
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'amount' || key === 'date' ? 'desc' : 'asc')
    }
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return <ArrowUpDown className="h-3 w-3 opacity-40" />
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
  }

  const months = getMonths()
  const periods = getPayPeriods()
  const allTags = getAllTags()

  const categories = useMemo(() => {
    const cats = new Set(transactions.map(t => t.category).filter(Boolean))
    return Array.from(cats).sort()
  }, [transactions])

  const subCategories = useMemo(() => {
    const subs = new Set(transactions.map(t => t.subCategory).filter(Boolean))
    return Array.from(subs).sort()
  }, [transactions])

  const selectedPeriodObj = useMemo(() => {
    if (periodFilter === 'all') return null
    return periods.find(p => p.index === Number(periodFilter)) ?? null
  }, [periods, periodFilter])

  // Her işlem için efektif tag listesi (tags varsa onu, yoksa subCategory'yi kullan)
  function getEffectiveTags(t: Transaction): string[] {
    if (t.tags && t.tags.length > 0) return t.tags
    return t.subCategory ? [t.subCategory] : []
  }

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const effectiveTags = getEffectiveTags(t)
      if (search && !t.source.toLowerCase().includes(search.toLowerCase()) &&
          !t.category.toLowerCase().includes(search.toLowerCase()) &&
          !effectiveTags.some(tag => tag.toLowerCase().includes(search.toLowerCase()))) return false
      if (selectedPeriodObj) {
        if (!isInPeriod(new Date(t.date), selectedPeriodObj)) return false
      } else if (monthFilter !== 'all' && t.month !== monthFilter) return false
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
      if (subCategoryFilter !== 'all' && t.subCategory !== subCategoryFilter) return false
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (personFilter !== 'all') {
        const person = t.person || 'Ortak'
        if (person !== personFilter) return false
      }
      // Tag filtresi
      if (activeTag && !effectiveTags.includes(activeTag)) return false
      return true
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, search, monthFilter, categoryFilter, subCategoryFilter, typeFilter, personFilter, selectedPeriodObj, activeTag])

  // Sorted view (filtered + sorting)
  const sortedFiltered = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'date': {
          const ta = new Date(a.date).getTime() || 0
          const tb = new Date(b.date).getTime() || 0
          cmp = ta - tb
          break
        }
        case 'amount': {
          // Compare absolute spending impact (expense positive, income negative)
          const va = a.type === 'expense' ? Math.abs(a.amount) : -Math.abs(a.amount)
          const vb = b.type === 'expense' ? Math.abs(b.amount) : -Math.abs(b.amount)
          cmp = va - vb
          break
        }
        case 'source': {
          cmp = (a.source || '').localeCompare(b.source || '', 'tr')
          break
        }
        case 'category': {
          cmp = (a.category || '').localeCompare(b.category || '', 'tr')
          break
        }
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  // ── Toplu seçim ──────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkKeys, setBulkKeys] = useState<string[] | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)

  const visibleKeys = useMemo(() => sortedFiltered.map(txKey), [sortedFiltered])
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every(k => selected.has(k))

  function toggleSelect(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }
  function toggleSelectAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) visibleKeys.forEach(k => next.delete(k))
      else visibleKeys.forEach(k => next.add(k))
      return next
    })
  }
  function clearSelection() { setSelected(new Set()) }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    if (!window.confirm(`${selected.size} işlemi silmek istediğine emin misin?`)) return
    for (const k of Array.from(selected)) await deleteTransaction(k)
    clearSelection()
  }

  // Internal (hane içi) ve savings (Intesa) toplamlara dahil edilmez — ayrı gösterilir.
  // Net birikim = Intesa'ya giden − Intesa'dan gelen.
  const countedForTotals = filtered.filter(t => !t.is_internal && !t.is_savings)
  const internalCount = filtered.filter(t => t.is_internal).length
  const savingsCount = filtered.filter(t => t.is_savings).length
  const savingsTotal = filtered
    .filter(t => t.is_savings)
    .reduce((s, t) => s + (t.type === 'expense' ? Math.abs(t.amount) : -Math.abs(t.amount)), 0)
  const totalExpense = countedForTotals.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalIncome = countedForTotals.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)

  async function handleDelete(tx: Transaction, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm(`"${tx.source || '—'}" işlemini silmek istediğine emin misin?`)) return
    await deleteTransaction(txKey(tx))
  }

  const activeFilters = [periodFilter, monthFilter, categoryFilter, subCategoryFilter, typeFilter, personFilter].filter(f => f !== 'all').length + (activeTag ? 1 : 0)

  function clearFilters() {
    setSearch('')
    setPeriodFilter('all')
    setMonthFilter('all')
    setCategoryFilter('all')
    setSubCategoryFilter('all')
    setTypeFilter('all')
    setPersonFilter('all')
    setActiveTag('')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">İşlemler ({filtered.length})</h1>
          <Button variant="outline" size="sm" onClick={() => setRulesOpen(true)}>
            <ListChecks className="h-4 w-4 mr-1.5" /> Kurallar
          </Button>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="text-xs text-primary hover:underline">
              Filtreleri temizle
            </button>
          )}
        </div>
        <div className="flex gap-3 text-sm items-center flex-wrap">
          <span className="text-green-600 font-medium">Gelir: {formatCurrency(totalIncome)}</span>
          <span className="text-red-600 font-medium">Gider: {formatCurrency(totalExpense)}</span>
          {savingsCount > 0 && (
            <span className="text-sky-600 font-medium">Birikim: {formatCurrency(savingsTotal)}</span>
          )}
          {(internalCount > 0 || savingsCount > 0) && (
            <span className="text-muted-foreground text-xs">
              ({internalCount} internal, {savingsCount} birikim hariç)
            </span>
          )}
        </div>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="İşlem ara..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Tür" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="income">Gelir</SelectItem>
                <SelectItem value="expense">Gider</SelectItem>
              </SelectContent>
            </Select>
            {periods.length > 0 && (
              <Select value={periodFilter} onValueChange={(v) => { setPeriodFilter(v); if (v !== 'all') setMonthFilter('all') }}>
                <SelectTrigger className="w-[260px]">
                  <ChevronDown className="h-4 w-4 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="Dönem seç" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm işlemler</SelectItem>
                  {periods.map(p => (
                    <SelectItem key={p.index} value={String(p.index)}>
                      {p.shortLabel}{p.isActive ? ' (aktif)' : ''} — {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={monthFilter} onValueChange={(v) => { setMonthFilter(v); if (v !== 'all') setPeriodFilter('all') }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Ay" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Aylar</SelectItem>
                {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={subCategoryFilter} onValueChange={setSubCategoryFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Alt Kategori" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Alt Kategoriler</SelectItem>
                {subCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Kategori" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Kategoriler</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={personFilter} onValueChange={setPersonFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Kişi" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Herkes</SelectItem>
                <SelectItem value="Ortak">Ortak</SelectItem>
                {household.members.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {/* Aktif tag filtresi banner */}
          {activeTag && (
            <div className="mb-3 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Etiket filtresi:</span>
              <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs font-medium">
                {activeTag}
                <button onClick={() => setActiveTag('')} className="hover:text-destructive">×</button>
              </span>
              <span className="text-muted-foreground text-xs">({filtered.length} işlem)</span>
            </div>
          )}
          {/* Tüm tag'ler (hızlı filtre) */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {allTags.slice(0, 20).map(tag => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? '' : tag)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    activeTag === tag
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:border-primary hover:text-primary'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 w-8">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 accent-primary cursor-pointer align-middle"
                      aria-label="Görünen tümünü seç"
                    />
                  </th>
                  <th className="pb-3 font-medium text-muted-foreground">
                    <button onClick={() => toggleSort('date')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Tarih <SortIcon column="date" />
                    </button>
                  </th>
                  <th className="pb-3 font-medium text-muted-foreground">
                    <button onClick={() => toggleSort('source')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Açıklama <SortIcon column="source" />
                    </button>
                  </th>
                  <th className="pb-3 font-medium text-muted-foreground">Etiketler</th>
                  <th className="pb-3 font-medium text-muted-foreground">
                    <button onClick={() => toggleSort('category')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Kategori <SortIcon column="category" />
                    </button>
                  </th>
                  <th className="pb-3 font-medium text-muted-foreground text-right">
                    <button onClick={() => toggleSort('amount')} className="ml-auto flex items-center gap-1 hover:text-foreground transition-colors">
                      Tutar <SortIcon column="amount" />
                    </button>
                  </th>
                  <th className="pb-3 font-medium text-muted-foreground text-right w-12"></th>
                </tr>
              </thead>
              <tbody>
                {sortedFiltered.map((tx, i) => {
                  const date = new Date(tx.date)
                  const dateStr = isNaN(date.getTime()) ? '-' : date.toLocaleDateString('tr-TR')
                  const effectiveTags = getEffectiveTags(tx)
                  const key = txKey(tx)
                  const isSel = selected.has(key)
                  return (
                    <tr
                      key={i}
                      className={`border-b last:border-0 cursor-pointer ${
                        isSel ? 'bg-primary/10 hover:bg-primary/15'
                        : tx.is_savings ? 'bg-sky-50/50 hover:bg-gray-50'
                        : tx.is_internal ? 'bg-amber-50/40 hover:bg-gray-50'
                        : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setEditTx(tx)}
                    >
                      <td className="py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelect(key)}
                          className="h-4 w-4 accent-primary cursor-pointer align-middle"
                          aria-label="İşlemi seç"
                        />
                      </td>
                      <td className="py-3 text-muted-foreground whitespace-nowrap">{dateStr}</td>
                      <td className="py-3 font-medium max-w-[260px]">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{tx.source}</span>
                          {tx.is_savings && (
                            <Badge variant="outline" className="text-[10px] border-sky-400 text-sky-700 bg-sky-50 whitespace-nowrap">
                              birikim
                            </Badge>
                          )}
                          {tx.is_internal && (
                            <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 bg-amber-50 whitespace-nowrap">
                              internal
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1" onClick={e => e.stopPropagation()}>
                          {effectiveTags.slice(0, 3).map(tag => (
                            <button
                              key={tag}
                              onClick={() => setActiveTag(activeTag === tag ? '' : tag)}
                              className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                                activeTag === tag
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'border-border hover:border-primary hover:text-primary'
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                          {effectiveTags.length > 3 && (
                            <span className="text-xs text-muted-foreground">+{effectiveTags.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3"><Badge variant="secondary" className="text-xs">{tx.category || '—'}</Badge></td>
                      <td className={`py-3 text-right font-medium whitespace-nowrap ${tx.is_savings ? 'text-sky-600' : tx.is_internal ? 'text-muted-foreground' : (tx.type === 'income' ? 'text-green-600' : 'text-red-600')}`}>
                        {tx.type === 'income' ? '+' : ''}{formatCurrency(tx.amount)}
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => handleDelete(tx, e)}
                          aria-label="İşlemi sil"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Filtrelere uygun işlem bulunamadı</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Yüzen toplu işlem çubuğu — viewport'a sabit, listede kaybolmaz */}
      {selected.size > 0 && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[88px] lg:bottom-8 z-50 flex items-center gap-2 rounded-full border bg-background/95 backdrop-blur shadow-xl px-3 py-2 max-w-[calc(100vw-1rem)]">
          <span className="text-sm font-medium pl-2 pr-1 whitespace-nowrap">{selected.size} seçili</span>
          <Button size="sm" onClick={() => setBulkKeys(Array.from(selected))} className="whitespace-nowrap">
            <Pencil className="h-4 w-4 mr-1.5" /> Toplu Düzenle
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/30 hover:bg-destructive/10 whitespace-nowrap"
            onClick={handleBulkDelete}
          >
            <Trash2 className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">Sil</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection} aria-label="Seçimi temizle">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* İşlem düzenleme paneli */}
      <TransactionEditSheet
        key={editTx ? txKey(editTx) : 'none'}
        transaction={editTx}
        onClose={() => setEditTx(null)}
      />

      {/* Toplu düzenleme paneli */}
      <TransactionBulkEditSheet
        key={bulkKeys ? `bulk-${bulkKeys.length}-${bulkKeys[0] ?? ''}` : 'bulk-none'}
        keys={bulkKeys}
        onClose={() => setBulkKeys(null)}
        onApplied={clearSelection}
      />

      {/* Kurallar paneli */}
      <TransactionRulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  )
}
