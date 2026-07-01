'use client'

import { useState } from 'react'
import { CategoryBreakdown } from '@/components/analysis/category-breakdown'
import { CategoryDetail } from '@/components/analysis/category-detail'
import { CategoryTrend } from '@/components/analysis/category-trend'
import { TopExpenses } from '@/components/analysis/top-expenses'
import { SubCategoryChart } from '@/components/analysis/sub-category-chart'
import { useBudgetStore } from '@/lib/stores/budget-store'

export default function AnalysisPage() {
  const { isLoaded } = useBudgetStore()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  if (!isLoaded) {
    return <div className="text-muted-foreground">Önce Excel dosyanızı yükleyin.</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Harcama Analizi</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategoryBreakdown selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />
        <CategoryDetail selectedCategory={selectedCategory} />
        <SubCategoryChart />
        <TopExpenses />
      </div>
      <CategoryTrend selectedCategory={selectedCategory} />
    </div>
  )
}
