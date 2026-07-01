'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useCategoriesStore } from '@/lib/stores/categories-store'
import type { Category } from '@/lib/stores/categories-store'
import { useTagsStore } from '@/lib/stores/tags-store'
import type { Tag } from '@/lib/stores/tags-store'
import { Plus, Pencil, Trash2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

const EMPTY_CAT: Category = { name: '', color: '#6366f1', is_fixed: false }
const EMPTY_TAG: Tag = { name: '', color: '#6366f1' }

export default function CategoriesPage() {
  const { categories, addCategory, updateCategory, deleteCategory, resetToDefaults } = useCategoriesStore()
  const { tags, loadFromDB: loadTags, addTag, updateTag, deleteTag } = useTagsStore()

  useEffect(() => { loadTags() }, [loadTags])

  // ── Category dialog state ─────────────────────────────────────
  const [catDialog, setCatDialog] = useState(false)
  const [catEditTarget, setCatEditTarget] = useState<string | null>(null)
  const [catForm, setCatForm] = useState<Category>(EMPTY_CAT)
  const [catDeleteConfirm, setCatDeleteConfirm] = useState<string | null>(null)

  // ── Tag dialog state ──────────────────────────────────────────
  const [tagDialog, setTagDialog] = useState(false)
  const [tagEditTarget, setTagEditTarget] = useState<number | null>(null)
  const [tagOriginalName, setTagOriginalName] = useState('')
  const [tagForm, setTagForm] = useState<Tag>(EMPTY_TAG)
  const [tagDeleteConfirm, setTagDeleteConfirm] = useState<Tag | null>(null)

  // ── Category handlers ─────────────────────────────────────────
  function openAddCat() { setCatEditTarget(null); setCatForm(EMPTY_CAT); setCatDialog(true) }
  function openEditCat(cat: Category) { setCatEditTarget(cat.name); setCatForm({ ...cat }); setCatDialog(true) }

  function saveCat() {
    const name = catForm.name.trim()
    if (!name) { toast.error('Kategori adı boş olamaz'); return }
    if (catEditTarget) {
      if (name !== catEditTarget && categories.some(c => c.name === name)) {
        toast.error('Bu isimde bir kategori zaten var'); return
      }
      updateCategory(catEditTarget, { newName: name, color: catForm.color, is_fixed: catForm.is_fixed })
      toast.success('Kategori güncellendi')
    } else {
      if (categories.some(c => c.name === name)) { toast.error('Bu isimde bir kategori zaten var'); return }
      addCategory({ name, color: catForm.color, is_fixed: catForm.is_fixed })
      toast.success('Kategori eklendi')
    }
    setCatDialog(false)
  }

  function doDeleteCat(name: string) {
    deleteCategory(name); setCatDeleteConfirm(null); toast.success(`"${name}" silindi`)
  }

  // ── Tag handlers ──────────────────────────────────────────────
  function openAddTag() { setTagEditTarget(null); setTagOriginalName(''); setTagForm(EMPTY_TAG); setTagDialog(true) }
  function openEditTag(tag: Tag) { setTagEditTarget(tag.id ?? null); setTagOriginalName(tag.name); setTagForm({ ...tag }); setTagDialog(true) }

  async function saveTag() {
    const name = tagForm.name.trim()
    if (!name) { toast.error('Etiket adı boş olamaz'); return }

    if (tagEditTarget !== null) {
      if (name !== tagOriginalName && tags.some(t => t.name === name)) {
        toast.error('Bu isimde bir etiket zaten var'); return
      }
      await updateTag(tagEditTarget, { name, color: tagForm.color })
      toast.success('Etiket güncellendi — tüm işlemler yenilendi')
    } else {
      if (tags.some(t => t.name === name)) { toast.error('Bu isimde bir etiket zaten var'); return }
      await addTag({ name, color: tagForm.color })
      toast.success('Etiket eklendi')
    }
    setTagDialog(false)
  }

  async function doDeleteTag(tag: Tag) {
    if (!tag.id) return
    await deleteTag(tag.id)
    setTagDeleteConfirm(null)
    toast.success(`"${tag.name}" silindi — işlemlerden kaldırıldı`)
  }

  const fixed = categories.filter(c => c.is_fixed)
  const variable = categories.filter(c => !c.is_fixed)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kategoriler &amp; Etiketler</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { resetToDefaults(); toast.success('Varsayılana sıfırlandı') }}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Sıfırla
          </Button>
        </div>
      </div>

      {/* ── Kategoriler ─────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Kategoriler</h2>
          <Button size="sm" onClick={openAddCat}>
            <Plus className="h-4 w-4 mr-2" /> Yeni Kategori
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sabit Giderler ({fixed.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryList categories={fixed} onEdit={openEditCat} onDelete={setCatDeleteConfirm} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Değişken Giderler ({variable.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryList categories={variable} onEdit={openEditCat} onDelete={setCatDeleteConfirm} />
          </CardContent>
        </Card>
      </div>

      {/* ── Etiketler ───────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Etiketler</h2>
            <p className="text-xs text-muted-foreground">NOT/TÜR değerleri — işlemlere otomatik veya manuel atanır.</p>
          </div>
          <Button size="sm" onClick={openAddTag}>
            <Plus className="h-4 w-4 mr-2" /> Yeni Etiket
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tüm Etiketler ({tags.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <TagList tags={tags} onEdit={openEditTag} onDelete={setTagDeleteConfirm} />
          </CardContent>
        </Card>
      </div>

      {/* ── Category dialog ─────────────────────────────────────── */}
      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{catEditTarget ? 'Kategoriyi Düzenle' : 'Yeni Kategori'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FieldName value={catForm.name} onChange={v => setCatForm(f => ({ ...f, name: v }))} onSubmit={saveCat} />
            <FieldColor value={catForm.color} onChange={v => setCatForm(f => ({ ...f, color: v }))} />
            <div className="flex items-center gap-3">
              <input
                id="is_fixed"
                type="checkbox"
                checked={catForm.is_fixed}
                onChange={e => setCatForm(f => ({ ...f, is_fixed: e.target.checked }))}
                className="h-4 w-4 rounded border"
              />
              <Label htmlFor="is_fixed" className="cursor-pointer">
                Sabit gider <span className="text-xs text-muted-foreground">(kira, taksit, fatura gibi)</span>
              </Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCatDialog(false)}>İptal</Button>
            <Button onClick={saveCat}>{catEditTarget ? 'Güncelle' : 'Ekle'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Tag dialog ──────────────────────────────────────────── */}
      <Dialog open={tagDialog} onOpenChange={setTagDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tagEditTarget !== null ? 'Etiketi Düzenle' : 'Yeni Etiket'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FieldName value={tagForm.name} onChange={v => setTagForm(f => ({ ...f, name: v }))} onSubmit={saveTag} />
            <FieldColor value={tagForm.color} onChange={v => setTagForm(f => ({ ...f, color: v }))} />
            {tagEditTarget !== null && tagOriginalName !== tagForm.name && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                Ad değiştirildiğinde tüm işlemlerdeki &quot;{tagOriginalName}&quot; etiketi &quot;{tagForm.name}&quot; olarak güncellenir.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTagDialog(false)}>İptal</Button>
            <Button onClick={saveTag}>{tagEditTarget !== null ? 'Güncelle' : 'Ekle'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirms ─────────────────────────────────────── */}
      <Dialog open={!!catDeleteConfirm} onOpenChange={() => setCatDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Kategoriyi Sil</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            <strong>&quot;{catDeleteConfirm}&quot;</strong> silinecek. Bu kategoriye atanmış işlemler kategorisiz kalır.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCatDeleteConfirm(null)}>İptal</Button>
            <Button variant="destructive" onClick={() => catDeleteConfirm && doDeleteCat(catDeleteConfirm)}>Sil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!tagDeleteConfirm} onOpenChange={() => setTagDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Etiketi Sil</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            <strong>&quot;{tagDeleteConfirm?.name}&quot;</strong> silinecek. Bu etiketi taşıyan işlemlerden etiket kaldırılır.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTagDeleteConfirm(null)}>İptal</Button>
            <Button variant="destructive" onClick={() => tagDeleteConfirm && doDeleteTag(tagDeleteConfirm)}>Sil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────

function FieldName({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  return (
    <div className="space-y-1.5">
      <Label>Ad</Label>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSubmit()}
        autoFocus
      />
    </div>
  )
}

function FieldColor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>Renk</Label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-9 w-16 rounded border cursor-pointer p-0.5"
        />
        <span className="text-sm text-muted-foreground">{value}</span>
        <span className="w-4 h-4 rounded-full border" style={{ backgroundColor: value }} />
      </div>
    </div>
  )
}

function CategoryList({
  categories,
  onEdit,
  onDelete,
}: {
  categories: Category[]
  onEdit: (cat: Category) => void
  onDelete: (name: string) => void
}) {
  if (categories.length === 0) return <p className="text-sm text-muted-foreground py-2">Kategori yok.</p>
  return (
    <div className="divide-y">
      {categories.map(cat => (
        <div key={cat.name} className="flex items-center justify-between py-2.5 group">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
            <span className="text-sm font-medium">{cat.name}</span>
            {cat.is_fixed && <Badge variant="outline" className="text-xs">Sabit</Badge>}
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(cat)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(cat.name)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

function TagList({
  tags,
  onEdit,
  onDelete,
}: {
  tags: Tag[]
  onEdit: (tag: Tag) => void
  onDelete: (tag: Tag) => void
}) {
  if (tags.length === 0) return <p className="text-sm text-muted-foreground py-2">Etiket yok.</p>
  return (
    <div className="divide-y">
      {tags.map(tag => (
        <div key={tag.id ?? tag.name} className="flex items-center justify-between py-2.5 group">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
            <span className="text-sm font-medium">{tag.name}</span>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(tag)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(tag)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
