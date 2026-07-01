'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBudgetStore } from '@/lib/stores/budget-store'

export default function LoadTestPage() {
  const [status, setStatus] = useState('Yükleniyor...')
  const { setBudgetData } = useBudgetStore()
  const router = useRouter()

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/load-test-data')
        if (!res.ok) throw new Error('API hatası')
        const data = await res.json()
        setBudgetData(data)
        setStatus(`${data.transactions.length} işlem yüklendi! Yönlendiriliyor...`)
        setTimeout(() => router.push('/'), 1500)
      } catch (err) {
        setStatus('Hata: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'))
      }
    }
    loadData()
  }, [setBudgetData, router])

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-lg">{status}</p>
    </div>
  )
}
