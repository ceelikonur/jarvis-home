'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StickyNote, Trash2 } from 'lucide-react'

interface Note {
  id: number
  content: string
  created_at: string
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch('/api/notes')
      const { data } = await res.json()
      setNotes(data || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  async function deleteNote(id: number) {
    await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    fetchNotes()
  }

  function formatDate(dt: string) {
    try {
      return new Date(dt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    } catch { return dt }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <StickyNote className="h-6 w-6" /> Notlar
      </h1>

      {loading && <p className="text-sm text-muted-foreground">Yükleniyor...</p>}

      {notes.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">Henüz not yok. Telegram&apos;dan not ekleyebilirsin.</p>
      )}

      <div className="space-y-3">
        {notes.map(note => (
          <Card key={note.id}>
            <CardContent className="pt-4">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1">
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                  <p className="text-xs text-muted-foreground mt-2">{formatDate(note.created_at)}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => deleteNote(note.id)}>
                  <Trash2 className="h-4 w-4 text-red-300" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
