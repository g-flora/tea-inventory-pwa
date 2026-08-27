export const AIR_REGI_UPDATE_TYPE = '棚卸し・在庫確認'

export const CSV_HEADERS = [
  '商品名',
  '今の在庫数',
]

export function todayText() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function daysUntil(dateText) {
  if (!dateText) return Number.POSITIVE_INFINITY
  const today = new Date(`${todayText()}T00:00:00`)
  const target = new Date(`${dateText}T00:00:00`)
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000)
}

export function getInventoryStatus(item) {
  const remainingDays = daysUntil(item.expiry_date)
  const isExpiring = remainingDays <= 30
  const isLowStock = Number(item.quantity) <= Number(item.reorder_level ?? 5)

  if (isExpiring && isLowStock) {
    return {
      tone: 'danger',
      rank: 0,
      labels: ['賞味期限注意', '在庫少'],
      detail: buildExpiryDetail(remainingDays),
      isAlert: true,
    }
  }

  if (isExpiring) {
    return {
      tone: 'warning',
      rank: 1,
      labels: ['賞味期限注意'],
      detail: buildExpiryDetail(remainingDays),
      isAlert: true,
    }
  }

  if (isLowStock) {
    return {
      tone: 'stock',
      rank: 2,
      labels: ['在庫少'],
      detail: `基準 ${item.reorder_level ?? 5} 個以下`,
      isAlert: true,
    }
  }

  return {
    tone: 'ok',
    rank: 3,
    labels: ['通常'],
    detail: `賞味期限まで ${remainingDays} 日`,
    isAlert: false,
  }
}

export function sortInventory(items) {
  return [...items].sort((a, b) => {
    const statusA = getInventoryStatus(a)
    const statusB = getInventoryStatus(b)
    if (statusA.rank !== statusB.rank) return statusA.rank - statusB.rank
    if (a.expiry_date !== b.expiry_date) return a.expiry_date.localeCompare(b.expiry_date)
    return a.product_name.localeCompare(b.product_name, 'ja')
  })
}

export function summarizeInventoryByProductName(items) {
  const totals = new Map()

  for (const item of items) {
    const productName = item.product_name || '\u5546\u54c1\u540d\u672a\u8a2d\u5b9a'
    const current = totals.get(productName) ?? {
      product_name: productName,
      quantity: 0,
      memoSet: new Set(),
    }
    const quantity = Number(item.quantity ?? 0)

    current.quantity += Number.isFinite(quantity) ? quantity : 0
    if (item.memo) current.memoSet.add(String(item.memo).trim())
    totals.set(productName, current)
  }

  return Array.from(totals.values())
    .map((item) => ({
      product_name: item.product_name,
      quantity: item.quantity,
      memo: Array.from(item.memoSet).filter(Boolean).join(' / '),
    }))
    .sort((a, b) => a.product_name.localeCompare(b.product_name, 'ja'))
}

export function buildAirRegiCsv(items) {
  const rows = summarizeInventoryByProductName(items).map((item) => [
    item.product_name,
    item.quantity,
  ])

  return [CSV_HEADERS, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\r\n')
}

function escapeCsvValue(value) {
  const text = String(value ?? '')
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

function buildExpiryDetail(remainingDays) {
  if (remainingDays < 0) return `期限切れ ${Math.abs(remainingDays)} 日`
  if (remainingDays === 0) return '本日が期限'
  return `期限まで ${remainingDays} 日`
}
