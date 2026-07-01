'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Clock, Trash2, X,
  Upload, Link2, RefreshCw, Download
} from 'lucide-react'

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

interface CalendarSource {
  id: number
  name: string
  url: string
  owner: string
  color: string
  last_synced: string | null
  created_at: string
}

const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
]

function pad(n: number) { return n.toString().padStart(2, '0') }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function toTimeStr(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}` }

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Monday = 0, Sunday = 6
  let startWeekday = firstDay.getDay() - 1
  if (startWeekday < 0) startWeekday = 6

  const days: { date: Date; currentMonth: boolean }[] = []

  // Previous month padding
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ date: d, currentMonth: false })
  }

  // Current month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), currentMonth: true })
  }

  // Next month padding (fill to 42 = 6 rows)
  const remaining = 42 - days.length
  for (let i = 1; i <= remaining; i++) {
    days.push({ date: new Date(year, month + 1, i), currentMonth: false })
  }

  return days
}

export default function CalendarPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newStartTime, setNewStartTime] = useState('09:00')
  const [newEndTime, setNewEndTime] = useState('10:00')
  const [loading, setLoading] = useState(true)

  // Import / sources state
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importTab, setImportTab] = useState<'url' | 'file' | 'sources'>('sources')
  const [sources, setSources] = useState<CalendarSource[]>([])
  const [sourceName, setSourceName] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceColor, setSourceColor] = useState('#0078d4')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importMsg, setImportMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const days = useMemo(() => getMonthDays(year, month), [year, month])

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const start = toDateStr(days[0].date)
    const end = toDateStr(new Date(days[days.length - 1].date.getTime() + 86400000))
    try {
      const res = await fetch(`/api/events/calendar?start=${start}&end=${end}`)
      const { data } = await res.json()
      setEvents(data || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [days])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    for (const ev of events) {
      const startDate = ev.start_time.substring(0, 10)
      const endDate = ev.end_time.substring(0, 10)

      // For multi-day events, add to each day
      const d = new Date(startDate)
      const last = new Date(endDate)
      while (d <= last) {
        const key = toDateStr(d)
        if (!map[key]) map[key] = []
        map[key].push(ev)
        d.setDate(d.getDate() + 1)
      }
    }
    return map
  }, [events])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }

  async function addEvent() {
    if (!newTitle.trim() || !selectedDate) return
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle,
        start_time: `${selectedDate} ${newStartTime}`,
        end_time: `${selectedDate} ${newEndTime}`,
      }),
    })
    setNewTitle('')
    setNewStartTime('09:00')
    setNewEndTime('10:00')
    setShowAddDialog(false)
    fetchEvents()
  }

  async function deleteEvent(id: number) {
    await fetch(`/api/events/${id}`, { method: 'DELETE' })
    fetchEvents()
  }

  // ─── Calendar Sources / Import ────────────────────────────────

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch('/api/calendars')
      const json = await res.json()
      if (json.success) setSources(json.data || [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { if (showImportDialog) fetchSources() }, [showImportDialog, fetchSources])

  async function addUrlSource() {
    if (!sourceName.trim() || !sourceUrl.trim()) return
    setImportBusy(true)
    setImportMsg(null)
    try {
      const res = await fetch('/api/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: sourceName, url: sourceUrl, color: sourceColor }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed')

      // Auto-sync the new source
      await fetch('/api/calendars/sync', { method: 'POST' })

      setImportMsg({ type: 'ok', text: `"${sourceName}" eklendi ve senkronize edildi.` })
      setSourceName('')
      setSourceUrl('')
      fetchSources()
      fetchEvents()
    } catch (err: any) {
      setImportMsg({ type: 'err', text: err.message || 'Eklenemedi' })
    }
    setImportBusy(false)
  }

  async function uploadIcsFile() {
    if (!importFile) return
    setImportBusy(true)
    setImportMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', importFile)
      fd.append('name', sourceName || importFile.name.replace(/\.ics$/i, ''))
      fd.append('color', sourceColor)

      const res = await fetch('/api/calendars/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Upload failed')

      setImportMsg({ type: 'ok', text: `${json.imported} etkinlik içe aktarıldı.` })
      setImportFile(null)
      setSourceName('')
      fetchSources()
      fetchEvents()
    } catch (err: any) {
      setImportMsg({ type: 'err', text: err.message || 'Yüklenemedi' })
    }
    setImportBusy(false)
  }

  async function syncAllSources() {
    setImportBusy(true)
    setImportMsg(null)
    try {
      const res = await fetch('/api/calendars/sync', { method: 'POST' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Sync failed')
      setImportMsg({ type: 'ok', text: `${json.synced} etkinlik senkronize edildi.` })
      fetchSources()
      fetchEvents()
    } catch (err: any) {
      setImportMsg({ type: 'err', text: err.message || 'Sync hatası' })
    }
    setImportBusy(false)
  }

  async function deleteSource(id: number) {
    if (!confirm('Bu takvim kaynağını silmek istediğinize emin misiniz? Tüm etkinlikleri kaldırılacak.')) return
    try {
      await fetch(`/api/calendars/${id}`, { method: 'DELETE' })
      fetchSources()
      fetchEvents()
    } catch { /* ignore */ }
  }

  const todayStr = toDateStr(today)
  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : []

  function formatTime(dt: string) {
    const t = dt.substring(11, 16)
    return t || ''
  }

  function formatSelectedDate(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center justify-between w-full sm:w-auto gap-2">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-5 w-5 sm:h-6 sm:w-6" /> Takvim
          </h1>
          <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)} className="text-xs sm:text-sm">
            <Download className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
            <span className="hidden sm:inline">İçe Aktar</span>
          </Button>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <Button variant="outline" size="sm" onClick={goToday} className="text-xs sm:text-sm">Bugün</Button>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm sm:text-lg font-semibold min-w-[120px] sm:min-w-[160px] text-center">
              {MONTH_NAMES[month]} {year}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Calendar Grid */}
        <Card className="flex-1 min-w-0">
          <CardContent className="p-2 sm:p-3">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_NAMES.map(d => (
                <div key={d} className="text-center text-[10px] sm:text-xs font-medium text-muted-foreground py-1 sm:py-2">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {days.map(({ date, currentMonth }, i) => {
                const dateStr = toDateStr(date)
                const isToday = dateStr === todayStr
                const isSelected = dateStr === selectedDate
                const dayEvents = eventsByDate[dateStr] || []

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`
                      relative p-0.5 sm:p-1 min-h-[48px] sm:min-h-[80px] border border-gray-100 text-left align-top transition-colors
                      hover:bg-gray-50 active:bg-gray-100
                      ${!currentMonth ? 'opacity-30' : ''}
                      ${isSelected ? 'bg-blue-50 border-blue-300' : ''}
                      ${isToday ? 'ring-2 ring-blue-500 ring-inset' : ''}
                    `}
                  >
                    <span className={`
                      text-[10px] sm:text-xs font-medium
                      ${isToday ? 'bg-blue-600 text-white rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-[10px] sm:text-xs' : ''}
                    `}>
                      {date.getDate()}
                    </span>

                    {/* Event dots on mobile, previews on desktop */}
                    <div className="mt-0.5 sm:mt-1 space-y-0.5">
                      {/* Mobile: just dots */}
                      <div className="flex gap-0.5 flex-wrap sm:hidden">
                        {dayEvents.slice(0, 4).map((ev, j) => (
                          <div
                            key={`${ev.id}-${ev.source}-${j}`}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: ev.color || '#2563eb' }}
                          />
                        ))}
                      </div>
                      {/* Desktop: text previews */}
                      <div className="hidden sm:block">
                        {dayEvents.slice(0, 3).map((ev, j) => (
                          <div
                            key={`${ev.id}-${ev.source}-${j}`}
                            className="text-[10px] leading-tight truncate rounded px-1 py-0.5"
                            style={{
                              backgroundColor: ev.color ? `${ev.color}22` : '#dbeafe',
                              color: ev.color || '#2563eb',
                              borderLeft: `2px solid ${ev.color || '#2563eb'}`,
                            }}
                            title={ev.title}
                          >
                            {ev.all_day ? '' : formatTime(ev.start_time) + ' '}{ev.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-[10px] text-muted-foreground pl-1">
                            +{dayEvents.length - 3} daha
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {loading && (
              <p className="text-xs text-muted-foreground text-center mt-2">Yükleniyor...</p>
            )}
          </CardContent>
        </Card>

        {/* Sidebar: Selected day details */}
        <div className="w-full lg:w-80 space-y-3">
          {selectedDate ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{formatSelectedDate(selectedDate)}</h2>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setShowAddDialog(true) }}>
                    <Plus className="h-3 w-3 mr-1" /> Ekle
                  </Button>
                  <Button size="sm" variant="ghost" className="lg:hidden" onClick={() => setSelectedDate(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {selectedEvents.length === 0 ? (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground text-center">Bu gün için etkinlik yok.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((ev, i) => (
                    <Card key={`${ev.id}-${ev.source}-${i}`}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{ev.title}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {ev.all_day ? (
                                <Badge variant="secondary" className="text-[10px]">Tüm gün</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatTime(ev.start_time)} — {formatTime(ev.end_time)}
                                </span>
                              )}
                              {ev.source === 'imported' && ev.source_name && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px]"
                                  style={{ borderColor: ev.color || undefined, color: ev.color || undefined }}
                                >
                                  {ev.source_name}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {ev.source === 'local' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 shrink-0"
                              onClick={() => deleteEvent(ev.id)}
                            >
                              <Trash2 className="h-3 w-3 text-red-400" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Card className="hidden lg:block">
              <CardContent className="p-6 text-center">
                <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Detayları görmek için bir gün seçin.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Add Event Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni Etkinlik</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Başlık</label>
              <Input
                placeholder="Etkinlik adı..."
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addEvent()}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium">Tarih</label>
              <Input value={selectedDate || ''} disabled />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Başlangıç</label>
                <Input
                  type="time"
                  value={newStartTime}
                  onChange={e => setNewStartTime(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Bitiş</label>
                <Input
                  type="time"
                  value={newEndTime}
                  onChange={e => setNewEndTime(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>İptal</Button>
            <Button onClick={addEvent} disabled={!newTitle.trim()}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Calendar Dialog */}
      <Dialog open={showImportDialog} onOpenChange={(o) => { setShowImportDialog(o); if (!o) setImportMsg(null) }}>
        <DialogContent className="max-w-md sm:max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>Takvim İçe Aktar</DialogTitle>
            <DialogDescription className="text-xs">
              Google Calendar, Outlook veya iCloud takvimlerini bağlayın.
            </DialogDescription>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-1 border-b px-6 shrink-0">
            {([
              { id: 'sources', label: 'Kaynaklar', icon: CalendarDays },
              { id: 'url', label: 'URL Ekle', icon: Link2 },
              { id: 'file', label: '.ics Yükle', icon: Upload },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => { setImportTab(tab.id); setImportMsg(null) }}
                className={`flex items-center gap-1 px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
                  importTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="h-3 w-3 sm:h-4 sm:w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 min-h-0">

          {/* Status message */}
          {importMsg && (
            <div className={`text-xs sm:text-sm rounded p-2 ${
              importMsg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200'
                                      : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {importMsg.text}
            </div>
          )}

          {/* Tab: Sources */}
          {importTab === 'sources' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {sources.length === 0 ? 'Henüz takvim eklenmemiş.' : `${sources.length} takvim bağlı.`}
                </p>
                <Button size="sm" variant="outline" onClick={syncAllSources} disabled={importBusy || sources.length === 0}>
                  <RefreshCw className={`h-3 w-3 mr-1 ${importBusy ? 'animate-spin' : ''}`} />
                  Sync
                </Button>
              </div>

              {sources.length > 0 && (
                <div className="space-y-2">
                  {sources.map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-2 p-2 border rounded">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {s.url === 'file-upload' ? '📁 Dosya' : s.url === 'ms-graph' ? '🔷 Office 365' : `🔗 ${s.url}`}
                          </p>
                          {s.last_synced && (
                            <p className="text-[10px] text-muted-foreground">
                              Son sync: {new Date(s.last_synced).toLocaleString('tr-TR')}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => deleteSource(s.id)}>
                        <Trash2 className="h-3 w-3 text-red-400" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: URL */}
          {importTab === 'url' && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Takvim Adı</label>
                <Input
                  placeholder="Örn: İş Takvimim"
                  value={sourceName}
                  onChange={e => setSourceName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">iCal URL</label>
                <Input
                  placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                  value={sourceUrl}
                  onChange={e => setSourceUrl(e.target.value)}
                  type="url"
                  inputMode="url"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Google: Ayarlar → Takvimi paylaş → Gizli adresi (iCal formatında)<br />
                  Outlook: Takvim ayarları → ICS bağlantısını yayınla
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Renk</label>
                <Input
                  type="color"
                  value={sourceColor}
                  onChange={e => setSourceColor(e.target.value)}
                  className="h-10 w-20 cursor-pointer"
                />
              </div>
              <Button
                onClick={addUrlSource}
                disabled={!sourceName.trim() || !sourceUrl.trim() || importBusy}
                className="w-full"
              >
                {importBusy ? 'Senkronize ediliyor...' : 'Ekle ve Senkronize Et'}
              </Button>
            </div>
          )}

          {/* Tab: File upload */}
          {importTab === 'file' && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Takvim Adı (opsiyonel)</label>
                <Input
                  placeholder="Boş bırakılırsa dosya adı kullanılır"
                  value={sourceName}
                  onChange={e => setSourceName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">.ics Dosyası</label>
                <Input
                  type="file"
                  accept=".ics,text/calendar"
                  onChange={e => setImportFile(e.target.files?.[0] || null)}
                  className="cursor-pointer file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 file:text-xs"
                />
                {importFile && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {importFile.name} — {(importFile.size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Renk</label>
                <Input
                  type="color"
                  value={sourceColor}
                  onChange={e => setSourceColor(e.target.value)}
                  className="h-10 w-20 cursor-pointer"
                />
              </div>
              <Button
                onClick={uploadIcsFile}
                disabled={!importFile || importBusy}
                className="w-full"
              >
                {importBusy ? 'Yükleniyor...' : 'Yükle ve İçe Aktar'}
              </Button>
            </div>
          )}

          </div>{/* /scrollable body */}
        </DialogContent>
      </Dialog>
    </div>
  )
}
