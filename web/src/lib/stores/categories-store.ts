import { create } from 'zustand'
import { BUDGET_CATEGORIES } from '@/lib/utils/constants'

export interface Category {
  id?: number
  name: string
  color: string
  is_fixed: boolean
}

interface CategoriesState {
  categories: Category[]
  isLoaded: boolean
  loadFromDB: () => Promise<void>
  addCategory: (cat: Category) => Promise<void>
  updateCategory: (name: string, updates: { newName?: string; color?: string; is_fixed?: boolean }) => Promise<void>
  deleteCategory: (name: string) => Promise<void>
  resetToDefaults: () => Promise<void>
}

const DEFAULT_CATEGORIES: Category[] = BUDGET_CATEGORIES.map(c => ({
  name: c.name,
  color: c.color,
  is_fixed: c.is_fixed,
}))

export const useCategoriesStore = create<CategoriesState>()((set, get) => ({
  categories: DEFAULT_CATEGORIES,
  isLoaded: false,

  loadFromDB: async () => {
    if (get().isLoaded) return
    try {
      const res = await fetch('/api/budget/categories')
      if (!res.ok) return
      const { categories } = await res.json()
      // SQLite is_fixed'i 0/1 integer döner; boolean'a çevir ki {is_fixed && ...}
      // render guard'ları ekranda "0" basmasın.
      const normalized = (categories as Category[]).map(c => ({ ...c, is_fixed: !!c.is_fixed }))
      set({ categories: normalized, isLoaded: true })
    } catch {
      set({ isLoaded: true }) // fallback: keep defaults
    }
  },

  addCategory: async (cat) => {
    try {
      const res = await fetch('/api/budget/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cat),
      })
      if (res.ok) {
        const { category } = await res.json()
        set(state => ({ categories: [...state.categories, { ...category, is_fixed: !!category.is_fixed }] }))
      }
    } catch {
      set(state => ({ categories: [...state.categories, cat] }))
    }
  },

  updateCategory: async (name, updates) => {
    const existing = get().categories.find(c => c.name === name)
    if (!existing) return
    const updated = {
      name: updates.newName ?? existing.name,
      color: updates.color ?? existing.color,
      is_fixed: updates.is_fixed ?? existing.is_fixed,
    }
    // Optimistic update
    set(state => ({
      categories: state.categories.map(c => c.name === name ? { ...c, ...updated } : c),
    }))
    if (existing.id) {
      try {
        await fetch(`/api/budget/categories/${existing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        })
      } catch { /* keep optimistic update */ }
    }
  },

  deleteCategory: async (name) => {
    const existing = get().categories.find(c => c.name === name)
    set(state => ({ categories: state.categories.filter(c => c.name !== name) }))
    if (existing?.id) {
      try {
        await fetch(`/api/budget/categories/${existing.id}`, { method: 'DELETE' })
      } catch { /* keep optimistic delete */ }
    }
  },

  resetToDefaults: async () => {
    // Delete all existing, re-create defaults
    const existing = get().categories
    for (const cat of existing) {
      if (cat.id) {
        try {
          await fetch(`/api/budget/categories/${cat.id}`, { method: 'DELETE' })
        } catch { /* ignore */ }
      }
    }
    set({ categories: [] })
    for (const cat of DEFAULT_CATEGORIES) {
      await get().addCategory(cat)
    }
  },
}))
