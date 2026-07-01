import { create } from 'zustand'
import type { BudgetData, Transaction, MonthlyBudget, WishlistItem, Installment } from '@/lib/types/budget'
import { detectPayPeriods, isInPeriod } from '@/lib/utils/periods'
import type { PayPeriod } from '@/lib/utils/periods'
import { merchantStem } from '@/lib/utils/merchant'

const txKeyOf = (t: Transaction) => `${new Date(t.date).toISOString().slice(0, 10)}|${t.source}|${t.amount}`

interface BudgetState {
  transactions: Transaction[]
  monthlyBudgets: MonthlyBudget[]
  wishlist: WishlistItem[]
  installments: Installment[]
  isLoaded: boolean
  lastUploadDate: string | null
  setBudgetData: (data: BudgetData) => Promise<void>
  loadFromDB: () => Promise<void>
  reloadTransactions: () => Promise<void>
  clear: () => void
  deleteAllTransactions: () => Promise<number>
  deleteTransaction: (key: string) => Promise<void>
  getMonthTransactions: (month: string) => Transaction[]
  getMonthBudget: (month: string) => MonthlyBudget | undefined
  getPayPeriods: () => PayPeriod[]
  getPayPeriodTransactions: (period: PayPeriod) => Transaction[]
  getCategoryTotals: (filter?: string | PayPeriod) => { category: string; total: number; count: number }[]
  getSubCategoryTotals: (filter?: string | PayPeriod) => { subCategory: string; total: number; count: number }[]
  getPersonTotals: (filter?: string | PayPeriod) => { person: string; total: number; count: number }[]
  getTotalIncome: (filter?: string | PayPeriod) => number
  getTotalExpense: (filter?: string | PayPeriod) => number
  getTotalSavings: (filter?: string | PayPeriod) => number
  getMonths: () => string[]
  updateTransactionCategory: (key: string, category: string, subCategory?: string) => Promise<void>
  updateTransactionTags: (key: string, tags: string[]) => Promise<void>
  getSimilarTransactions: (source: string) => Transaction[]
  saveTransactionEdit: (args: { key: string; source: string; category: string; tags: string[]; applyToSimilar: boolean }) => Promise<{ updated: number }>
  bulkUpdateTransactions: (keys: string[], updates: { category?: string; tags?: string[]; tagsMode?: 'replace' | 'append' }) => Promise<{ updated: number }>
  updateTransactionInstallment: (key: string, installmentId: number | null) => Promise<void>
  getAllTags: () => string[]
  getTagTotals: (filter?: string | PayPeriod) => { tag: string; total: number; count: number }[]
  getCategoryMerchantTotals: (category: string, filter?: string | PayPeriod) => { merchant: string; total: number; count: number }[]
  getCategoryTagTotals: (category: string, filter?: string | PayPeriod) => { tag: string; total: number; count: number }[]
  getCategoriesPeriodSeries: () => { period: string; sort: number; totals: Record<string, number> }[]
}

// Internal transfers (Şewi ↔ Onur) and savings transfers (Intesa) are both
// excluded from expense/income totals. They remain visible in the list.
const excludeExcluded = (txs: Transaction[]) => txs.filter(t => !t.is_internal && !t.is_savings)

export const useBudgetStore = create<BudgetState>()((set, get) => ({
  transactions: [],
  monthlyBudgets: [],
  wishlist: [],
  installments: [],
  isLoaded: false,
  lastUploadDate: null,

  setBudgetData: async (data: BudgetData) => {
    const transactions = data.transactions.map(t => ({
      ...t,
      date: new Date(t.date),
    }))

    set({
      transactions,
      monthlyBudgets: data.monthlyBudgets,
      wishlist: data.wishlist,
      installments: data.installments,
      isLoaded: true,
      lastUploadDate: new Date().toISOString(),
    })

    // DB'ye async upsert (arka planda) — backend internal flag'i yeniden hesaplayacak
    try {
      await fetch('/api/budget/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions }),
      })
    } catch (err) {
      console.warn('[budget-store] DB sync failed:', err)
    }
  },

  loadFromDB: async () => {
    if (get().isLoaded) return
    try {
      const res = await fetch('/api/budget/transactions')
      if (!res.ok) return
      const { transactions } = await res.json() as { transactions: Transaction[] }
      if (transactions.length > 0) {
        set({
          transactions: transactions.map(t => ({ ...t, date: new Date(t.date) })),
          isLoaded: true,
          lastUploadDate: null,
        })
      }
    } catch (err) {
      console.warn('[budget-store] DB load failed:', err)
    }
  },

  // Guard'sız yeniden yükleme — kurallar/backfill sonrası DB'den taze çek
  reloadTransactions: async () => {
    try {
      const res = await fetch('/api/budget/transactions')
      if (!res.ok) return
      const { transactions } = await res.json() as { transactions: Transaction[] }
      set({ transactions: transactions.map(t => ({ ...t, date: new Date(t.date) })), isLoaded: true })
    } catch (err) {
      console.warn('[budget-store] reload failed:', err)
    }
  },

  clear: () => set({
    transactions: [],
    monthlyBudgets: [],
    wishlist: [],
    installments: [],
    isLoaded: false,
    lastUploadDate: null,
  }),

  deleteAllTransactions: async () => {
    try {
      const res = await fetch('/api/budget/transactions', { method: 'DELETE' })
      if (!res.ok) throw new Error('Sunucu hatası')
      const { deleted } = await res.json() as { deleted: number }
      set({
        transactions: [],
        monthlyBudgets: [],
        wishlist: [],
        installments: [],
        isLoaded: false,
        lastUploadDate: null,
      })
      return deleted || 0
    } catch (err) {
      console.warn('[budget-store] deleteAll failed:', err)
      throw err
    }
  },

  deleteTransaction: async (key: string) => {
    // Optimistic: remove from state first
    set(state => ({
      transactions: state.transactions.filter(t => {
        const tKey = `${new Date(t.date).toISOString().slice(0,10)}|${t.source}|${t.amount}`
        return tKey !== key
      })
    }))
    try {
      await fetch(`/api/budget/transactions/${encodeURIComponent(key)}`, { method: 'DELETE' })
    } catch (err) {
      console.warn('[budget-store] delete sync failed:', err)
    }
  },

  getMonthTransactions: (month: string) => {
    return get().transactions.filter(t => t.month.toUpperCase() === month.toUpperCase())
  },

  getMonthBudget: (month: string) => {
    return get().monthlyBudgets.find(b => b.month.toUpperCase() === month.toUpperCase())
  },

  getPayPeriods: () => {
    return detectPayPeriods(get().transactions)
  },

  getPayPeriodTransactions: (period: PayPeriod) => {
    return get().transactions.filter(t => isInPeriod(new Date(t.date), period))
  },

  getCategoryTotals: (filter?: string | PayPeriod) => {
    let txs = excludeExcluded(get().transactions).filter(t => t.type === 'expense')
    if (filter) {
      if (typeof filter === 'string') txs = txs.filter(t => t.month.toUpperCase() === filter.toUpperCase())
      else txs = txs.filter(t => isInPeriod(new Date(t.date), filter))
    }
    const map = new Map<string, { total: number; count: number }>()
    txs.forEach(t => {
      const cat = t.category || 'Diğer'
      const existing = map.get(cat) || { total: 0, count: 0 }
      map.set(cat, { total: existing.total + Math.abs(t.amount), count: existing.count + 1 })
    })
    return Array.from(map, ([category, v]) => ({ category, ...v })).sort((a, b) => b.total - a.total)
  },

  getSubCategoryTotals: (filter?: string | PayPeriod) => {
    let txs = excludeExcluded(get().transactions).filter(t => t.type === 'expense')
    if (filter) {
      if (typeof filter === 'string') txs = txs.filter(t => t.month.toUpperCase() === filter.toUpperCase())
      else txs = txs.filter(t => isInPeriod(new Date(t.date), filter))
    }
    const map = new Map<string, { total: number; count: number }>()
    txs.forEach(t => {
      const sub = t.subCategory || 'DİĞER'
      const existing = map.get(sub) || { total: 0, count: 0 }
      map.set(sub, { total: existing.total + Math.abs(t.amount), count: existing.count + 1 })
    })
    return Array.from(map, ([subCategory, v]) => ({ subCategory, ...v })).sort((a, b) => b.total - a.total)
  },

  getPersonTotals: (filter?: string | PayPeriod) => {
    let txs = excludeExcluded(get().transactions).filter(t => t.type === 'expense')
    if (filter) {
      if (typeof filter === 'string') txs = txs.filter(t => t.month.toUpperCase() === filter.toUpperCase())
      else txs = txs.filter(t => isInPeriod(new Date(t.date), filter))
    }
    const map = new Map<string, { total: number; count: number }>()
    txs.forEach(t => {
      const person = t.person || 'Ortak'
      const existing = map.get(person) || { total: 0, count: 0 }
      map.set(person, { total: existing.total + Math.abs(t.amount), count: existing.count + 1 })
    })
    return Array.from(map, ([person, v]) => ({ person, ...v })).sort((a, b) => b.total - a.total)
  },

  getTotalIncome: (filter?: string | PayPeriod) => {
    let txs = excludeExcluded(get().transactions).filter(t => t.type === 'income')
    if (filter) {
      if (typeof filter === 'string') txs = txs.filter(t => t.month.toUpperCase() === filter.toUpperCase())
      else txs = txs.filter(t => isInPeriod(new Date(t.date), filter))
    }
    return txs.reduce((sum, t) => sum + t.amount, 0)
  },

  getTotalExpense: (filter?: string | PayPeriod) => {
    let txs = excludeExcluded(get().transactions).filter(t => t.type === 'expense')
    if (filter) {
      if (typeof filter === 'string') txs = txs.filter(t => t.month.toUpperCase() === filter.toUpperCase())
      else txs = txs.filter(t => isInPeriod(new Date(t.date), filter))
    }
    return txs.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  },

  // Net birikim: Intesa'ya gönderilen − Intesa'dan gelen.
  // Nihayetinde Intesa bakiyesindeki para bizim birikimimiz; oradan cari hesaba
  // dönen para birikimi azaltır.
  getTotalSavings: (filter?: string | PayPeriod) => {
    let txs = get().transactions.filter(t => t.is_savings)
    if (filter) {
      if (typeof filter === 'string') txs = txs.filter(t => t.month.toUpperCase() === filter.toUpperCase())
      else txs = txs.filter(t => isInPeriod(new Date(t.date), filter))
    }
    return txs.reduce((sum, t) => {
      const abs = Math.abs(t.amount)
      return sum + (t.type === 'expense' ? abs : -abs)
    }, 0)
  },

  getMonths: () => {
    const months = new Set(get().transactions.map(t => t.month))
    const order = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
    return Array.from(months).sort((a, b) => order.indexOf(a) - order.indexOf(b))
  },

  updateTransactionCategory: async (key: string, category: string, subCategory?: string) => {
    // Optimistic state update
    set(state => ({
      transactions: state.transactions.map(t => {
        const tKey = `${new Date(t.date).toISOString().slice(0,10)}|${t.source}|${t.amount}`
        if (tKey !== key) return t
        return { ...t, category, ...(subCategory !== undefined ? { subCategory } : {}) }
      })
    }))
    const res = await fetch(`/api/budget/transactions/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Kategori kaydedilemedi (${res.status}) ${body}`)
    }
  },

  updateTransactionTags: async (key: string, tags: string[]) => {
    set(state => ({
      transactions: state.transactions.map(t => {
        const tKey = `${new Date(t.date).toISOString().slice(0,10)}|${t.source}|${t.amount}`
        if (tKey !== key) return t
        return { ...t, tags }
      })
    }))
    const res = await fetch(`/api/budget/transactions/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Etiket kaydedilemedi (${res.status}) ${body}`)
    }
  },

  // Aynı satıcının (source baş kelimesi) tüm işlemleri — geçmişe dönük düzenleme önizlemesi için
  getSimilarTransactions: (source: string) => {
    const stem = merchantStem(source)
    if (!stem) return []
    return get().transactions.filter(t => merchantStem(t.source) === stem)
  },

  // Kategori + etiketi tek seferde kaydet. applyToSimilar=true ise aynı satıcının
  // TÜM işlemlerine geçmişe dönük uygular. Returns: kaç işlemin güncellendiği.
  saveTransactionEdit: async ({ key, source, category, tags, applyToSimilar }) => {
    const stem = merchantStem(source)
    // Optimistic: hedef işlem(ler)i state'te güncelle
    set(state => ({
      transactions: state.transactions.map(t => {
        const isTarget = applyToSimilar
          ? (!!stem && merchantStem(t.source) === stem)
          : txKeyOf(t) === key
        return isTarget ? { ...t, category, tags } : t
      }),
    }))
    const res = await fetch(`/api/budget/transactions/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, tags, applyToSimilar }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Kaydedilemedi (${res.status}) ${body}`)
    }
    const data = (await res.json().catch(() => ({}))) as { updated?: number; matched?: number }
    const fallback = applyToSimilar ? get().getSimilarTransactions(source).length : 1
    return { updated: data.updated ?? fallback }
  },

  // Seçili işlemleri (keys) toplu güncelle. category ve/veya tags set edilebilir.
  // tagsMode 'append' → mevcut etiketlere ekler; 'replace' (varsayılan) → değiştirir.
  bulkUpdateTransactions: async (keys, updates) => {
    const keySet = new Set(keys)
    const append = updates.tagsMode === 'append'
    // Optimistic state update
    set(state => ({
      transactions: state.transactions.map(t => {
        if (!keySet.has(txKeyOf(t))) return t
        const next = { ...t }
        if (updates.category) next.category = updates.category
        if (updates.tags) {
          next.tags = append
            ? Array.from(new Set([...(t.tags || []), ...updates.tags]))
            : updates.tags
        }
        return next
      }),
    }))
    const res = await fetch('/api/budget/transactions/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys, category: updates.category, tags: updates.tags, tagsMode: updates.tagsMode }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Toplu güncelleme başarısız (${res.status}) ${body}`)
    }
    const data = (await res.json().catch(() => ({}))) as { updated?: number }
    return { updated: data.updated ?? keys.length }
  },

  // Tek işlemi bir taksite bağla/çöz (installment_id). Satıcıya yayılmaz.
  updateTransactionInstallment: async (key: string, installmentId: number | null) => {
    set(state => ({
      transactions: state.transactions.map(t =>
        txKeyOf(t) === key ? { ...t, installment_id: installmentId } : t),
    }))
    const res = await fetch(`/api/budget/transactions/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installment_id: installmentId }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Taksit bağlanamadı (${res.status}) ${body}`)
    }
  },

  getAllTags: () => {
    const tagSet = new Set<string>()
    get().transactions.forEach(t => {
      if (t.tags && t.tags.length > 0) {
        t.tags.forEach(tag => tagSet.add(tag))
      } else if (t.subCategory) {
        tagSet.add(t.subCategory)
      }
    })
    return Array.from(tagSet).sort()
  },

  getTagTotals: (filter?: string | PayPeriod) => {
    let txs = excludeExcluded(get().transactions).filter(t => t.type === 'expense')
    if (filter) {
      if (typeof filter === 'string') txs = txs.filter(t => t.month.toUpperCase() === filter.toUpperCase())
      else txs = txs.filter(t => isInPeriod(new Date(t.date), filter))
    }
    const map = new Map<string, { total: number; count: number }>()
    txs.forEach(t => {
      const effectiveTags = (t.tags && t.tags.length > 0) ? t.tags : (t.subCategory ? [t.subCategory] : ['DİĞER'])
      effectiveTags.forEach(tag => {
        const existing = map.get(tag) || { total: 0, count: 0 }
        map.set(tag, { total: existing.total + Math.abs(t.amount), count: existing.count + 1 })
      })
    })
    return Array.from(map, ([tag, v]) => ({ tag, ...v })).sort((a, b) => b.total - a.total)
  },

  // Bir kategorinin satıcı (merchant stem) kırılımı — drill-down için
  getCategoryMerchantTotals: (category: string, filter?: string | PayPeriod) => {
    let txs = excludeExcluded(get().transactions).filter(t => t.type === 'expense' && t.category === category)
    if (filter) {
      if (typeof filter === 'string') txs = txs.filter(t => t.month.toUpperCase() === filter.toUpperCase())
      else txs = txs.filter(t => isInPeriod(new Date(t.date), filter))
    }
    const map = new Map<string, { total: number; count: number }>()
    txs.forEach(t => {
      const m = merchantStem(t.source) || (t.source || 'Diğer')
      const existing = map.get(m) || { total: 0, count: 0 }
      map.set(m, { total: existing.total + Math.abs(t.amount), count: existing.count + 1 })
    })
    return Array.from(map, ([merchant, v]) => ({ merchant, ...v })).sort((a, b) => b.total - a.total)
  },

  // Bir kategorinin etiket (alt-kategori) kırılımı — drill-down için
  getCategoryTagTotals: (category: string, filter?: string | PayPeriod) => {
    let txs = excludeExcluded(get().transactions).filter(t => t.type === 'expense' && t.category === category)
    if (filter) {
      if (typeof filter === 'string') txs = txs.filter(t => t.month.toUpperCase() === filter.toUpperCase())
      else txs = txs.filter(t => isInPeriod(new Date(t.date), filter))
    }
    const map = new Map<string, { total: number; count: number }>()
    txs.forEach(t => {
      const tags = (t.tags && t.tags.length > 0) ? t.tags : (t.subCategory ? [t.subCategory] : ['DİĞER'])
      tags.forEach(tag => {
        const existing = map.get(tag) || { total: 0, count: 0 }
        map.set(tag, { total: existing.total + Math.abs(t.amount), count: existing.count + 1 })
      })
    })
    return Array.from(map, ([tag, v]) => ({ tag, ...v })).sort((a, b) => b.total - a.total)
  },

  // Tüm kategorilerin maaş-dönemi serisi (her dönem için kategori→tutar) — trend için
  getCategoriesPeriodSeries: () => {
    const periods = detectPayPeriods(get().transactions)
    if (periods.length === 0) return []
    const txs = excludeExcluded(get().transactions).filter(t => t.type === 'expense' && t.category && t.category !== 'Gelir')
    return periods.map(p => {
      const totals: Record<string, number> = {}
      txs.forEach(t => {
        if (isInPeriod(new Date(t.date), p)) {
          totals[t.category] = (totals[t.category] || 0) + Math.abs(t.amount)
        }
      })
      return { period: p.shortLabel, sort: p.index, totals }
    })
  },
}))
