'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Timer, ChevronLeft, ChevronRight, Plus, Trash2, Check, X,
  Sparkles, RotateCcw, Clock, Loader2, GripVertical, ArrowDownToLine, Inbox,
} from 'lucide-react'

interface Timebox {
  id: number
  date: string
  start_time: string
  end_time: string
  title: string
  task_id: number | null
  status: 'planned' | 'done' | 'skipped'
  notes: string | null
  notified: number
}

interface CalendarEvent {
  id: number
  title: string
  start_time: string
  end_time: string
  all_day: number
  source: 'local' | 'imported'
  source_name: string | null
  color: string | null
}

interface PendingTask {
  id: number
  title: string
  due_date: string | null
  recurrence_days: number | null
}

interface Stats { planned: number; done: number; skipped: number; total: number }

// Pool item = staged but not yet placed on the timeline.
// Local state only — empties on refresh, which is intentional for daily MVP.
interface PoolItem {
  id: string             // client-side temporary id
  title: string
  task_id: number | null
  defaultDuration: number  // minutes
}

const HOUR_HEIGHT_PX = 60      // 1 hour = 60px row
const SNAP_MINUTES = 15
const DAY_START_HOUR = 6
const DAY_END_HOUR = 23
const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i)
const DEFAULT_DURATION = 30

function pad(n: number) { return n.toString().padStart(2, '0') }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function toIsoLocal(date: string, hour: number, minute: number) {
  return `${date} ${pad(hour)}:${pad(minute)}`
}
function parseHHMM(s: string): { h: number; m: number } {
  return { h: Number(s.slice(11, 13)), m: Number(s.slice(14, 16)) }
}
function minutesFromDayStart(timeStr: string): number {
  const { h, m } = parseHHMM(timeStr)
  return (h - DAY_START_HOUR) * 60 + m
}
function durationMinutes(start: string, end: string): number {
  return Math.max(15, minutesFromDayStart(end) - minutesFromDayStart(start))
}
function formatDateLong(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function statusColor(s: Timebox['status']): string {
  if (s === 'done') return '#16a34a'
  if (s === 'skipped') return '#9ca3af'
  return '#2563eb'
}

/** Compute snapped (hour, minute) within the day window from a Y pixel offset. */
function pixelsToTime(y: number): { hour: number; minute: number } {
  const minutesFromTop = Math.max(0, y)
  const snapped = Math.round(minutesFromTop / SNAP_MINUTES) * SNAP_MINUTES
  const capped = Math.min(snapped, (HOURS.length - 1) * 60 + 45) // last slot 22:45
  const hour = Math.floor(capped / 60) + DAY_START_HOUR
  const minute = capped % 60
  return { hour, minute }
}

function addMinutesToTime(date: string, h: number, m: number, plusMin: number): string {
  const totalMin = h * 60 + m + plusMin
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  return `${date} ${pad(hours)}:${pad(mins)}`
}

export default function PlanPage() {
  const [date, setDate] = useState<string>(() => toDateStr(new Date()))
  const [timeboxes, setTimeboxes] = useState<Timebox[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([])
  const [stats, setStats] = useState<Stats>({ planned: 0, done: 0, skipped: 0, total: 0 })
  const [loading, setLoading] = useState(true)

  // Pool (staging area, local state)
  const [pool, setPool] = useState<PoolItem[]>([])
  const [poolInput, setPoolInput] = useState('')

  // Dialog state
  const [editing, setEditing] = useState<Timebox | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formStart, setFormStart] = useState('09:00')
  const [formEnd, setFormEnd] = useState('09:30')

  // Drag state
  const [dragHover, setDragHover] = useState<{ y: number } | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  const [aiBusy, setAiBusy] = useState(false)

  // ───────────── Fetch ─────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [tbRes, evRes, taskRes, statsRes] = await Promise.all([
        fetch(`/api/timeboxes?date=${date}`),
        fetch(`/api/events/calendar?start=${date}&end=${date}`),
        fetch(`/api/tasks/active`),
        fetch(`/api/timeboxes/stats?date=${date}`),
      ])
      const tbJson = await tbRes.json()
      const evJson = await evRes.json()
      const taskJson = await taskRes.json()
      const statsJson = await statsRes.json()
      setTimeboxes(tbJson.data || [])
      setEvents(evJson.data || [])
      setPendingTasks(taskJson.data || [])
      setStats(statsJson.data || { planned: 0, done: 0, skipped: 0, total: 0 })
    } catch { /* ignore */ }
    setLoading(false)
  }, [date])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ───────────── Pool helpers ─────────────

  function tempId() { return Math.random().toString(36).slice(2, 10) }

  function addToPool(title: string, opts: { task_id?: number | null; duration?: number } = {}) {
    if (!title.trim()) return
    setPool(p => [...p, {
      id: tempId(),
      title: title.trim(),
      task_id: opts.task_id ?? null,
      defaultDuration: opts.duration ?? DEFAULT_DURATION,
    }])
  }

  function removeFromPool(id: string) {
    setPool(p => p.filter(x => x.id !== id))
  }

  function handlePoolInputSubmit() {
    if (!poolInput.trim()) return
    addToPool(poolInput)
    setPoolInput('')
  }

  // Add pending task to pool. If already in pool (by task_id), skip.
  function addTaskToPool(task: PendingTask) {
    if (pool.some(p => p.task_id === task.id)) return
    if (timeboxes.some(t => t.task_id === task.id)) return  // already placed
    addToPool(task.title, { task_id: task.id })
  }

  // Move an already-placed timebox back into the pool
  async function moveTimeboxToPool(tb: Timebox) {
    addToPool(tb.title, {
      task_id: tb.task_id,
      duration: durationMinutes(tb.start_time, tb.end_time),
    })
    await fetch(`/api/timeboxes/${tb.id}`, { method: 'DELETE' })
    if (editing?.id === tb.id) setEditing(null)
    fetchAll()
  }

  // ───────────── Date nav ─────────────

  function shiftDate(days: number) {
    const d = new Date(`${date}T00:00:00`)
    d.setDate(d.getDate() + days)
    setDate(toDateStr(d))
  }

  // ───────────── Dialog: edit existing timebox ─────────────

  function openEditDialog(tb: Timebox) {
    setEditing(tb)
    setFormTitle(tb.title)
    setFormStart(tb.start_time.slice(11, 16))
    setFormEnd(tb.end_time.slice(11, 16))
  }

  function closeDialog() { setEditing(null) }

  async function saveEdit() {
    if (!editing || !formTitle.trim()) return
    await fetch(`/api/timeboxes/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: formTitle.trim(),
        start_time: `${date} ${formStart}`,
        end_time: `${date} ${formEnd}`,
      }),
    })
    closeDialog()
    fetchAll()
  }

  async function setStatus(id: number, status: Timebox['status']) {
    await fetch(`/api/timeboxes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (editing?.id === id) setEditing(null)
    fetchAll()
  }

  async function deleteTimebox(id: number) {
    await fetch(`/api/timeboxes/${id}`, { method: 'DELETE' })
    if (editing?.id === id) setEditing(null)
    fetchAll()
  }

  // ───────────── AI suggest (pushes proposals into the pool) ─────────────

  async function aiSuggest() {
    setAiBusy(true)
    try {
      const res = await fetch(`/api/timeboxes/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      const j = await res.json()
      if (j.success && Array.isArray(j.data)) {
        // AI returns full proposals with times — push them into pool with their
        // suggested duration. User then drags onto timeline at desired spot.
        for (const s of j.data) {
          const dur = durationMinutes(s.start_time, s.end_time)
          addToPool(s.title, { task_id: s.task_id ?? null, duration: dur })
        }
      }
    } catch { /* ignore */ }
    setAiBusy(false)
  }

  // ───────────── Drag & drop ─────────────

  function onPoolDragStart(e: React.DragEvent, item: PoolItem) {
    e.dataTransfer.setData('application/json', JSON.stringify({
      kind: 'pool', item,
    }))
    e.dataTransfer.effectAllowed = 'move'
  }

  function onTimeboxDragStart(e: React.DragEvent, tb: Timebox) {
    e.stopPropagation()
    e.dataTransfer.setData('application/json', JSON.stringify({
      kind: 'timebox',
      id: tb.id,
      duration: durationMinutes(tb.start_time, tb.end_time),
    }))
    e.dataTransfer.effectAllowed = 'move'
  }

  function onTimelineDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = timelineRef.current?.getBoundingClientRect()
    if (rect) {
      const y = e.clientY - rect.top
      setDragHover({ y })
    }
  }

  function onTimelineDragLeave() {
    setDragHover(null)
  }

  async function onTimelineDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragHover(null)
    const rect = timelineRef.current?.getBoundingClientRect()
    if (!rect) return
    const y = e.clientY - rect.top
    const { hour, minute } = pixelsToTime(y)

    let payload: any
    try { payload = JSON.parse(e.dataTransfer.getData('application/json')) }
    catch { return }

    if (payload?.kind === 'pool') {
      const item: PoolItem = payload.item
      const start = toIsoLocal(date, hour, minute)
      const end = addMinutesToTime(date, hour, minute, item.defaultDuration)
      await fetch('/api/timeboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          start_time: start,
          end_time: end,
          task_id: item.task_id,
        }),
      })
      removeFromPool(item.id)
      fetchAll()
    } else if (payload?.kind === 'timebox') {
      const start = toIsoLocal(date, hour, minute)
      const end = addMinutesToTime(date, hour, minute, payload.duration)
      await fetch(`/api/timeboxes/${payload.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_time: start, end_time: end }),
      })
      fetchAll()
    }
  }

  // ───────────── Layout helpers ─────────────

  const isToday = date === toDateStr(new Date())
  const nowMinutes = useMemo(() => {
    if (!isToday) return null
    const n = new Date()
    return (n.getHours() - DAY_START_HOUR) * 60 + n.getMinutes()
  }, [isToday])

  const dayEvents = useMemo(
    () => events.filter(e => e.start_time && e.start_time.startsWith(date)),
    [events, date]
  )

  // Tasks shown in sidebar — exclude tasks already in pool or already placed as timeboxes
  const sidebarTasks = useMemo(() => pendingTasks.filter(t =>
    !pool.some(p => p.task_id === t.id) &&
    !timeboxes.some(tb => tb.task_id === t.id)
  ), [pendingTasks, pool, timeboxes])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Timer className="h-5 w-5 sm:h-6 sm:w-6" /> Bugünkü Plan
        </h1>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftDate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setDate(toDateStr(new Date()))}>
            Bugün
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftDate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium ml-2 hidden sm:inline">{formatDateLong(date)}</span>
        </div>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-3 text-xs flex-wrap">
        <Badge variant="secondary" className="text-xs">
          1️⃣ Havuz: {pool.length} madde
        </Badge>
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
        <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 border border-blue-200">
          2️⃣ Yerleştirilen: {stats.planned}
        </Badge>
        <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 border border-green-200">
          ✅ {stats.done} tamam
        </Badge>
        {stats.skipped > 0 && (
          <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
            ⊘ {stats.skipped} atlanan
          </Badge>
        )}
        <span className="text-muted-foreground ml-auto sm:hidden">{formatDateLong(date)}</span>
      </div>

      {/* ─── STEP 1: POOL ─── */}
      <Card className="border-blue-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Inbox className="h-4 w-4 text-blue-600" />
            1. Havuza Madde Ekle
            <span className="text-xs font-normal text-muted-foreground ml-2">
              — bugün ne yapmak istiyorsun? Aklındakileri buraya at.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Free-text input */}
          <div className="flex gap-2">
            <Input
              placeholder="Yeni madde ekle... (Enter)"
              value={poolInput}
              onChange={e => setPoolInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePoolInputSubmit()}
              className="text-sm"
            />
            <Button size="sm" onClick={handlePoolInputSubmit} disabled={!poolInput.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={aiSuggest} disabled={aiBusy} title="AI ile öneri al">
              {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span className="ml-1 hidden sm:inline">AI öneri</span>
            </Button>
          </div>

          {/* Pool chips */}
          {pool.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Havuz boş. Yukarıdan madde ekle veya yandaki bekleyen görevlere tıkla.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pool.map(item => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => onPoolDragStart(e, item)}
                  className="group flex items-center gap-1.5 pl-2 pr-1 py-1.5 rounded-full border border-blue-300 bg-blue-50 hover:bg-blue-100 cursor-grab active:cursor-grabbing text-xs"
                  title="Sürükle ve plana bırak"
                >
                  <GripVertical className="h-3 w-3 text-blue-400" />
                  <span className="font-medium">{item.title}</span>
                  <span className="text-blue-400 text-[10px]">{item.defaultDuration}dk</span>
                  {item.task_id && <span className="text-[10px] text-blue-400">#{item.task_id}</span>}
                  <button
                    onClick={() => removeFromPool(item.id)}
                    className="ml-0.5 p-0.5 rounded-full hover:bg-blue-200 text-blue-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Pending task quick-pick */}
          {sidebarTasks.length > 0 && (
            <div className="pt-2 border-t border-blue-100">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Bekleyen görevlerden hızlı ekle:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sidebarTasks.slice(0, 8).map(task => (
                  <button
                    key={task.id}
                    onClick={() => addTaskToPool(task)}
                    className="text-[11px] px-2 py-1 rounded-full border border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                  >
                    + {task.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── STEP 2: TIMELINE ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-blue-600" />
            2. Plana Yerleştir
            <span className="text-xs font-normal text-muted-foreground ml-2">
              — havuzdan sürükleyip saatlerine bırak. Var olanları da sürükleyerek taşı.
            </span>
            <Button onClick={fetchAll} variant="ghost" size="icon" className="h-7 w-7 ml-auto">
              <RotateCcw className="h-3 w-3" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Yükleniyor...</p>
          ) : (
            <div
              ref={timelineRef}
              onDragOver={onTimelineDragOver}
              onDragLeave={onTimelineDragLeave}
              onDrop={onTimelineDrop}
              className="relative"
              style={{ height: HOURS.length * HOUR_HEIGHT_PX }}
            >
              {/* Hour grid lines */}
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-t border-gray-100 flex"
                  style={{ top: (h - DAY_START_HOUR) * HOUR_HEIGHT_PX, height: HOUR_HEIGHT_PX }}
                >
                  <div className="w-12 sm:w-14 text-[10px] sm:text-xs text-muted-foreground text-right pr-2 pt-0.5">
                    {pad(h)}:00
                  </div>
                  <div className="flex-1 border-l border-gray-100" />
                </div>
              ))}

              {/* Drag drop indicator */}
              {dragHover && (
                <div
                  className="absolute left-12 sm:left-14 right-1 border-t-2 border-dashed border-blue-500 pointer-events-none z-30"
                  style={{
                    top: Math.round(dragHover.y / SNAP_MINUTES) * SNAP_MINUTES,
                  }}
                >
                  <span className="absolute -top-2.5 right-2 text-[10px] bg-blue-500 text-white px-1.5 rounded">
                    {(() => {
                      const { hour, minute } = pixelsToTime(dragHover.y)
                      return `${pad(hour)}:${pad(minute)}`
                    })()}
                  </span>
                </div>
              )}

              {/* Now indicator */}
              {nowMinutes !== null && nowMinutes >= 0 && nowMinutes < HOURS.length * 60 && (
                <div
                  className="absolute left-12 sm:left-14 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
                  style={{ top: nowMinutes }}
                >
                  <span className="absolute -top-2 -left-1 w-2 h-2 rounded-full bg-red-500" />
                </div>
              )}

              {/* Events (background, immovable) */}
              {dayEvents.map(ev => {
                const startMin = minutesFromDayStart(ev.start_time)
                const dur = durationMinutes(ev.start_time, ev.end_time)
                if (startMin < 0 || startMin > HOURS.length * 60) return null
                return (
                  <div
                    key={`ev-${ev.id}-${ev.source}`}
                    className="absolute right-1 px-2 py-1 rounded text-[10px] sm:text-xs overflow-hidden border-l-2 pointer-events-none"
                    style={{
                      left: 'calc(3.5rem + 4px)',
                      top: startMin,
                      height: Math.max(dur - 2, 18),
                      width: '40%',
                      backgroundColor: ev.color ? `${ev.color}15` : '#e5e7eb',
                      borderColor: ev.color || '#9ca3af',
                      color: '#374151',
                    }}
                    title={`${ev.title} (${ev.source_name || 'event'})`}
                  >
                    <span className="font-mono text-[9px] mr-1">{ev.start_time.slice(11, 16)}</span>
                    <span className="font-medium">{ev.title}</span>
                  </div>
                )
              })}

              {/* Timeboxes — draggable to reposition, click to edit */}
              {timeboxes.map(tb => {
                const startMin = minutesFromDayStart(tb.start_time)
                const dur = durationMinutes(tb.start_time, tb.end_time)
                if (startMin < 0) return null
                const color = statusColor(tb.status)
                const isDone = tb.status === 'done'
                const isSkipped = tb.status === 'skipped'
                return (
                  <div
                    key={`tb-${tb.id}`}
                    draggable
                    onDragStart={(e) => onTimeboxDragStart(e, tb)}
                    onClick={() => openEditDialog(tb)}
                    className="absolute left-12 sm:left-14 px-2 py-1 rounded text-left text-[11px] sm:text-xs overflow-hidden shadow-sm hover:shadow-md transition-shadow z-10 cursor-grab active:cursor-grabbing"
                    style={{
                      top: startMin,
                      height: Math.max(dur - 2, 22),
                      width: 'calc(50% - 4px)',
                      backgroundColor: `${color}22`,
                      borderLeft: `3px solid ${color}`,
                      opacity: isSkipped ? 0.55 : 1,
                    }}
                    title={`${tb.title} — sürükle ve taşı, tıkla ve düzenle`}
                  >
                    <div className="flex items-center gap-1 pointer-events-none">
                      <GripVertical className="h-3 w-3 shrink-0 opacity-50" style={{ color }} />
                      {isDone && <Check className="h-3 w-3 shrink-0" style={{ color }} />}
                      <span className="font-mono text-[9px]" style={{ color }}>{tb.start_time.slice(11, 16)}</span>
                      <span className={`font-medium truncate ${isDone || isSkipped ? 'line-through' : ''}`}>
                        {tb.title}
                      </span>
                    </div>
                    {dur > 25 && (
                      <div className="text-[9px] text-muted-foreground mt-0.5 pointer-events-none">
                        {tb.start_time.slice(11, 16)}–{tb.end_time.slice(11, 16)} · {dur}dk
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Box Düzenle</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Başlık</label>
                <Input
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveEdit()}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Başlangıç</label>
                  <Input type="time" value={formStart} onChange={e => setFormStart(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Bitiş</label>
                  <Input type="time" value={formEnd} onChange={e => setFormEnd(e.target.value)} />
                </div>
              </div>
              {editing.task_id && (
                <p className="text-xs text-muted-foreground">🔗 Görev #{editing.task_id} ile bağlı</p>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button
                  size="sm"
                  variant={editing.status === 'planned' ? 'default' : 'outline'}
                  onClick={() => setStatus(editing.id, 'planned')}
                >
                  Planlandı
                </Button>
                <Button
                  size="sm"
                  variant={editing.status === 'done' ? 'default' : 'outline'}
                  className={editing.status === 'done' ? 'bg-green-600 hover:bg-green-700' : ''}
                  onClick={() => setStatus(editing.id, 'done')}
                >
                  <Check className="h-3 w-3 mr-1" /> Bitti
                </Button>
                <Button
                  size="sm"
                  variant={editing.status === 'skipped' ? 'default' : 'outline'}
                  onClick={() => setStatus(editing.id, 'skipped')}
                >
                  Atla
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => moveTimeboxToPool(editing)}
                  title="Plandan çıkar, havuza geri al"
                >
                  <Inbox className="h-3 w-3 mr-1" /> Havuza al
                </Button>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            {editing && (
              <Button
                variant="ghost"
                onClick={() => deleteTimebox(editing.id)}
                className="text-red-500 hover:text-red-700 mr-auto"
              >
                <Trash2 className="h-4 w-4 mr-1" /> Sil
              </Button>
            )}
            <Button variant="outline" onClick={closeDialog}>İptal</Button>
            <Button onClick={saveEdit} disabled={!formTitle.trim()}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
