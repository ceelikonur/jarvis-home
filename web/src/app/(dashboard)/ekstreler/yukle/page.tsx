'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileSpreadsheet, FileText, X, CheckCircle2, Trash2, Loader2 } from 'lucide-react'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useHouseholdStore } from '@/lib/stores/household-store'
import type { HouseholdUploader } from '@/lib/config/household-config'

type SlotState = {
  file: File | null
  uploading: boolean
  error: string
  result: { transactions: number; inserted: number; existing: number; months: number } | null
}

const EMPTY_STATE: SlotState = { file: null, uploading: false, error: '', result: null }

export default function UploadPage() {
  const router = useRouter()
  const { deleteAllTransactions } = useBudgetStore()
  const { config, isLoaded, load } = useHouseholdStore()
  const slots = config.uploaders

  const [resetting, setResetting] = useState(false)
  const [resetInfo, setResetInfo] = useState<string | null>(null)
  const [states, setStates] = useState<Record<string, SlotState>>({})

  useEffect(() => {
    if (!isLoaded) load()
  }, [isLoaded, load])

  function stateFor(id: string): SlotState {
    return states[id] || EMPTY_STATE
  }

  async function handleReset() {
    if (!window.confirm('Tüm işlem verilerini silmek istediğinden emin misin? Bu geri alınamaz.')) return
    setResetting(true)
    setResetInfo(null)
    try {
      const deleted = await deleteAllTransactions()
      setResetInfo(`${deleted} işlem silindi. Artık yeni ekstre yükleyebilirsin.`)
      setStates({})
    } catch {
      setResetInfo('Sıfırlama sırasında hata oluştu.')
    } finally {
      setResetting(false)
    }
  }

  function update(id: string, patch: Partial<SlotState>) {
    setStates((prev) => ({ ...prev, [id]: { ...(prev[id] || EMPTY_STATE), ...patch } }))
  }

  function reset(id: string) {
    update(id, { ...EMPTY_STATE })
  }

  function validateFile(slot: HouseholdUploader, file: File): string {
    const name = file.name.toLowerCase()
    if (slot.format === 'csv' && !name.endsWith('.csv')) {
      return `${slot.person} için yalnızca .csv dosyası yükleyin.`
    }
    if (slot.format === 'xlsx' && !(name.endsWith('.xlsx') || name.endsWith('.xls'))) {
      return `${slot.person} için yalnızca .xlsx dosyası yükleyin.`
    }
    return ''
  }

  async function handleUpload(slot: HouseholdUploader) {
    const state = stateFor(slot.id)
    if (!state.file) return
    update(slot.id, { uploading: true, error: '' })

    try {
      const formData = new FormData()
      formData.append('file', state.file)
      formData.append('person', slot.person)
      formData.append('bank', slot.bank)
      formData.append('requireFormat', slot.format)

      const response = await fetch('/api/budget/upload', { method: 'POST', body: formData })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || 'Dosya işlenirken hata oluştu')
      }

      update(slot.id, {
        uploading: false,
        result: {
          transactions: data.transactions || 0,
          inserted: data.inserted || 0,
          existing: data.existing || 0,
          months: data.monthlyBudgets || 0,
        },
      })
      useBudgetStore.setState({ isLoaded: false })
    } catch (err) {
      update(slot.id, {
        uploading: false,
        error: err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu',
      })
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dosya Yükle</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Her kişi kendi banka ekstresini ilgili tuşla yükler. Yükleyiciler ve formatlar
            config/household.json dosyasından gelir.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          disabled={resetting}
          className="text-destructive border-destructive/30 hover:bg-destructive/10"
        >
          {resetting
            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            : <Trash2 className="h-4 w-4 mr-2" />}
          Tüm verileri sıfırla
        </Button>
      </div>

      <div className="text-xs rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900">
        <strong>Her ay inkrementel yükleme:</strong> Yeni ekstre (son yüklemeden bugüne) yüklendiğinde geçmiş işlemler korunur.
        Aynı tarih + kaynak + tutar eşleşirse satır atlanır; senin kategori/etiket düzeltmelerin bozulmaz.
        Tam silme sadece yukarıdaki <em>Tüm verileri sıfırla</em> tuşuyla mümkündür.
      </div>

      {resetInfo && (
        <div className="text-sm rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground">
          {resetInfo}
        </div>
      )}

      {slots.length === 0 ? (
        <div className="text-sm rounded-md border bg-muted/40 px-4 py-6 text-center text-muted-foreground">
          {isLoaded
            ? 'Henüz yükleyici tanımlı değil. config/household.json içindeki "uploaders" listesini doldur.'
            : 'Yükleniyor…'}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {slots.map((slot) => {
            const state = stateFor(slot.id)
            return (
              <Card key={slot.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {slot.format === 'csv'
                      ? <FileText className="h-5 w-5 text-blue-600" />
                      : <FileSpreadsheet className="h-5 w-5 text-green-600" />}
                    {slot.label}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{slot.hint}</p>
                </CardHeader>
                <CardContent>
                  {state.result ? (
                    <div className="text-center py-4">
                      <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
                      <p className="font-medium mb-1">Başarıyla yüklendi</p>
                      <p className="text-sm mb-1">
                        <span className="text-green-600 font-medium">{state.result.inserted} yeni</span>
                        {' · '}
                        <span className="text-muted-foreground">{state.result.existing} mevcut (korundu)</span>
                      </p>
                      <p className="text-xs text-muted-foreground mb-4">
                        Dosyada toplam {state.result.transactions} işlem vardı
                      </p>
                      <div className="flex gap-2 justify-center">
                        <Button size="sm" onClick={() => router.push('/')}>Dashboard</Button>
                        <Button size="sm" variant="outline" onClick={() => reset(slot.id)}>
                          Yenisini yükle
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                        {state.file ? (
                          <div className="flex items-center justify-center gap-3">
                            {slot.format === 'csv'
                              ? <FileText className="h-8 w-8 text-blue-600" />
                              : <FileSpreadsheet className="h-8 w-8 text-green-600" />}
                            <div className="text-left">
                              <p className="font-medium text-sm">{state.file.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {(state.file.size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => update(slot.id, { file: null, error: '' })}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            {slot.format === 'csv'
                              ? <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                              : <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />}
                            <p className="text-sm text-muted-foreground mb-3">
                              Yalnızca {slot.accept}
                            </p>
                            <label>
                              <input
                                type="file"
                                className="hidden"
                                accept={slot.accept}
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  const error = validateFile(slot, file)
                                  if (error) {
                                    update(slot.id, { file: null, error })
                                  } else {
                                    update(slot.id, { file, error: '' })
                                  }
                                  e.target.value = ''
                                }}
                              />
                              <Button variant="outline" size="sm" asChild>
                                <span>Dosya Seç</span>
                              </Button>
                            </label>
                          </>
                        )}
                      </div>

                      {state.error && (
                        <p className="text-sm text-red-500 mt-3">{state.error}</p>
                      )}

                      {state.file && (
                        <Button
                          className="w-full mt-4"
                          onClick={() => handleUpload(slot)}
                          disabled={state.uploading}
                        >
                          {state.uploading ? 'İşleniyor...' : `${slot.person} olarak yükle`}
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
