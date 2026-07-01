'use client'

import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useCategoriesStore } from '@/lib/stores/categories-store'
import { useInstallmentsStore } from '@/lib/stores/installments-store'
import { TagInput } from '@/components/shared/tag-input'
import { formatCurrency } from '@/lib/utils/currency'
import { merchantStem } from '@/lib/utils/merchant'
import type { Transaction } from '@/lib/types/budget'

interface Props {
  transaction: Transaction | null
  onClose: () => void
}

export function TransactionEditSheet({ transaction: tx, onClose }: Props) {
  const { saveTransactionEdit, getSimilarTransactions, deleteTransaction, getAllTags, updateTransactionInstallment } = useBudgetStore()
  const { categories } = useCategoriesStore()
  const { installments, isLoaded: instLoaded, loadFromDB: loadInstallments, reload: reloadInstallments } = useInstallmentsStore()
  const [category, setCategory] = useState(tx?.category || '')
  // Tags: var olan tags varsa kullan, yoksa subCategory'den başlat
  const initialTags = tx?.tags && tx.tags.length > 0
    ? tx.tags
    : (tx?.subCategory ? [tx.subCategory] : [])
  const [tags, setTags] = useState<string[]>(initialTags)
  // Geçmişe dönük uygula — varsayılan KAPALI; kullanıcı isterse tek tıkla açar
  const [applyToSimilar, setApplyToSimilar] = useState(false)
  const [installmentId, setInstallmentId] = useState<string>(tx?.installment_id != null ? String(tx.installment_id) : 'none')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (!instLoaded) loadInstallments() }, [instLoaded, loadInstallments])

  const allTags = getAllTags()

  // Üst bileşende key prop ile yeniden mount edilerek state sıfırlanır

  if (!tx) return null

  const key = `${new Date(tx.date).toISOString().slice(0,10)}|${tx.source}|${tx.amount}`
  const date = new Date(tx.date)
  const dateStr = isNaN(date.getTime()) ? '-' : date.toLocaleDateString('tr-TR')
  const stem = merchantStem(tx.source)
  const similarCount = getSimilarTransactions(tx.source).length
  // Sadece birden fazla benzer işlem varsa "geçmişe dönük uygula" anlamlı
  const canApplyToSimilar = similarCount > 1
  const effectiveApply = applyToSimilar && canApplyToSimilar

  async function handleSave() {
    if (!tx) return
    setSaving(true)
    try {
      const { updated } = await saveTransactionEdit({ key, source: tx.source, category, tags, applyToSimilar: effectiveApply })
      // Taksit bağlama (tek işlem) — değiştiyse uygula
      const targetInstId = installmentId === 'none' ? null : parseInt(installmentId, 10)
      if (targetInstId !== (tx.installment_id ?? null)) {
        await updateTransactionInstallment(key, targetInstId)
        await reloadInstallments()  // taksit linkedCount'u tazele
      }
      toast.success(effectiveApply && updated > 1 ? `${updated} işlem güncellendi` : 'Kaydedildi')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!tx) return
    if (!window.confirm(`"${tx.source || '—'}" işlemini silmek istediğine emin misin?`)) return
    await deleteTransaction(key)
    onClose()
  }

  return (
    <Sheet open={!!tx} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="w-[400px] sm:w-[480px]">
        <SheetHeader>
          <SheetTitle>İşlemi Düzenle</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          {/* İşlem bilgileri */}
          <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{tx.source || '—'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {dateStr} · {tx.person || tx.bank || tx.account}
                </p>
              </div>
              <span className={`ml-3 font-semibold whitespace-nowrap ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                {tx.type === 'income' ? '+' : ''}{formatCurrency(tx.amount)}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">{tx.subCategory || 'DİĞER'}</Badge>
              {tx.month && <Badge variant="secondary" className="text-xs">{tx.month}</Badge>}
              {tx.is_savings && (
                <Badge variant="outline" className="text-xs border-sky-400 text-sky-700 bg-sky-50">
                  gerçekleşen birikim
                </Badge>
              )}
              {tx.is_internal && (
                <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 bg-amber-50">
                  internal transfer
                </Badge>
              )}
            </div>
          </div>

          {/* Kategori seçici */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Kategori</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Kategori seç..." />
              </SelectTrigger>
              <SelectContent>
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

          {/* Tag'ler */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Etiketler</label>
            <TagInput
              value={tags}
              onChange={setTags}
              suggestions={allTags}
              placeholder="Tag ekle... (Enter veya virgül ile)"
            />
            <p className="text-xs text-muted-foreground">Birden fazla tag ekleyebilirsin. Örn: MARKET, HAFTA SONU</p>
          </div>

          {/* Taksit bağlama */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Taksit</label>
            <Select value={installmentId} onValueChange={setInstallmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Taksit seç..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none"><span className="text-muted-foreground">— Taksit yok —</span></SelectItem>
                {installments.map(i => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.name} · {formatCurrency(i.monthlyAmount)}/ay
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Bu işlem bir taksit ödemesiyse ilgili taksite bağla — taksitte &quot;gerçekleşen ödeme&quot; olarak sayılır.</p>
          </div>

          {/* Geçmişe dönük uygula — aynı satıcının tüm işlemleri */}
          {canApplyToSimilar && (
            <label className="flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                checked={applyToSimilar}
                onChange={e => setApplyToSimilar(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary cursor-pointer"
              />
              <span className="text-sm">
                <span className="font-medium">Aynı satıcının tüm işlemlerine uygula</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  &quot;{stem}&quot; içeren <span className="font-medium">{similarCount}</span> işlem geçmişe dönük güncellenecek.
                </span>
              </span>
            </label>
          )}
        </div>

        <SheetFooter className="mt-8 flex flex-col gap-2">
          <div className="flex gap-2 w-full">
            <Button variant="outline" onClick={onClose} className="flex-1" disabled={saving}>İptal</Button>
            <Button onClick={handleSave} className="flex-1" disabled={saving}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={handleDelete}
            className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            İşlemi Sil
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
