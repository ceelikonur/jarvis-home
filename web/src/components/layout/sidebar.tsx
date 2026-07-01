'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'
import {
  LayoutDashboard, FileSpreadsheet, List, BarChart3, PiggyBank,
  Tags, Settings, ShoppingBag, CreditCard,
  CheckSquare, CalendarDays, StickyNote, ListChecks, Brain, Timer, Lightbulb
} from 'lucide-react'

const budgetItems = [
  { href: '/', label: 'Genel Bakış', icon: LayoutDashboard },
  { href: '/ekstreler', label: 'Ekstreler', icon: FileSpreadsheet },
  { href: '/islemler', label: 'İşlemler', icon: List },
  { href: '/analiz', label: 'Analiz', icon: BarChart3 },
  { href: '/tahminler', label: 'Tahminler', icon: Brain },
  { href: '/tasarruf', label: 'Tasarruf', icon: PiggyBank },
  { href: '/taksitler', label: 'Taksitler', icon: CreditCard },
  { href: '/kategoriler', label: 'Kategoriler', icon: Tags },
]

const jarvisItems = [
  { href: '/plan', label: 'Bugünkü Plan', icon: Timer },
  { href: '/gorevler', label: 'Görevler', icon: CheckSquare },
  { href: '/listeler', label: 'Listeler', icon: ListChecks },
  { href: '/takvim', label: 'Takvim', icon: CalendarDays },
  { href: '/notlar', label: 'Notlar', icon: StickyNote },
  { href: '/alisveris-listesi', label: 'Alışveriş', icon: ShoppingBag },
  { href: '/cihazlar', label: 'Cihazlar', icon: Lightbulb },
]

const otherItems = [
  { href: '/ayarlar', label: 'Ayarlar', icon: Settings },
]

function NavSection({ title, items, pathname, onNavigate }: { title: string; items: typeof budgetItems; pathname: string; onNavigate?: () => void }) {
  return (
    <div>
      {title && <p className="px-3 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>}
      {items.map((item) => {
        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <>
      <div className="flex items-center gap-2 h-16 px-6 border-b">
        <span className="text-2xl">🤖</span>
        <div>
          <span className="text-lg font-bold text-gray-900">J.A.R.V.I.S.</span>
          <p className="text-[10px] text-gray-400 -mt-1">Ev Asistanı</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        <NavSection title="Bütçe" items={budgetItems} pathname={pathname} onNavigate={onNavigate} />
        <NavSection title="Ev Yönetimi" items={jarvisItems} pathname={pathname} onNavigate={onNavigate} />
        <NavSection title="" items={otherItems} pathname={pathname} onNavigate={onNavigate} />
      </nav>
    </>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
      <div className="flex flex-col flex-grow border-r bg-white">
        <SidebarContent />
      </div>
    </aside>
  )
}

export function MobileSidebar() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
