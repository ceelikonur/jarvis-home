import { create } from 'zustand'

export interface Rule {
  id?: number
  name: string
  enabled: boolean
  match_source: string | null
  match_amount: number | null
  match_person: string | null
  match_type: 'income' | 'expense' | null
  set_category: string | null
  set_tag: string | null
  priority: number
}

interface RulesState {
  rules: Rule[]
  isLoaded: boolean
  loadFromDB: () => Promise<void>
  addRule: (rule: Partial<Rule>) => Promise<void>
  updateRule: (id: number, updates: Partial<Rule>) => Promise<void>
  deleteRule: (id: number) => Promise<void>
  applyAll: () => Promise<{ updated: number; rules: number }>
}

export const useRulesStore = create<RulesState>()((set, get) => ({
  rules: [],
  isLoaded: false,

  loadFromDB: async () => {
    try {
      const res = await fetch('/api/budget/rules')
      if (!res.ok) return
      const { rules } = await res.json() as { rules: Rule[] }
      set({ rules, isLoaded: true })
    } catch {
      set({ isLoaded: true })
    }
  },

  addRule: async (rule) => {
    const res = await fetch('/api/budget/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    })
    if (!res.ok) throw new Error('Kural eklenemedi')
    const { rule: created } = await res.json() as { rule: Rule }
    set(state => ({ rules: [...state.rules, created].sort((a, b) => a.priority - b.priority) }))
  },

  updateRule: async (id, updates) => {
    // Optimistic
    set(state => ({ rules: state.rules.map(r => r.id === id ? { ...r, ...updates } : r) }))
    const res = await fetch(`/api/budget/rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) throw new Error('Kural güncellenemedi')
    const { rule } = await res.json() as { rule: Rule }
    set(state => ({ rules: state.rules.map(r => r.id === id ? rule : r) }))
  },

  deleteRule: async (id) => {
    set(state => ({ rules: state.rules.filter(r => r.id !== id) }))
    await fetch(`/api/budget/rules/${id}`, { method: 'DELETE' })
  },

  applyAll: async () => {
    const res = await fetch('/api/budget/rules/apply', { method: 'POST' })
    if (!res.ok) throw new Error('Kurallar uygulanamadı')
    return await res.json() as { updated: number; rules: number }
  },
}))
