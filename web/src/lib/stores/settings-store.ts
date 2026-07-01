import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  aiProvider: 'claude' | 'lmstudio'
  selectedPeriod: { year: number; month: number }
  selectedPayPeriodIndex: number | null   // null = show all / use month filter
  setAIProvider: (provider: 'claude' | 'lmstudio') => void
  setSelectedPeriod: (year: number, month: number) => void
  setSelectedPayPeriodIndex: (index: number | null) => void
}

const now = new Date()

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      aiProvider: 'claude',
      selectedPeriod: { year: now.getFullYear(), month: now.getMonth() + 1 },
      selectedPayPeriodIndex: null,
      setAIProvider: (provider) => set({ aiProvider: provider }),
      setSelectedPeriod: (year, month) => set({ selectedPeriod: { year, month } }),
      setSelectedPayPeriodIndex: (index) => set({ selectedPayPeriodIndex: index }),
    }),
    { name: 'budget-settings' }
  )
)
