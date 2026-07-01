import { create } from 'zustand'

export interface Installment {
  id?: number
  name: string
  total: number
  installmentCount: number
  monthlyAmount: number
  startDate: string | null   // 'YYYY-MM-DD' — ilk ödeme tarihi
  finalDate: string | null
  linkedCount?: number       // bağlı (gerçekleşen) ödeme sayısı
  linkedPaid?: number        // bağlı ödemelerin toplamı
}

interface InstallmentsState {
  installments: Installment[]
  isLoaded: boolean
  loadFromDB: () => Promise<void>
  reload: () => Promise<void>
  addInstallment: (data: Partial<Installment>) => Promise<void>
  updateInstallment: (id: number, data: Partial<Installment>) => Promise<void>
  deleteInstallment: (id: number) => Promise<void>
}

export const useInstallmentsStore = create<InstallmentsState>()((set) => ({
  installments: [],
  isLoaded: false,

  loadFromDB: async () => {
    try {
      const res = await fetch('/api/budget/installments')
      if (!res.ok) return
      const { items } = await res.json() as { items: Installment[] }
      set({ installments: items, isLoaded: true })
    } catch {
      set({ isLoaded: true })
    }
  },

  // Guard'sız — bağlama/değişiklik sonrası linkedCount tazelemek için
  reload: async () => {
    try {
      const res = await fetch('/api/budget/installments')
      if (!res.ok) return
      const { items } = await res.json() as { items: Installment[] }
      set({ installments: items, isLoaded: true })
    } catch { /* ignore */ }
  },

  addInstallment: async (data) => {
    const res = await fetch('/api/budget/installments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Taksit eklenemedi')
    const { item } = await res.json() as { item: Installment }
    set(state => ({ installments: [...state.installments, item] }))
  },

  updateInstallment: async (id, data) => {
    const res = await fetch(`/api/budget/installments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Taksit güncellenemedi')
    const { item } = await res.json() as { item: Installment }
    set(state => ({ installments: state.installments.map(i => i.id === id ? item : i) }))
  },

  deleteInstallment: async (id) => {
    set(state => ({ installments: state.installments.filter(i => i.id !== id) }))
    await fetch(`/api/budget/installments/${id}`, { method: 'DELETE' })
  },
}))
