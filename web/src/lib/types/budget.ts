export interface Transaction {
  id?: number
  account: string
  month: string
  person: string | null
  bank: string | null
  date: Date
  source: string
  type: 'income' | 'expense'
  amount: number
  subCategory: string
  sub_category?: string
  category: string
  tags?: string[]
  is_internal?: boolean
  is_savings?: boolean
  installment_id?: number | null
}

export interface MonthlyBudget {
  month: string
  categories: {
    name: string
    projected: number
    actual: number
  }[]
  totalProjected: number
  totalActual: number
  income: number
  savingsTarget: number
  savingsTransfer: number
}

export interface WishlistItem {
  checked: boolean
  product: string
  price: number | null
  status: string
}

export interface Installment {
  name: string
  total: number
  installmentCount: number
  paidCount: number
  finalDate: Date | null
  monthlyAmount: number
  remaining: number
}

export interface BudgetData {
  transactions: Transaction[]
  monthlyBudgets: MonthlyBudget[]
  wishlist: WishlistItem[]
  installments: Installment[]
}
