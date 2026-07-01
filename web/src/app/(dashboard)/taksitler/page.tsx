'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CreditCard, Plus, Pencil, Trash2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useInstallmentsStore, type Installment } from '@/lib/stores/installments-store'
import { formatCurrency } from '@/lib/utils/currency'

const emptyForm = { name: '', total: '', installmentCount: '', startDate: '' }

// Ödenen taksit / kalan / sonraki ödeme türet.
// Bağlı (gerçekleşen) ödeme varsa onları kullan; yoksa tarih bazlı tahmin et.
function derive(inst: Installment) {
  const count = inst.installmentCount || 0
  const monthly = inst.monthlyAmount || 0
  const linkedCount = inst.linkedCount || 0

  let paid: number
  let paidAmount: number
  const linked = linkedCount > 0
  if (linked) {
    paid = Math.min(count, linkedCount)
    paidAmount = inst.linkedPaid || 0
  } else {
    paid = 0
    if (inst.startDate) {
      const start = new Date(inst.startDate)
      const today = new Date()
      if (!isNaN(start.getTime()) && today >= start) {
        let m = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth())
        if (today.getDate() >= start.getDate()) m += 1
        paid = Math.max(0, Math.min(count, m))
      }
    }
    paidAmount = paid * monthly
  }
  const remaining = Math.max(0, linked ? (inst.total - paidAmount) : (count - paid) * monthly)
  let next: Date | null = null
  if (inst.startDate && paid < count) {
    const s = new Date(inst.startDate)
    next = new Date(s.getFullYear(), s.getMonth() + paid, s.getDate())
  }
  return { paid, paidAmount, remaining, next, linked, linkedCount, percent: count > 0 ? (paid / count) * 100 : 0, done: count > 0 && paid >= count }
}

const fmtDate = (d: string | Date | null) => {
  if (!d) return '-'
  const date = new Date(d)
  return isNaN(date.getTime()) ? '-' : date.toLocaleDateString('tr-TR')
}

export default function InstallmentsPage() {
  const { installments, isLoaded, loadFromDB, addInstallment, updateInstallment, deleteInstallment } = useInstallmentsStore()

  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (!isLoaded) loadFromDB() }, [isLoaded, loadFromDB])

  const totalEntered = parseFloat(form.total) || 0
  const countEntered = parseInt(form.installmentCount, 10) || 0
  const monthlyPreview = countEntered > 0 ? totalEntered / countEntered : 0
  const canSave = !!form.name.trim() && totalEntered > 0 && countEntered > 0 && !!form.startDate && !saving

  // Özet (devam eden taksitler)
  const derived = installments.map(i => ({ inst: i, d: derive(i) }))
  const totalMonthly = derived.filter(x => !x.d.done).reduce((s, x) => s + (x.inst.monthlyAmount || 0), 0)
  const totalRemaining = derived.reduce((s, x) => s + x.d.remaining, 0)

  function resetForm() { setForm(emptyForm); setEditId(null); setShowForm(false) }

  function startAdd() { setForm(emptyForm); setEditId(null); setShowForm(true) }

  function startEdit(inst: Installment) {
    setEditId(inst.id ?? null)
    setForm({
      name: inst.name,
      total: String(inst.total ?? ''),
      installmentCount: String(inst.installmentCount ?? ''),
      startDate: inst.startDate ?? '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      total: totalEntered,
      installmentCount: countEntered,
      startDate: form.startDate,
    }
    try {
      if (editId) await updateInstallment(editId, payload)
      else await addInstallment(payload)
      toast.success(editId ? 'Taksit güncellendi' : 'Taksit eklendi')
      resetForm()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(inst: Installment) {
    if (!inst.id) return
    if (!window.confirm(`"${inst.name}" taksitini silmek istediğine emin misin?`)) return
    await deleteInstallment(inst.id)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Taksitler</h1>
        <div className="flex items-center gap-4">
          {installments.length > 0 && (
            <div className="text-right text-sm">
              <p className="text-muted-foreground">Aylık toplam: <span className="font-semibold text-foreground">{formatCurrency(totalMonthly)}</span></p>
              <p className="text-muted-foreground">Kalan toplam: <span className="font-semibold text-foreground">{formatCurrency(totalRemaining)}</span></p>
            </div>
          )}
          <Button onClick={startAdd}><Plus className="h-4 w-4 mr-1.5" /> Taksit Ekle</Button>
        </div>
      </div>

      {/* Ekle / Düzenle formu */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{editId ? 'Taksiti Düzenle' : 'Yeni Taksit'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Ad</label>
                <Input placeholder="ör. iPhone 15 taksiti" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">İlk ödeme tarihi</label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Toplam tutar (€)</label>
                <Input type="number" step="0.01" placeholder="500" value={form.total} onChange={e => setForm(f => ({ ...f, total: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Taksit sayısı</label>
                <Input type="number" placeholder="10" value={form.installmentCount} onChange={e => setForm(f => ({ ...f, installmentCount: e.target.value }))} />
              </div>
            </div>
            {monthlyPreview > 0 && (
              <p className="text-xs text-muted-foreground">
                Aylık taksit: <span className="font-medium text-foreground">{formatCurrency(monthlyPreview)}</span>
                {countEntered > 0 && form.startDate && (
                  <> · Son ödeme: {fmtDate(new Date(new Date(form.startDate).getFullYear(), new Date(form.startDate).getMonth() + countEntered - 1, new Date(form.startDate).getDate()))}</>
                )}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <Button onClick={handleSave} disabled={!canSave}>
                <Check className="h-4 w-4 mr-1.5" /> {saving ? 'Kaydediliyor…' : (editId ? 'Güncelle' : 'Ekle')}
              </Button>
              <Button variant="outline" onClick={resetForm}>İptal</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Liste */}
      {installments.length === 0 && !showForm ? (
        <Card className="text-center py-12">
          <CardContent>
            <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">Henüz taksit yok. Kendi taksitlerini ekleyerek takip etmeye başla.</p>
            <Button onClick={startAdd}><Plus className="h-4 w-4 mr-1.5" /> İlk Taksiti Ekle</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {derived.map(({ inst, d }) => (
            <Card key={inst.id} className={d.done ? 'opacity-70' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{inst.name}</CardTitle>
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => startEdit(inst)} className="text-muted-foreground hover:text-foreground p-1" aria-label="Düzenle"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(inst)} className="text-muted-foreground hover:text-destructive p-1" aria-label="Sil"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Toplam</span><span className="font-medium">{formatCurrency(inst.total)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Aylık</span><span className="font-medium">{formatCurrency(inst.monthlyAmount)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Ödenen</span><span className="font-medium text-green-600">{formatCurrency(d.paidAmount)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Kalan</span><span className="font-medium text-red-600">{formatCurrency(d.remaining)}</span></div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{d.paid}/{inst.installmentCount} taksit ödendi</span>
                    {d.done
                      ? <span className="text-green-600 font-medium">Tamamlandı ✓</span>
                      : <span>Sonraki: {fmtDate(d.next)}</span>}
                  </div>
                  <Progress value={d.percent} className="h-2" />
                </div>
                <p className="text-[11px]">
                  {d.linked
                    ? <span className="text-green-600">● {d.linkedCount} bağlı ödeme (gerçekleşen)</span>
                    : <span className="text-muted-foreground">○ Tarih bazlı tahmin — işlemleri bu taksite bağlayabilirsin</span>}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  İlk ödeme: {fmtDate(inst.startDate)} · Son ödeme: {fmtDate(inst.finalDate)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
