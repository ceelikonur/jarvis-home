'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Lightbulb, Power, PowerOff, RefreshCw, Loader2, Plug, Check, Plus, X, Trash2 } from 'lucide-react'

interface Device {
  key: string
  connectorId: string
  id: string
  name: string
  model?: string
  capabilities: string[]
}

interface Connector {
  id: string
  name: string
  description: string
  requiredEnv: string[]
  configHints: Record<string, string>
  capabilities: string[]
  authType?: string | null
  configured: boolean
}

const CONNECT_TAB = '__connect__'
const BRIGHTNESS_PRESETS = [25, 50, 75, 100]
const TEMP_PRESETS = [18, 20, 21, 22]
const VACUUM_ACTIONS = [
  { action: 'start', label: 'Başlat' },
  { action: 'stop', label: 'Durdur' },
  { action: 'dock', label: 'Şarja dön' },
]
const COLORS = [
  { name: 'Kırmızı', rgb: { r: 255, g: 0, b: 0 }, hex: '#ef4444' },
  { name: 'Yeşil', rgb: { r: 0, g: 255, b: 0 }, hex: '#22c55e' },
  { name: 'Mavi', rgb: { r: 0, g: 0, b: 255 }, hex: '#3b82f6' },
  { name: 'Sarı', rgb: { r: 255, g: 220, b: 0 }, hex: '#eab308' },
  { name: 'Turuncu', rgb: { r: 255, g: 120, b: 0 }, hex: '#f97316' },
  { name: 'Mor', rgb: { r: 150, g: 0, b: 255 }, hex: '#a855f7' },
  { name: 'Beyaz', rgb: { r: 255, g: 255, b: 255 }, hex: '#f5f5f5' },
]

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<string>('')

  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [link, setLink] = useState<{ id: string; uri: string; code: string; deviceCode: string; interval: number } | null>(null)

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const [cRes, dRes] = await Promise.all([fetch('/api/connectors'), fetch('/api/devices')])
      setConnectors((await cRes.json()).connectors || [])
      setDevices((await dRes.json()).devices || [])
    } catch { /* ignore */ }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Poll the OAuth device-code approval while a link is in progress.
  useEffect(() => {
    if (!link) return
    let stopped = false
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/connectors/${link.id}/link/poll`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_code: link.deviceCode }),
        })
        const data = await res.json()
        if (stopped) return
        if (data.status === 'linked') {
          toast.success('Bağlandı ✅')
          const linkedId = link.id
          setLink(null)
          await load()
          setTab(linkedId)
        } else if (data.status === 'expired' || data.status === 'error') {
          toast.error('Bağlantı süresi doldu — tekrar deneyin')
          setLink(null)
        }
      } catch { /* keep polling */ }
    }, Math.max(3, link.interval) * 1000)
    return () => { stopped = true; clearInterval(timer) }
  }, [link, load])

  const nameOf = useCallback((id: string) => connectors.find((c) => c.id === id)?.name || id, [connectors])

  async function startLink(c: Connector) {
    try {
      const res = await fetch(`/api/connectors/${c.id}/link/start`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Hata')
      setLink({ id: c.id, uri: data.verification_uri_complete, code: data.user_code, deviceCode: data.device_code, interval: data.interval || 5 })
    } catch (err) {
      toast.error(`${c.name}: ${err instanceof Error ? err.message : 'hata'}`)
    }
  }

  // Group devices by connector, preserving a stable order.
  const groups = useMemo(() => {
    const map = new Map<string, Device[]>()
    for (const d of devices) {
      if (!map.has(d.connectorId)) map.set(d.connectorId, [])
      map.get(d.connectorId)!.push(d)
    }
    return map
  }, [devices])

  const connectorTabs = Array.from(groups.keys())
  const activeTab = connectorTabs.includes(tab) || tab === CONNECT_TAB
    ? tab
    : (connectorTabs[0] || CONNECT_TAB)

  function openEdit(c: Connector) {
    setEditId(c.id)
    const init: Record<string, string> = {}
    c.requiredEnv.forEach((k) => { init[k] = '' })
    setForm(init)
  }

  async function saveConfig(c: Connector) {
    setSaving(true)
    try {
      const res = await fetch(`/api/connectors/${c.id}/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: form }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Hata')
      toast.success(`${c.name}: ${data.configured ? 'bağlandı ✅' : 'kaydedildi'}`)
      setEditId(null)
      await load()
      if (data.configured) setTab(c.id) // jump to the freshly-connected device tab
    } catch (err) {
      toast.error(`${c.name}: ${err instanceof Error ? err.message : 'hata'}`)
    } finally {
      setSaving(false)
    }
  }

  async function removeConfig(c: Connector) {
    if (!window.confirm(`${c.name} bağlantısını kaldırmak istediğinden emin misin?`)) return
    try {
      const res = await fetch(`/api/connectors/${c.id}/config`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Hata')
      toast.success(`${c.name} kaldırıldı`)
      await load()
    } catch { toast.error(`${c.name}: kaldırılamadı`) }
  }

  async function control(device: Device, action: string, value: unknown, busyTag: string, okMsg: string) {
    setBusy(`${device.key}:${busyTag}`)
    try {
      const res = await fetch('/api/devices/control', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: { connectorId: device.connectorId, id: device.id, model: device.model }, action, value }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Hata')
      toast.success(`${device.name}: ${okMsg}`)
    } catch (err) {
      toast.error(`${device.name}: ${err instanceof Error ? err.message : 'hata'}`)
    } finally { setBusy(null) }
  }

  function DeviceCard({ d }: { d: Device }) {
    const isBusy = (tag: string) => busy === `${d.key}:${tag}`
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" /> {d.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Power — on/off devices (skip for thermostats, which use temperature) */}
          {d.capabilities.includes('power') && !d.capabilities.includes('temperature') && (
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" disabled={isBusy('on')} onClick={() => control(d, 'power', true, 'on', 'açıldı')}>
                {isBusy('on') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4 mr-1" />} Aç
              </Button>
              <Button size="sm" variant="outline" className="flex-1" disabled={isBusy('off')} onClick={() => control(d, 'power', false, 'off', 'kapatıldı')}>
                {isBusy('off') ? <Loader2 className="h-4 w-4 animate-spin" /> : <PowerOff className="h-4 w-4 mr-1" />} Kapat
              </Button>
            </div>
          )}

          {/* Thermostat */}
          {d.capabilities.includes('temperature') && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Sıcaklık</p>
              <div className="grid grid-cols-5 gap-1.5">
                {d.capabilities.includes('power') && (
                  <Button size="sm" variant="outline" disabled={isBusy('off')} onClick={() => control(d, 'power', false, 'off', 'kapatıldı')}>
                    {isBusy('off') ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Kapat'}
                  </Button>
                )}
                {TEMP_PRESETS.map((t) => (
                  <Button key={t} size="sm" variant="secondary" disabled={isBusy(`t${t}`)} onClick={() => control(d, 'temperature', t, `t${t}`, `${t}°C`)}>
                    {isBusy(`t${t}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : `${t}°`}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Vacuum */}
          {d.capabilities.includes('vacuum') && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Süpürge</p>
              <div className="grid grid-cols-3 gap-1.5">
                {VACUUM_ACTIONS.map((v) => (
                  <Button key={v.action} size="sm" variant="secondary" disabled={isBusy(`v${v.action}`)} onClick={() => control(d, 'vacuum', v.action, `v${v.action}`, v.label)}>
                    {isBusy(`v${v.action}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : v.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {d.capabilities.includes('brightness') && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Parlaklık</p>
              <div className="grid grid-cols-4 gap-1.5">
                {BRIGHTNESS_PRESETS.map((p) => (
                  <Button key={p} size="sm" variant="secondary" disabled={isBusy(`b${p}`)} onClick={() => control(d, 'brightness', p, `b${p}`, `parlaklık %${p}`)}>
                    {isBusy(`b${p}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : `${p}%`}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {d.capabilities.includes('color') && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Renk</p>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button key={c.name} title={c.name} disabled={isBusy(`c${c.name}`)}
                    onClick={() => control(d, 'color', c.rgb, `c${c.name}`, `renk ${c.name.toLowerCase()}`)}
                    className="h-7 w-7 rounded-full border border-black/10 shadow-sm transition-transform hover:scale-110 disabled:opacity-50"
                    style={{ backgroundColor: c.hex }} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Lightbulb className="h-6 w-6" /> Cihazlar</h1>
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Lightbulb className="h-6 w-6" /> Cihazlar</h1>
        <Button variant="ghost" size="icon" onClick={() => load(true)}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          {connectorTabs.map((cid) => (
            <TabsTrigger key={cid} value={cid} className="gap-1.5">
              {nameOf(cid)}
              <Badge variant="secondary" className="text-[10px] px-1.5">{groups.get(cid)!.length}</Badge>
            </TabsTrigger>
          ))}
          <TabsTrigger value={CONNECT_TAB} className="gap-1.5"><Plug className="h-3.5 w-3.5" /> Bağlantılar</TabsTrigger>
        </TabsList>

        {/* One tab per connector with its devices */}
        {connectorTabs.map((cid) => (
          <TabsContent key={cid} value={cid}>
            <div className="grid sm:grid-cols-2 gap-4">
              {groups.get(cid)!.map((d) => <DeviceCard key={d.key} d={d} />)}
            </div>
          </TabsContent>
        ))}

        {/* Connections management */}
        <TabsContent value={CONNECT_TAB}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Bağlantılar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {connectors.length === 0 && <p className="text-sm text-muted-foreground">Bağlantı bulunamadı.</p>}
              {connectors.map((c) => (
                <div key={c.id} className="rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{c.name}</span>
                        {c.configured && (
                          <Badge variant="outline" className="text-green-600 border-green-300 text-[10px]"><Check className="h-3 w-3 mr-0.5" /> Bağlı</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {c.configured && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeConfig(c)} title="Kaldır"><Trash2 className="h-4 w-4" /></Button>
                      )}
                      {c.authType === 'device_code' ? (
                        <Button size="sm" variant={c.configured ? 'outline' : 'default'} onClick={() => startLink(c)}>
                          {c.configured ? 'Yeniden bağla' : 'Bağla'}
                        </Button>
                      ) : editId === c.id ? (
                        <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                      ) : (
                        <Button size="sm" variant={c.configured ? 'outline' : 'default'} onClick={() => openEdit(c)}>
                          {c.configured ? 'Düzenle' : <><Plus className="h-4 w-4 mr-1" /> Ekle</>}
                        </Button>
                      )}
                    </div>
                  </div>

                  {link?.id === c.id && (
                    <div className="mt-3 border-t pt-3 space-y-2">
                      <p className="text-sm">Şu adrese gidip tado° hesabınla giriş yap ve <strong>onayla</strong>:</p>
                      <a href={link.uri} target="_blank" rel="noreferrer" className="text-sm text-primary underline break-all">{link.uri}</a>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        Kod: <strong>{link.code}</strong> · onay bekleniyor <Loader2 className="h-3 w-3 animate-spin" />
                      </p>
                      <Button size="sm" variant="outline" onClick={() => setLink(null)}>İptal</Button>
                    </div>
                  )}

                  {editId === c.id && (
                    <div className="mt-3 space-y-2 border-t pt-3">
                      {c.requiredEnv.map((k) => (
                        <div key={k}>
                          <label className="text-xs font-medium text-muted-foreground">{k}</label>
                          <Input className="text-sm mt-0.5" placeholder={c.configHints[k] || ''} value={form[k] ?? ''}
                            onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
                        </div>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={() => saveConfig(c)} disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Kaydet'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditId(null)}>İptal</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {connectorTabs.length === 0 && (
                <p className="text-xs text-muted-foreground pt-1">
                  Bir bağlantı ekleyince cihazları kendi sekmesinde görünür. Denemek için <strong>Demo cihazları</strong>na 1 yazıp ekleyin.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
