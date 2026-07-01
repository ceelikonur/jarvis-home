'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Calendar, CheckSquare, Repeat } from 'lucide-react'

interface UpcomingTask {
  id: number
  title: string
  due_date: string | null
  priority: string
  recurrence_days: number | null
}

interface UpcomingEvent {
  id: number
  title: string
  start_time: string
  end_time: string
}

interface UpcomingPayload {
  tasks: UpcomingTask[]
  events: UpcomingEvent[]
  windowDays: number
}

function daysUntil(dueStr: string | null): number | null {
  if (!dueStr) return null
  const due = new Date(`${dueStr.slice(0, 10)}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function relativeLabel(dueStr: string | null): string {
  const d = daysUntil(dueStr)
  if (d === null) return ''
  if (d < 0) return `${Math.abs(d)} gün gecikmiş`
  if (d === 0) return 'bugün'
  if (d === 1) return 'yarın'
  return `${d} gün sonra`
}

function recurrenceLabel(days: number): string {
  if (days === 7) return 'haftalık'
  if (days === 14) return '2 haftada bir'
  if (days === 30) return 'aylık'
  if (days === 45) return '1.5 ayda bir'
  if (days === 60) return '2 ayda bir'
  if (days === 90) return '3 ayda bir'
  if (days === 180) return '6 ayda bir'
  if (days === 365) return 'yıllık'
  return `her ${days} gün`
}

export function UpcomingItems() {
  const [data, setData] = useState<UpcomingPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/upcoming?days=14')
      .then(r => r.json())
      .then(j => setData(j.data))
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false))
  }, [])

  const tasks = data?.tasks ?? []
  const events = data?.events ?? []
  const totalCount = tasks.length + events.length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Yaklaşan</CardTitle>
        <div className="flex items-center gap-3 text-xs">
          <Link href="/gorevler" className="text-primary hover:underline flex items-center gap-1">
            Görevler <ArrowRight className="h-3 w-3" />
          </Link>
          <Link href="/takvim" className="text-primary hover:underline flex items-center gap-1">
            Takvim <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {loading && <p className="text-muted-foreground text-sm">Yükleniyor...</p>}
          {!loading && totalCount === 0 && (
            <p className="text-muted-foreground text-sm">Yaklaşan etkinlik veya görev yok.</p>
          )}

          {events.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Etkinlikler</p>
              {events.map(ev => (
                <div key={`ev-${ev.id}`} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Calendar className="h-4 w-4 text-purple-600 shrink-0" />
                    <p className="text-sm font-medium truncate">{ev.title}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <Badge variant="secondary" className="text-xs">{relativeLabel(ev.start_time)}</Badge>
                    <span className="text-xs text-muted-foreground">{ev.start_time.slice(11, 16)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tasks.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Yapılacaklar</p>
              {tasks.map(task => {
                const overdue = daysUntil(task.due_date) !== null && daysUntil(task.due_date)! < 0
                return (
                  <div key={`task-${task.id}`} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {task.recurrence_days ? (
                        <Repeat className="h-4 w-4 text-blue-600 shrink-0" />
                      ) : (
                        <CheckSquare className="h-4 w-4 text-green-600 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        {task.recurrence_days != null && (
                          <p className="text-xs text-blue-700">{recurrenceLabel(task.recurrence_days)}</p>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 shrink-0">
                      {task.due_date && (
                        <Badge variant={overdue ? 'destructive' : 'secondary'} className="text-xs">
                          {relativeLabel(task.due_date)}
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
