export const BUDGET_CATEGORIES = [
  { name: 'Ev Sabit Giderleri', icon: 'Home', color: '#8b5cf6', is_fixed: true },
  { name: 'Normal Harcama', icon: 'ShoppingBag', color: '#22c55e', is_fixed: false },
  { name: 'Beklenmedik Harcama', icon: 'AlertTriangle', color: '#ef4444', is_fixed: false },
  { name: 'Ulaşım', icon: 'Car', color: '#3b82f6', is_fixed: false },
  { name: 'Kültür&Spor&Gastro', icon: 'Dumbbell', color: '#a855f7', is_fixed: false },
  { name: 'Taksit', icon: 'CreditCard', color: '#f97316', is_fixed: true },
  { name: 'Okul Kredileri', icon: 'GraduationCap', color: '#06b6d4', is_fixed: true },
  { name: 'Kredi Kartı Borç Ödeme', icon: 'Landmark', color: '#dc2626', is_fixed: true },
  { name: 'Burs', icon: 'Heart', color: '#ec4899', is_fixed: true },
  { name: 'Tatil', icon: 'Plane', color: '#14b8a6', is_fixed: false },
  { name: 'Taşınma', icon: 'Truck', color: '#78716c', is_fixed: false },
  { name: 'Birikim', icon: 'PiggyBank', color: '#10b981', is_fixed: false },
  { name: 'BES', icon: 'TrendingUp', color: '#0ea5e9', is_fixed: true },
  { name: 'Dava', icon: 'Scale', color: '#737373', is_fixed: true },
  { name: 'Gelir', icon: 'Wallet', color: '#16a34a', is_fixed: false },
  { name: 'Finlandiya', icon: 'MapPin', color: '#6366f1', is_fixed: false },
] as const

export const SUB_CATEGORIES = [
  'DIŞARIDA YEMEK', 'MARKET ALIŞVERİŞ', 'APP/ÜYELİK',
  'KİŞİSEL/KIYAFET ALIŞVERİŞ/EV EŞYASI', 'ULAŞIM', 'ENTERTAINMENT',
  'CASH WITHDRAWAL', 'FATURA', 'BEKLENMEDİK', 'KİRA',
  'VERGİ/FAİZ/CEZA', 'TAŞINMA', 'TATIL', 'Sigorta',
  'SPOR', 'BAKIM & KOZMETİK', 'SAĞLIK', 'MAAŞ', 'DİĞER',
] as const

// Bank/account list now comes from config/household.json via the household
// store (useHouseholdStore) and GET /api/budget/household — see
// web/src/lib/config/household-config.ts. Nothing personal is hardcoded here.

export const CURRENCY = 'EUR'
export const CURRENCY_SYMBOL = '€'
export const LOCALE = 'de-DE'

export const BUDGET_RULES = {
  needs: 0.50,
  wants: 0.30,
  savings: 0.20,
} as const

export const NEEDS_CATEGORIES = ['Ev Sabit Giderleri', 'Ulaşım', 'Okul Kredileri', 'Dava']
export const WANTS_CATEGORIES = ['Normal Harcama', 'Kültür&Spor&Gastro', 'Tatil']
export const DEBT_CATEGORIES = ['Kredi Kartı Borç Ödeme', 'Taksit']
