'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Lightbulb, Power, PowerOff, RefreshCw, Loader2, Plug } from 'lucide-react'

interface Device {
  key: string
  connectorId: string
  id: string
  name: string
  model?: string
  capabilities: string[]
}

const BRIGHTNESS_PRESETS = [25, 50, 75, 100]

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
  const [active, setActive] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null) // `${key}:${action}`

  const fetchDevices = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const res = await fetch('/api/devices')
      const data = await res.json()
      setActive(!!data.active)
      setDevices(data.devices || [])
    } catch {
      setActive(false)
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  async function control(device: Device, action: string, value: unknown, busyTag: string, okMsg: string) {
    setBusy(`${device.key}:${busyTag}`)
    try {
      const res = await fetch('/api/devices/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device: { connectorId: device.connectorId, id: device.id, model: device.model },
          action,
          value,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Hata')
      toast.success(`${device.name}: ${okMsg}`)
    } catch (err) {
      toast.error(`${device.name}: ${err instanceof Error ? err.message : 'hata'}`)
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Lightbulb className="h-6 w-6" /> Cihazlar</h1>
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    )
  }

  if (!active) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Lightbulb className="h-6 w-6" /> Cihazlar</h1>
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Plug className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              Henüz aktif akıllı-ev connector&apos;ı yok. Terminalde <code className="px-1 bg-muted rounded">npm run configure</code> ile
              bir connector ekleyin (ör. Govee), ya da denemek için <code className="px-1 bg-muted rounded">DEMO_DEVICES=1</code> yapıp yeniden başlatın.
            </p>
            <Button variant="outline" size="sm" onClick={() => fetchDevices(true)}>
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} /> Tekrar Dene
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Lightbulb className="h-6 w-6" /> Cihazlar</h1>
        <Button variant="ghost" size="icon" onClick={() => fetchDevices(true)}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {devices.length === 0 && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Connector aktif ama cihaz bulunamadı.
        </CardContent></Card>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {devices.map((d) => {
          const isBusy = (tag: string) => busy === `${d.key}:${tag}`
          return (
            <Card key={d.key}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  {d.name}
                  <Badge variant="outline" className="ml-auto text-[10px] capitalize">{d.connectorId}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Power */}
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" disabled={isBusy('on')}
                    onClick={() => control(d, 'power', true, 'on', 'açıldı')}>
                    {isBusy('on') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4 mr-1" />} Aç
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" disabled={isBusy('off')}
                    onClick={() => control(d, 'power', false, 'off', 'kapatıldı')}>
                    {isBusy('off') ? <Loader2 className="h-4 w-4 animate-spin" /> : <PowerOff className="h-4 w-4 mr-1" />} Kapat
                  </Button>
                </div>

                {/* Brightness */}
                {d.capabilities.includes('brightness') && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Parlaklık</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {BRIGHTNESS_PRESETS.map((p) => (
                        <Button key={p} size="sm" variant="secondary" disabled={isBusy(`b${p}`)}
                          onClick={() => control(d, 'brightness', p, `b${p}`, `parlaklık %${p}`)}>
                          {isBusy(`b${p}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : `${p}%`}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Colour */}
                {d.capabilities.includes('color') && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Renk</p>
                    <div className="flex flex-wrap gap-2">
                      {COLORS.map((c) => (
                        <button key={c.name} title={c.name} disabled={isBusy(`c${c.name}`)}
                          onClick={() => control(d, 'color', c.rgb, `c${c.name}`, `renk ${c.name.toLowerCase()}`)}
                          className="h-7 w-7 rounded-full border border-black/10 shadow-sm transition-transform hover:scale-110 disabled:opacity-50"
                          style={{ backgroundColor: c.hex }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
