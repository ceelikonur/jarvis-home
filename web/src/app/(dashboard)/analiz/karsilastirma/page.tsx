'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const mockData = [
  { name: 'Market', ocak: 3800, subat: 4200 },
  { name: 'Yeme-İçme', ocak: 2500, subat: 1800 },
  { name: 'Ulaşım', ocak: 1600, subat: 1800 },
  { name: 'Faturalar', ocak: 1900, subat: 2100 },
  { name: 'Eğlence', ocak: 900, subat: 800 },
]

export default function ComparisonPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Aylık Karşılaştırma</h1>
      <Card>
        <CardHeader>
          <CardTitle>Ocak vs Şubat 2026</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={mockData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(v) => `₺${(v / 1000).toFixed(0)}K`} />
              <Tooltip formatter={(value) => `₺${Number(value).toLocaleString('tr-TR')}`} />
              <Legend />
              <Bar dataKey="ocak" name="Ocak" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="subat" name="Şubat" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
