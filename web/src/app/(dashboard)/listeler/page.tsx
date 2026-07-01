'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ListChecks, Plus, Trash2, Check, Square, RefreshCw, WifiOff, CheckCheck, ChevronDown, ChevronRight } from 'lucide-react'

interface AnyListItem {
  id: string
  name: string
  checked: boolean
  quantity?: string
}

interface AnyList {
  id: string
  name: string
  items: AnyListItem[]
}

export default function ListsPage() {
  const [lists, setLists] = useState<AnyList[]>([])
  const [connected, setConnected] = useState(false)
  const [newItems, setNewItems] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // Per-list "tamamlananları göster" expanded state. Default: collapsed.
  const [expandedChecked, setExpandedChecked] = useState<Set<string>>(new Set())

  function toggleExpanded(listId: string) {
    setExpandedChecked(prev => {
      const next = new Set(prev)
      if (next.has(listId)) next.delete(listId)
      else next.add(listId)
      return next
    })
  }

  const fetchLists = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const [statusRes, listsRes] = await Promise.all([
        fetch('/api/anylist/status'),
        fetch('/api/anylist/lists'),
      ])
      const statusData = await statusRes.json()
      setConnected(statusData.connected)

      if (statusData.connected) {
        const listsData = await listsRes.json()
        setLists(listsData.data || [])
      }
    } catch { /* ignore */ }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { fetchLists() }, [fetchLists])

  async function addItem(listName: string) {
    const item = newItems[listName]?.trim()
    if (!item) return
    await fetch(`/api/anylist/lists/${encodeURIComponent(listName)}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item }),
    })
    setNewItems(prev => ({ ...prev, [listName]: '' }))
    fetchLists()
  }

  async function toggleItem(listName: string, itemId: string) {
    await fetch(`/api/anylist/lists/${encodeURIComponent(listName)}/items/${itemId}/toggle`, {
      method: 'PATCH',
    })
    fetchLists()
  }

  async function deleteItem(listName: string, itemId: string) {
    await fetch(`/api/anylist/lists/${encodeURIComponent(listName)}/items/${itemId}`, {
      method: 'DELETE',
    })
    fetchLists()
  }

  async function clearChecked(listName: string) {
    await fetch(`/api/anylist/lists/${encodeURIComponent(listName)}/clear-checked`, {
      method: 'POST',
    })
    fetchLists()
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ListChecks className="h-6 w-6" /> Listeler
        </h1>
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ListChecks className="h-6 w-6" /> Listeler
        </h1>
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <WifiOff className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              AnyList bağlantısı kurulamadı. Ayarlardan AnyList bilgilerinizi kontrol edin.
            </p>
            <Button variant="outline" size="sm" onClick={() => fetchLists(true)}>
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              Tekrar Dene
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ListChecks className="h-6 w-6" /> Listeler
        </h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-green-600 border-green-300">
            AnyList bağlı
          </Badge>
          <Button variant="ghost" size="icon" onClick={() => fetchLists(true)}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {lists.map(list => {
        const unchecked = list.items.filter(i => !i.checked)
        const checked = list.items.filter(i => i.checked)

        return (
          <Card key={list.id}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {list.name}
                <span className="text-xs text-muted-foreground ml-auto flex items-center gap-2">
                  {unchecked.length} bekleyen
                  {checked.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-muted-foreground hover:text-red-500"
                      onClick={() => clearChecked(list.name)}
                      title="Tamamlananları temizle"
                    >
                      <CheckCheck className="h-3 w-3 mr-1" />
                      {checked.length} temizle
                    </Button>
                  )}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {/* Unchecked items first */}
              {unchecked.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                  <Button size="icon" variant="ghost" onClick={() => toggleItem(list.name, item.id)}>
                    <Square className="h-4 w-4 text-gray-400" />
                  </Button>
                  <span className="text-sm flex-1">
                    {item.quantity && <span className="text-xs text-muted-foreground mr-1">{item.quantity}</span>}
                    {item.name}
                  </span>
                  <Button size="icon" variant="ghost" onClick={() => deleteItem(list.name, item.id)}>
                    <Trash2 className="h-3 w-3 text-red-300" />
                  </Button>
                </div>
              ))}

              {/* Tamamlananlar — collapsible */}
              {checked.length > 0 && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(list.id)}
                    className="flex items-center gap-1 w-full text-xs text-muted-foreground hover:text-foreground py-1.5 px-2 rounded hover:bg-gray-50"
                  >
                    {expandedChecked.has(list.id)
                      ? <ChevronDown className="h-3 w-3" />
                      : <ChevronRight className="h-3 w-3" />
                    }
                    <span>Tamamlanan ({checked.length})</span>
                  </button>
                  {expandedChecked.has(list.id) && (
                    <div className="space-y-1 mt-1">
                      {checked.map(item => (
                        <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg opacity-50">
                          <Button size="icon" variant="ghost" onClick={() => toggleItem(list.name, item.id)}>
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <span className="text-sm flex-1 line-through text-gray-400">
                            {item.name}
                          </span>
                          <Button size="icon" variant="ghost" onClick={() => deleteItem(list.name, item.id)}>
                            <Trash2 className="h-3 w-3 text-red-300" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Add new item */}
              <div className="flex gap-2 pt-2">
                <Input
                  placeholder="Yeni öğe ekle..."
                  value={newItems[list.name] || ''}
                  onChange={(e) => setNewItems(prev => ({ ...prev, [list.name]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addItem(list.name)}
                  className="text-sm"
                />
                <Button size="sm" onClick={() => addItem(list.name)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}

      {lists.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">AnyList'te henüz liste yok.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
