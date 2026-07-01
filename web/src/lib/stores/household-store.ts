import { create } from 'zustand'
import {
  DEFAULT_HOUSEHOLD,
  setHouseholdConfig,
  type HouseholdConfig,
} from '@/lib/config/household-config'

interface HouseholdState {
  config: HouseholdConfig
  isLoaded: boolean
  load: () => Promise<void>
}

/**
 * Loads the household configuration from the API once and mirrors it into the
 * synchronous module holder (setHouseholdConfig) so non-React utilities can
 * read it too. Falls back to neutral defaults if the request fails.
 */
export const useHouseholdStore = create<HouseholdState>()((set, get) => ({
  config: DEFAULT_HOUSEHOLD,
  isLoaded: false,

  load: async () => {
    if (get().isLoaded) return
    try {
      const res = await fetch('/api/budget/household')
      if (!res.ok) {
        set({ isLoaded: true })
        return
      }
      const data = await res.json()
      const config = setHouseholdConfig(data as Partial<HouseholdConfig>)
      set({ config, isLoaded: true })
    } catch {
      set({ isLoaded: true })
    }
  },
}))
