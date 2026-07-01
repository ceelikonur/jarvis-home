'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  TrendingUp, TrendingDown, AlertTriangle, Sparkles, RefreshCw,
  Repeat, Target, Activity, Minus, Brain,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils/currency'

// ─── Types ──────────────────────────────────────────────────────────

interface CategoryForecast {
  category: string
  forecast: number
  low: number
  high: number
  confidence: 'high' | 'medium' | 'low' | 'none'
  method: string
  samples: number
  stdDev: number
  lastMonthAmount: number
  history: { month: string; label: string; amount: number }[]
}

interface ForecastData {
  targetMonth: string
  targetMonthLabel: string
  historicalMonths: number
  forecasts: CategoryForecast[]
}

interface RecurringItem {
  key: string
  sampleSource: string
  category: string
  monthsActive: number
  avgAmount: number
  stdDev: number
  consistency: 'high' | 'medium' | 'user-confirmed'
  lastSeen: string
  userOverride?: 'whitelist' | null
}

interface AnomalyItem {
  date: string
  source: string
  amount: number
  category: string
  zScore: number
  categoryMean: number
  severity: 'high' | 'medium'
}

interface TrendItem {
  category: string
  lastValue: number
  prevAvg: number
  changePct: number
  absChange: number
  direction: 'up' | 'down' | 'flat'
}

interface SavingsData {
  incomeForecast: number
  expenseForecast: number
  expectedNet: number
  rawNet: number
  historicalAvgSavings: number
  isDeficit: boolean
  warning: { type: string; message: string; reductionTarget?: number } | null
  suggestions: {
    conservative: { amount: number; label: string; description: string }
    realistic: { amount: number; label: string; description: string }
    ambitious: { amount: number; label: string; description: string }
  }
}

interface ActionItem {
  type: string
  priority: 'high' | 'medium' | 'low'
  category?: string
  title: string
  description: string
  suggestion: string
  impact: number
}

interface AccuracyData {
  hasData: boolean
  message?: string
  totalForecasts?: number
  overallAccuracy?: number
  meanAbsError?: number
  categoryStats?: { category: string; count: number; meanAbsError: number; avgForecast: number; avgActual: number }[]
  monthStats?: { month: string; count: number; meanAbsError: number }[]
}

interface DashboardData {
  forecast: ForecastData
  recurring: RecurringItem[]
  anomalies: AnomalyItem[]
  trends: TrendItem[]
  savings: SavingsData
  actions: ActionItem[]
  accuracy: AccuracyData
  meta: { monthsAnalyzed: number; generatedAt: string }
}

interface AIInsight {
  actionIndex: number
  analysis: string
  recommendation: string
}

interface AIInsightsData {
  summary: string
  insights: AIInsight[]
}

// ─── Helpers ────────────────────────────────────────────────────────

const confidenceColor = (c: string) =>
  c === 'high' ? 'bg-green-100 text-green-700 border-green-200'
  : c === 'medium' ? 'bg-amber-100 text-amber-700 border-amber-200'
  : 'bg-gray-100 text-gray-600 border-gray-200'

const priorityIcon = (p: string) =>
  p === 'high' ? '🔴' : p === 'medium' ? '🟡' : '🟢'

const actionTypeIcon = (type: string) => {
  switch (type) {
    case 'spending-up': return TrendingUp
    case 'spending-down': return TrendingDown
    case 'anomaly': return AlertTriangle
    case 'savings': return Target
    case 'recurring-info': return Repeat
    default: return Sparkles
  }
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function ForecastPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'forecasts'>('overview')

  // AI Insights state
  const [aiInsights, setAiInsights] = useState<AIInsightsData | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/forecast')
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Yüklenemedi')
      setData(json.data)
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }, [])

  const fetchAIInsights = useCallback(async () => {
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/forecast/insights', { method: 'POST' })
      const json = await res.json()
      if (!json.success) {
        if (json.fallback) {
          throw new Error('AI servisi şu an erişilemiyor. Ollama çalışıyor mu?')
        }
        throw new Error(json.error || 'AI analizi başarısız')
      }
      setAiInsights(json.data)
    } catch (err: any) {
      setAiError(err.message)
    }
    setAiLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Brain className="h-12 w-12 text-primary mx-auto animate-pulse" />
          <p className="text-muted-foreground">Tahmin motoru çalışıyor...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-600">{error}</p>
          <Button onClick={fetchData} variant="outline" size="sm" className="mt-3">Tekrar Dene</Button>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Brain className="h-5 w-5 sm:h-6 sm:w-6 text-primary" /> Tahminler
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {data.forecast.targetMonthLabel} için öngörü · {data.meta.monthsAnalyzed} dönem veri
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      {/* Tabs (mobile horizontal scroll) */}
      <div className="flex gap-1 border-b -mx-3 sm:mx-0 px-3 sm:px-0 overflow-x-auto scrollbar-hide">
        {([
          { id: 'overview', label: 'Genel', icon: Sparkles },
          { id: 'forecasts', label: 'Kategori Tahminleri', icon: Activity },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-3 py-2 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-3 w-3 sm:h-4 sm:w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <OverviewTab
          data={data}
          aiInsights={aiInsights}
          aiLoading={aiLoading}
          aiError={aiError}
          onRequestAI={fetchAIInsights}
        />
      )}

      {/* Tab: Forecasts */}
      {activeTab === 'forecasts' && <ForecastsTab forecasts={data.forecast.forecasts} />}
    </div>
  )
}

// ─── Tab: Overview ──────────────────────────────────────────────────

function OverviewTab({ data, aiInsights, aiLoading, aiError, onRequestAI }: {
  data: DashboardData
  aiInsights: AIInsightsData | null
  aiLoading: boolean
  aiError: string | null
  onRequestAI: () => void
}) {
  const { savings, actions } = data

  // Build a map of actionIndex → insight for quick lookup
  const insightMap = new Map<number, AIInsight>()
  if (aiInsights) {
    aiInsights.insights.forEach(i => insightMap.set(i.actionIndex, i))
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Savings Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h2 className="text-base sm:text-lg font-semibold">Birikim Hedefi · {data.forecast.targetMonthLabel}</h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4">
            <div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Tahmini Gelir</p>
              <p className="text-base sm:text-lg font-semibold text-green-600">{formatCurrency(savings.incomeForecast)}</p>
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Tahmini Gider</p>
              <p className="text-base sm:text-lg font-semibold text-red-600">{formatCurrency(savings.expenseForecast)}</p>
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Beklenen Net</p>
              <p className={`text-base sm:text-lg font-semibold ${savings.isDeficit ? 'text-red-600' : 'text-blue-600'}`}>
                {formatCurrency(savings.rawNet)}
              </p>
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Tarihsel Birikim</p>
              <p className="text-base sm:text-lg font-semibold">{formatCurrency(savings.historicalAvgSavings)}</p>
            </div>
          </div>

          {savings.warning ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 sm:p-4 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900">Açık beklenir</p>
                  <p className="text-xs text-red-700 mt-1">{savings.warning.message}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <SavingsCard data={savings.suggestions.conservative} accent="green" />
              <SavingsCard data={savings.suggestions.realistic} accent="blue" highlight />
              <SavingsCard data={savings.suggestions.ambitious} accent="purple" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Insights Section */}
      <AIInsightsPanel
        insights={aiInsights}
        loading={aiLoading}
        error={aiError}
        onRequest={onRequestAI}
      />

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {actions.slice(0, 6).map((action, i) => (
          <ActionCard key={i} action={action} aiInsight={insightMap.get(i)} />
        ))}
      </div>
    </div>
  )
}

function AIInsightsPanel({ insights, loading, error, onRequest }: {
  insights: AIInsightsData | null
  loading: boolean
  error: string | null
  onRequest: () => void
}) {
  if (insights) {
    return (
      <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center shrink-0">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-purple-700 mb-1">JARVIS Analizi</p>
              <p className="text-sm leading-relaxed text-gray-800">{insights.summary}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card className="border-purple-200 bg-purple-50/50">
        <CardContent className="p-4 sm:p-5 flex items-center gap-3">
          <Brain className="h-5 w-5 text-purple-600 animate-pulse" />
          <p className="text-sm text-purple-900">JARVIS analiz ediyor... (lokal LLM, biraz sürebilir)</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-3 sm:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs sm:text-sm text-amber-900 truncate">{error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={onRequest}>Tekrar Dene</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-dashed border-2 border-purple-300 bg-purple-50/30">
      <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Brain className="h-6 w-6 text-purple-600" />
          <div>
            <p className="text-sm font-semibold">JARVIS'ten derin analiz al</p>
            <p className="text-xs text-muted-foreground">Top aksiyonlar için sebep ve özel öneriler</p>
          </div>
        </div>
        <Button onClick={onRequest} className="w-full sm:w-auto">
          <Sparkles className="h-4 w-4 mr-1" />
          Analiz Başlat
        </Button>
      </CardContent>
    </Card>
  )
}

function SavingsCard({ data, accent, highlight }: {
  data: { amount: number; label: string; description: string }
  accent: 'green' | 'blue' | 'purple'
  highlight?: boolean
}) {
  const colors = {
    green: 'border-green-200 bg-green-50',
    blue: 'border-blue-300 bg-blue-50 ring-2 ring-blue-200',
    purple: 'border-purple-200 bg-purple-50',
  }
  const textColors = {
    green: 'text-green-800',
    blue: 'text-blue-800',
    purple: 'text-purple-800',
  }
  return (
    <div className={`rounded-lg border-2 p-3 ${colors[accent]} ${highlight ? 'sm:scale-105 sm:transform sm:transition' : ''}`}>
      <p className={`text-[10px] uppercase tracking-wider font-semibold ${textColors[accent]}`}>{data.label}</p>
      <p className="text-lg sm:text-xl font-bold mt-1">{formatCurrency(data.amount)}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{data.description}</p>
    </div>
  )
}

function ActionCard({ action, aiInsight }: { action: ActionItem; aiInsight?: AIInsight }) {
  const Icon = actionTypeIcon(action.type)
  const colors = {
    high: 'border-l-4 border-l-red-500',
    medium: 'border-l-4 border-l-amber-500',
    low: 'border-l-4 border-l-green-500',
  }
  return (
    <Card className={colors[action.priority]}>
      <CardContent className="p-3 sm:p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h3 className="text-sm font-semibold leading-tight">{action.title}</h3>
          </div>
          <Badge variant="outline" className="text-[10px] shrink-0">{priorityIcon(action.priority)}</Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{action.description}</p>
        <div className="flex items-start gap-2 pt-1 border-t">
          <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
          <p className="text-xs italic">{action.suggestion}</p>
        </div>

        {aiInsight && (
          <div className="pt-2 mt-2 border-t border-purple-200 bg-purple-50/40 -mx-3 sm:-mx-4 -mb-3 sm:-mb-4 px-3 sm:px-4 pb-3 sm:pb-4 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Brain className="h-3 w-3 text-purple-600" />
              <p className="text-[10px] uppercase tracking-wider font-semibold text-purple-700">JARVIS Yorumu</p>
            </div>
            <p className="text-xs leading-relaxed">
              <span className="font-medium text-gray-700">Sebep:</span> {aiInsight.analysis}
            </p>
            <p className="text-xs leading-relaxed">
              <span className="font-medium text-gray-700">Öneri:</span> {aiInsight.recommendation}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Tab: Forecasts ─────────────────────────────────────────────────

function ForecastsTab({ forecasts }: { forecasts: CategoryForecast[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left">
                <th className="p-3 font-medium text-muted-foreground">Kategori</th>
                <th className="p-3 font-medium text-muted-foreground text-right">Son Dönem</th>
                <th className="p-3 font-medium text-muted-foreground text-right">Tahmin</th>
                <th className="p-3 font-medium text-muted-foreground text-right hidden md:table-cell">Aralık</th>
                <th className="p-3 font-medium text-muted-foreground text-right hidden sm:table-cell">Güven</th>
              </tr>
            </thead>
            <tbody>
              {forecasts.map((f, i) => {
                const change = f.lastMonthAmount > 0
                  ? ((f.forecast - f.lastMonthAmount) / f.lastMonthAmount) * 100
                  : 0
                const ArrowIcon = change > 5 ? TrendingUp : change < -5 ? TrendingDown : Minus
                const arrowColor = change > 5 ? 'text-red-500' : change < -5 ? 'text-green-500' : 'text-gray-400'
                return (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="p-3 font-medium">{f.category}</td>
                    <td className="p-3 text-right text-muted-foreground">{formatCurrency(f.lastMonthAmount)}</td>
                    <td className="p-3 text-right font-semibold">
                      <div className="flex items-center justify-end gap-1.5">
                        <ArrowIcon className={`h-3.5 w-3.5 ${arrowColor}`} />
                        {formatCurrency(f.forecast)}
                      </div>
                    </td>
                    <td className="p-3 text-right text-xs text-muted-foreground hidden md:table-cell">
                      {formatCurrency(f.low)} – {formatCurrency(f.high)}
                    </td>
                    <td className="p-3 text-right hidden sm:table-cell">
                      <Badge variant="outline" className={`text-[10px] ${confidenceColor(f.confidence)}`}>
                        {f.confidence === 'high' ? 'Yüksek' : f.confidence === 'medium' ? 'Orta' : 'Düşük'}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {forecasts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Tahmin için yeterli veri yok</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
