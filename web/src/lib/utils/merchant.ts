// Satıcı (merchant) eşleştirme — bir işlemin source'undaki baş anlamlı kelime.
// Backend src/services/BudgetService.js > merchantStem ile BİREBİR aynı olmalı;
// böylece önizlemede gösterilen sayı ile sunucunun güncellediği sayı tutar.
// Ör: "ANTHROPIC* CLAUDE SUB SAN FRANCISCO US" → "ANTHROPIC"

const MERCHANT_SKIP_WORDS = new Set([
  'CARD', 'TRANSACTION', 'OF', 'EUR', 'ISSUED', 'BY', 'THE',
  'VON', 'BEI', 'AUS', 'DER', 'DIE', 'DAS',
])

export function merchantStem(source: string): string {
  const words = String(source || '')
    .toUpperCase()
    .split(/[\s/\-.,*]+/)
    .filter(w => w.length >= 3 && !MERCHANT_SKIP_WORDS.has(w) && !/^\d+$/.test(w))
  return words[0] || ''
}
