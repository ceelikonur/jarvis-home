import { create } from 'zustand'

export interface Tag {
  id?: number
  name: string
  color: string
}

interface TagsState {
  tags: Tag[]
  isLoaded: boolean
  loadFromDB: () => Promise<void>
  addTag: (tag: Tag) => Promise<void>
  updateTag: (id: number, updates: { name?: string; color?: string }) => Promise<void>
  deleteTag: (id: number) => Promise<void>
}

export const useTagsStore = create<TagsState>()((set, get) => ({
  tags: [],
  isLoaded: false,

  loadFromDB: async () => {
    if (get().isLoaded) return
    try {
      const res = await fetch('/api/budget/tags')
      if (!res.ok) return
      const { tags } = await res.json()
      set({ tags, isLoaded: true })
    } catch {
      set({ isLoaded: true })
    }
  },

  addTag: async (tag) => {
    try {
      const res = await fetch('/api/budget/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tag),
      })
      if (res.ok) {
        const { tag: created } = await res.json()
        set(state => ({ tags: [...state.tags, created].sort((a, b) => a.name.localeCompare(b.name)) }))
      }
    } catch { /* silent */ }
  },

  updateTag: async (id, updates) => {
    set(state => ({
      tags: state.tags
        .map(t => t.id === id ? { ...t, ...updates } : t)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    try {
      await fetch(`/api/budget/tags/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
    } catch { /* optimistic */ }
  },

  deleteTag: async (id) => {
    set(state => ({ tags: state.tags.filter(t => t.id !== id) }))
    try {
      await fetch(`/api/budget/tags/${id}`, { method: 'DELETE' })
    } catch { /* optimistic */ }
  },
}))
