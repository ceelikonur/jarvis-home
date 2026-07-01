'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckSquare, Plus, Trash2, Check, Clock, Repeat } from 'lucide-react'

interface Task {
  id: number
  title: string
  status: string
  due_date: string | null
  priority: string
  recurrence_days: number | null
  created_at: string
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

function defaultLeadDays(recurrenceDays: number): number {
  if (!recurrenceDays || recurrenceDays <= 0) return 0
  return Math.min(14, Math.max(1, Math.round(recurrenceDays / 9)))
}

function daysUntil(dueDateStr: string | null): number | null {
  if (!dueDateStr) return null
  const due = new Date(`${dueDateStr.slice(0, 10)}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function isTaskActive(task: Task): boolean {
  if (!task.recurrence_days) return true
  if (!task.due_date) return true
  const remaining = daysUntil(task.due_date)
  if (remaining === null) return true
  return remaining <= defaultLeadDays(task.recurrence_days)
}

function relativeDueLabel(dueDateStr: string | null): string {
  const d = daysUntil(dueDateStr)
  if (d === null) return ''
  if (d < 0) return `${Math.abs(d)} gün gecikmiş`
  if (d === 0) return 'bugün'
  if (d === 1) return 'yarın'
  return `${d} gün sonra`
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTask, setNewTask] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks/all')
      const { data } = await res.json()
      setTasks(data || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  async function addTask() {
    if (!newTask.trim()) return
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTask }),
    })
    setNewTask('')
    fetchTasks()
  }

  async function completeTask(id: number) {
    await fetch(`/api/tasks/${id}/complete`, { method: 'PATCH' })
    fetchTasks()
  }

  async function deleteTask(id: number) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    fetchTasks()
  }

  const pending = tasks.filter(t => t.status === 'pending')
  const completed = tasks.filter(t => t.status === 'completed')
  const activePending = pending.filter(isTaskActive)
  const dormantPending = pending.filter(t => !isTaskActive(t))

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <CheckSquare className="h-6 w-6" /> Görevler
      </h1>

      <div className="flex gap-2">
        <Input
          placeholder="Yeni görev ekle..."
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
        />
        <Button onClick={addTask}><Plus className="h-4 w-4" /></Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bekleyen ({activePending.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Yükleniyor...</p>}
          {!loading && activePending.length === 0 && (
            <p className="text-sm text-muted-foreground">Tüm görevler tamamlandı!</p>
          )}
          {activePending.map(task => (
            <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg border bg-white">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => completeTask(task.id)}
                title={task.recurrence_days ? 'Tamamla — bir sonraki tarihe ötele' : 'Tamamla'}
              >
                {task.recurrence_days ? (
                  <Repeat className="h-4 w-4 text-blue-600" />
                ) : (
                  <Check className="h-4 w-4 text-green-600" />
                )}
              </Button>
              <div className="flex-1">
                <p className="text-sm font-medium">{task.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {task.due_date && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {task.due_date}
                    </span>
                  )}
                  {task.recurrence_days != null && (
                    <span className="text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Repeat className="h-3 w-3" /> {recurrenceLabel(task.recurrence_days)}
                    </span>
                  )}
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => deleteTask(task.id)}>
                <Trash2 className="h-4 w-4 text-red-400" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {dormantPending.length > 0 && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground flex items-center gap-2">
              <Repeat className="h-4 w-4" /> Sıradaki rutinler ({dormantPending.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Vade yaklaştıkça otomatik olarak yukarıdaki listeye geçer.
            </p>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {dormantPending.map(task => (
              <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg opacity-70">
                <Repeat className="h-4 w-4 text-blue-400" />
                <div className="flex-1">
                  <p className="text-sm">{task.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {recurrenceLabel(task.recurrence_days!)}
                    </span>
                    {task.due_date && (
                      <span className="text-xs text-muted-foreground">
                        · sıradaki: {task.due_date.slice(0, 10)} ({relativeDueLabel(task.due_date)})
                      </span>
                    )}
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => deleteTask(task.id)}>
                  <Trash2 className="h-3 w-3 text-red-300" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {completed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Tamamlanan ({completed.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {completed.slice(0, 10).map(task => (
              <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg opacity-50">
                <Check className="h-4 w-4 text-green-600" />
                <p className="text-sm line-through flex-1">{task.title}</p>
                <Button size="icon" variant="ghost" onClick={() => deleteTask(task.id)}>
                  <Trash2 className="h-3 w-3 text-red-300" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
