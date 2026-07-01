'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import {
  LayoutDashboard, List, Brain, CalendarDays, MoreHorizontal,
  FileSpreadsheet, BarChart3, PiggyBank, Tags, Settings,
  ShoppingBag, CreditCard, CheckSquare, StickyNote, ListChecks, Timer, Lightbulb,
} from 'lucide-react'

// 4 most-used routes for thumbs (en sık erişilenler) + "Daha"
const primaryItems = [
  { href: '/', label: 'Genel', icon: LayoutDashboard, exact: true },
  { href: '/islemler', label: 'İşlemler', icon: List },
  { href: '/tahminler', label: 'Tahmin', icon: Brain },
  { href: '/takvim', label: 'Takvim', icon: CalendarDays },
]

const allItems = {
  Bütçe: [
    { href: '/', label: 'Genel Bakış', icon: LayoutDashboard },
    { href: '/ekstreler', label: 'Ekstreler', icon: FileSpreadsheet },
    { href: '/islemler', label: 'İşlemler', icon: List },
    { href: '/analiz', label: 'Analiz', icon: BarChart3 },
    { href: '/tahminler', label: 'Tahminler', icon: Brain },
    { href: '/tasarruf', label: 'Tasarruf', icon: PiggyBank },
    { href: '/taksitler', label: 'Taksitler', icon: CreditCard },
    { href: '/kategoriler', label: 'Kategoriler', icon: Tags },
  ],
  'Ev Yönetimi': [
    { href: '/plan', label: 'Bugünkü Plan', icon: Timer },
    { href: '/gorevler', label: 'Görevler', icon: CheckSquare },
    { href: '/listeler', label: 'Listeler', icon: ListChecks },
    { href: '/takvim', label: 'Takvim', icon: CalendarDays },
    { href: '/notlar', label: 'Notlar', icon: StickyNote },
    { href: '/alisveris-listesi', label: 'Alışveriş', icon: ShoppingBag },
    { href: '/cihazlar', label: 'Cihazlar', icon: Lightbulb },
  ],
  '': [
    { href: '/ayarlar', label: 'Ayarlar', icon: Settings },
  ],
}

export function BottomNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 lg:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch justify-around">
          {primaryItems.map(item => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors active:bg-gray-100',
                  isActive ? 'text-primary' : 'text-gray-500'
                )}
              >
                {isActive && <span className="absolute top-0 h-0.5 w-8 bg-primary rounded-full" />}
                <item.icon className={cn('h-5 w-5', isActive && 'stroke-[2.5]')} />
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
              </Link>
            )
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors active:bg-gray-100 text-gray-500'
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-tight">Daha</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto p-0">
          <div className="px-4 pt-4 pb-2 border-b">
            <h2 className="text-base font-semibold">Tüm Menü</h2>
          </div>
          <div className="p-4 space-y-5">
            {Object.entries(allItems).map(([section, items]) => (
              <div key={section || 'misc'}>
                {section && (
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">{section}</p>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {items.map(item => {
                    const isActive = pathname === item.href
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                        className={cn(
                          'flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border transition-colors min-h-[80px]',
                          isActive
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'border-gray-200 hover:bg-gray-50'
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
