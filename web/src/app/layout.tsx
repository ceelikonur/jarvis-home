import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { QueryProvider } from '@/components/providers/query-provider'
import { DBHydrationProvider } from '@/components/providers/db-hydration-provider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'J.A.R.V.I.S. — Ev Asistanı',
  description: 'Bütçe yönetimi, görev takibi, alışveriş listeleri ve daha fazlası',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'JARVIS',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#6366f1',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className={inter.className}>
        <QueryProvider>
          <DBHydrationProvider>
            {children}
          </DBHydrationProvider>
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  )
}
