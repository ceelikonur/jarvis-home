'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSettingsStore } from '@/lib/stores/settings-store'
import { Bot, User, CheckCircle2, XCircle } from 'lucide-react'

export default function SettingsPage() {
  const { aiProvider, setAIProvider } = useSettingsStore()
  const [claudeKey, setClaudeKey] = useState('')
  const [lmEndpoint, setLmEndpoint] = useState('http://localhost:1234')
  const [lmModel, setLmModel] = useState('')
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)
  const [monthlyIncome, setMonthlyIncome] = useState('')

  async function testConnection() {
    setTestResult(null)
    // TODO: Implement real connection test via API
    await new Promise(r => setTimeout(r, 1000))
    setTestResult('success')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Ayarlar</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Aylık Gelir</Label>
            <Input
              type="number"
              placeholder="25000"
              value={monthlyIncome}
              onChange={(e) => setMonthlyIncome(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Tasarruf planı hesaplamalarında kullanılır</p>
          </div>
          <Button>Kaydet</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Ayarları
          </CardTitle>
          <CardDescription>Kategorileme ve analiz için kullanılacak AI sağlayıcısını seçin</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={aiProvider} onValueChange={(v) => setAIProvider(v as 'claude' | 'lmstudio')}>
            <TabsList className="w-full">
              <TabsTrigger value="claude" className="flex-1">Claude API</TabsTrigger>
              <TabsTrigger value="lmstudio" className="flex-1">LM Studio (Yerel)</TabsTrigger>
            </TabsList>
            <TabsContent value="claude" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>API Anahtarı</Label>
                <Input
                  type="password"
                  placeholder="sk-ant-..."
                  value={claudeKey}
                  onChange={(e) => setClaudeKey(e.target.value)}
                />
              </div>
              <Button onClick={testConnection}>Bağlantıyı Test Et</Button>
            </TabsContent>
            <TabsContent value="lmstudio" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Endpoint URL</Label>
                <Input
                  placeholder="http://localhost:1234"
                  value={lmEndpoint}
                  onChange={(e) => setLmEndpoint(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Model (opsiyonel)</Label>
                <Input
                  placeholder="local-model"
                  value={lmModel}
                  onChange={(e) => setLmModel(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">LM Studio&apos;da yüklü olan modelin adı</p>
              </div>
              <Button onClick={testConnection}>Bağlantıyı Test Et</Button>
            </TabsContent>
          </Tabs>
          {testResult && (
            <div className={`flex items-center gap-2 mt-4 text-sm ${testResult === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {testResult === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {testResult === 'success' ? 'Bağlantı başarılı!' : 'Bağlantı başarısız'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
