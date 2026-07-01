'use client'

import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil, Trash2, Play } from 'lucide-react'
import { toast } from 'sonner'
import { useRulesStore, type Rule } from '@/lib/stores/rules-store'
import { useCategoriesStore } from '@/lib/stores/categories-store'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useHouseholdStore } from '@/lib/stores/household-store'

const ANY = '__any__'

const emptyForm = {
  name: '', match_source: '', match_amount: '', match_person: ANY, match_type: ANY, set_category: ANY, set_tag: ANY,
}

interface Props {
  open: boolean
  onClose: () => void
}

export function TransactionRulesSheet({ open, onClose }: Props) {
  const { rules, isLoaded, loadFromDB, addRule, updateRule, deleteRule, applyAll } = useRulesStore()
  const { categories } = useCategoriesStore()
  const { getAllTags, reloadTransactions } = useBudgetStore()
  const { config: household } = useHouseholdStore()
  const allTags = getAllTags()

  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)

  useEffect(() => { if (open && !isLoaded) loadFromDB() }, [open, isLoaded, loadFromDB])

  function resetForm() { setForm(emptyForm); setEditId(null) }

  function startEdit(r: Rule) {
    setEditId(r.id ?? null)
    setForm({
      name: r.name,
      match_source: r.match_source ?? '',
      match_amount: r.match_amount != null ? String(r.match_amount) : '',
      match_person: r.match_person ?? ANY,
      match_type: r.match_type ?? ANY,
      set_category: r.set_category ?? ANY,
      set_tag: r.set_tag ?? ANY,
    })
  }

  const hasCondition = !!(form.match_source.trim() || form.match_amount.trim() || form.match_person !== ANY || form.match_type !== ANY)
  const hasAction = form.set_category !== ANY || form.set_tag !== ANY
  const canSave = !!form.name.trim() && hasCondition && hasAction && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      enabled: true,
      match_source: form.match_source.trim() || null,
      match_amount: form.match_amount.trim() ? parseFloat(form.match_amount) : null,
      match_person: form.match_person === ANY ? null : form.match_person,
      match_type: form.match_type === ANY ? null : (form.match_type as 'income' | 'expense'),
      set_category: form.set_category === ANY ? null : form.set_category,
      set_tag: form.set_tag === ANY ? null : form.set_tag,
      priority: 0,
    }
    try {
      if (editId) await updateRule(editId, payload)
      else await addRule(payload)
      toast.success(editId ? 'Kural güncellendi' : 'Kural eklendi')
      resetForm()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setSaving(false)
    }
  }

  async function handleApplyAll() {
    setApplying(true)
    try {
      const { updated, rules: n } = await applyAll()
      await reloadTransactions()
      toast.success(`${n} kural uygulandı — ${updated} işlem güncellendi`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setApplying(false)
    }
  }

  function ruleSummary(r: Rule) {
    const cond: string[] = []
    if (r.match_source) cond.push(`"${r.match_source}" içerir`)
    if (r.match_amount != null) cond.push(`${r.match_amount}€`)
    if (r.match_person) cond.push(r.match_person)
    if (r.match_type) cond.push(r.match_type === 'income' ? 'Gelir' : 'Gider')
    const act: string[] = []
    if (r.set_category) act.push(r.set_category)
    if (r.set_tag) act.push(`#${r.set_tag}`)
    return `${cond.join(' · ') || 'herhangi'} → ${act.join(' · ') || '—'}`
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-[440px] sm:w-[560px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>İşlem Kuralları</SheetTitle>
        </SheetHeader>
        <p className="text-sm text-muted-foreground mt-1">
          Mail kuralları gibi: koşullara uyan işlemlere otomatik kategori/etiket atanır. Yeni yüklemelerde otomatik çalışır; geçmişe uygulamak için &quot;Tümüne Uygula&quot;.
        </p>

        {/* Form */}
        <div className="mt-5 rounded-lg border p-4 space-y-3">
          <div className="text-sm font-medium">{editId ? 'Kuralı Düzenle' : 'Yeni Kural'}</div>
          <Input placeholder="Kural adı (ör. Kendi hesabıma 100€)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />

          <div className="text-xs font-semibold text-muted-foreground pt-1">EŞLEŞME (koşullar — boş bıraktığın aranmaz)</div>
          <Input placeholder="Açıklama/kaynak içerir (ör. ONUR CELIK)" value={form.match_source} onChange={e => setForm(f => ({ ...f, match_source: e.target.value }))} />
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Tutar €" type="number" value={form.match_amount} onChange={e => setForm(f => ({ ...f, match_amount: e.target.value }))} />
            <Select value={form.match_person} onValueChange={v => setForm(f => ({ ...f, match_person: v }))}>
              <SelectTrigger><SelectValue placeholder="Kişi" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Herkes</SelectItem>
                {household.members.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={form.match_type} onValueChange={v => setForm(f => ({ ...f, match_type: v }))}>
              <SelectTrigger><SelectValue placeholder="Tür" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tümü</SelectItem>
                <SelectItem value="expense">Gider</SelectItem>
                <SelectItem value="income">Gelir</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-xs font-semibold text-muted-foreground pt-1">AKSİYON</div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.set_category} onValueChange={v => setForm(f => ({ ...f, set_category: v }))}>
              <SelectTrigger><SelectValue placeholder="Kategori ata" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>— Kategori —</SelectItem>
                {categories.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.set_tag} onValueChange={v => setForm(f => ({ ...f, set_tag: v }))}>
              <SelectTrigger><SelectValue placeholder="Etiket ekle" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>— Etiket —</SelectItem>
                {allTags.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={handleSave} disabled={!canSave} className="flex-1">{editId ? 'Güncelle' : 'Ekle'}</Button>
            {editId && <Button variant="outline" onClick={resetForm}>İptal</Button>}
          </div>
          {!hasAction && <p className="text-xs text-amber-600">En az bir aksiyon (kategori veya etiket) seç.</p>}
        </div>

        {/* Apply all */}
        <div className="mt-4">
          <Button variant="outline" className="w-full" onClick={handleApplyAll} disabled={applying || rules.length === 0}>
            <Play className="h-4 w-4 mr-2" /> {applying ? 'Uygulanıyor…' : 'Kuralları tüm geçmiş işlemlere uygula'}
          </Button>
        </div>

        {/* Rule list */}
        <div className="mt-5 space-y-2 pb-6">
          <div className="text-sm font-medium">Kurallar ({rules.length})</div>
          {rules.length === 0 && <p className="text-sm text-muted-foreground">Henüz kural yok.</p>}
          {rules.map(r => (
            <div key={r.id} className={`rounded-lg border p-3 flex items-start gap-2 ${r.enabled ? '' : 'opacity-60'}`}>
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={() => r.id && updateRule(r.id, { enabled: !r.enabled })}
                className="mt-1 h-4 w-4 accent-primary cursor-pointer"
                aria-label="Kuralı aç/kapat"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground break-words">{ruleSummary(r)}</div>
              </div>
              <button onClick={() => startEdit(r)} className="text-muted-foreground hover:text-foreground p-1" aria-label="Düzenle"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => r.id && deleteRule(r.id)} className="text-muted-foreground hover:text-destructive p-1" aria-label="Sil"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
