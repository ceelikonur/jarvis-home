/**
 * Runtime household configuration for the frontend.
 *
 * The real values come from GET /api/budget/household (backed by
 * config/household.json on the server). They are loaded once at app start by
 * the household store, which calls setHouseholdConfig(). Pure, non-React
 * helpers (currency formatting, pay-period detection) read getHousehold()
 * synchronously, so no personal data needs to be hardcoded in the source.
 */

export interface HouseholdAccount {
  id: string
  name: string
  owner: string
  color: string
}

export interface HouseholdUploader {
  id: string
  person: string
  bank: string
  format: 'csv' | 'xlsx'
  accept: string
  label: string
  hint: string
}

export interface HouseholdConfig {
  locale: string
  currency: string
  members: string[]
  banks: string[]
  accounts: HouseholdAccount[]
  uploaders: HouseholdUploader[]
  salaryKeywords: string[]
}

// Neutral defaults — no personal data. Overwritten at runtime by the API.
export const DEFAULT_HOUSEHOLD: HouseholdConfig = {
  locale: 'en-US',
  currency: 'EUR',
  members: [],
  banks: [],
  accounts: [],
  uploaders: [],
  salaryKeywords: ['SALARY', 'PAYROLL', 'GEHALT', 'LOHN', 'MAAŞ'],
}

let current: HouseholdConfig = DEFAULT_HOUSEHOLD

export function getHousehold(): HouseholdConfig {
  return current
}

export function setHouseholdConfig(cfg: Partial<HouseholdConfig>): HouseholdConfig {
  current = { ...DEFAULT_HOUSEHOLD, ...cfg }
  return current
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€', USD: '$', GBP: '£', TRY: '₺', CHF: 'CHF', JPY: '¥',
}

export function currencySymbol(): string {
  return CURRENCY_SYMBOLS[current.currency] || current.currency
}
