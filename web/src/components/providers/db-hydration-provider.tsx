'use client'

import { useEffect } from 'react'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useCategoriesStore } from '@/lib/stores/categories-store'
import { useHouseholdStore } from '@/lib/stores/household-store'

/**
 * Uygulama açıldığında SQLite DB'den verileri Zustand store'larına yükler.
 * Layout'a sarılır, tek seferlik çalışır. Household config ÖNCE yüklenir ki
 * para birimi/maaş tespiti gibi util'ler doğru değerlerle render etsin.
 */
export function DBHydrationProvider({ children }: { children: React.ReactNode }) {
  const loadHousehold = useHouseholdStore(s => s.load)
  const loadTransactions = useBudgetStore(s => s.loadFromDB)
  const loadCategories = useCategoriesStore(s => s.loadFromDB)

  useEffect(() => {
    loadHousehold().finally(() => {
      loadTransactions()
      loadCategories()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{children}</>
}
