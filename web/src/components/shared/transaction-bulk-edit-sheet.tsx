'use client'

import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useCategoriesStore } from '@/lib/stores/categories-store'
import { TagInput } from '@/components/shared/tag-input'

const KEEP = '__keep__' // "kategoriyi değiştirme" sentinel

interface Props {
  keys: string[] | null
  onClose: () => void
  onApplied?: () => void
}

export function TransactionBulkEditSheet({ keys, onClose, onApplied }: Props) {
  const { bulkUpdateTransactions, getAllTags } = useBudgetStore()
  const { categories } = useCategoriesStore()
  const [category, setCategory] = useState<string>(KEEP)
  const [tags, setTags] = useState<string[]>([])
  const [tagsMode, setTagsMode] = useState<'replace' | 'append'>('replace')
  const [saving, setSaving] = useState(false)

  const allTags = getAllTags()
  const count = keys?.length ?? 0

  // Üst bileşende key prop ile remount edilerek state sıfırlanır
  if (!keys) return null

  const willSetCategory = category !== KEEP
  const willSetTags = tags.length > 0
  const canApply = (willSetCategory || willSetTags) && !saving

  async function handleApply() {
    if (!keys || !canApply) return
    setSaving(true)
    try {
      const { updated } = await bulkUpdateTransactions(keys, {
        category: willSetCategory ? category : undefined,
        tags: willSetTags ? tags : undefined,
        tagsMode,
      })
      toast.success(`${updated} işlem güncellendi`)
      onApplied?.()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Güncellenemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={!!keys} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="w-[400px] sm:w-[480px]">
        <SheetHeader>
          <SheetTitle>Toplu Düzenle — {count} işlem</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          <p className="text-sm text-muted-foreground">
            Seçili <span className="font-medium text-foreground">{count}</span> işlem için kategori ve/veya etiketleri
            tek seferde ayarla. Boş bıraktığın alan değişmez.
          </p>

          {/* Kategori */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Kategori</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Kategori seç..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>
                  <span className="text-muted-foreground">— Değiştirme —</span>
                </SelectItem>
                {categories.map(c => (
                  <SelectItem key={c.name} value={c.name}>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: c.color }} />
                      {c.name}
                      {!!c.is_fixed && <span className="text-xs text-muted-foreground ml-1">(sabit)</span>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Etiketler */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Etiketler</label>
              {willSetTags && (
                <div className="flex gap-1 rounded-md border p-0.5">
                  <button
                    type="button"
                    onClick={() => setTagsMode('replace')}
                    className={`text-xs px-2 py-0.5 rounded ${tagsMode === 'replace' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Değiştir
                  </button>
                  <button
                    type="button"
                    onClick={() => setTagsMode('append')}
                    className={`text-xs px-2 py-0.5 rounded ${tagsMode === 'append' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Ekle
                  </button>
                </div>
              )}
            </div>
            <TagInput
              value={tags}
              onChange={setTags}
              suggestions={allTags}
              placeholder="Tag ekle... (Enter veya virgül ile)"
            />
            <p className="text-xs text-muted-foreground">
              {willSetTags
                ? (tagsMode === 'replace'
                    ? 'Seçili işlemlerin etiketleri bunlarla değiştirilecek.'
                    : 'Bu etiketler mevcut etiketlerin üzerine eklenecek.')
                : 'Boş bırakırsan etiketler değişmez.'}
            </p>
          </div>
        </div>

        <SheetFooter className="mt-8 flex flex-col gap-2">
          <div className="flex gap-2 w-full">
            <Button variant="outline" onClick={onClose} className="flex-1" disabled={saving}>İptal</Button>
            <Button onClick={handleApply} className="flex-1" disabled={!canApply}>
              {saving ? 'Uygulanıyor…' : `Uygula (${count})`}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
