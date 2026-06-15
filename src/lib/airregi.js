import { hasSupabaseConfig, supabase } from './supabaseClient'

export async function fetchAirRegiSalesTest() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase接続情報が未設定です。')
  }

  const { data, error } = await supabase.functions.invoke('airregi-sales-test', {
    body: {},
  })

  if (error) {
    throw new Error(getSafeFunctionErrorMessage(error))
  }

  return normalizeAirRegiSalesTestResponse(data)
}

function normalizeAirRegiSalesTestResponse(data) {
  const sales = Array.isArray(data?.sales) ? data.sales : []

  return sales.map((sale) => ({
    saleLineId: toText(sale?.saleLineId),
    soldAt: toText(sale?.soldAt),
    productCode: toText(sale?.productCode),
    productName: toText(sale?.productName),
    quantity: toNumber(sale?.quantity),
  }))
}

function getSafeFunctionErrorMessage(error) {
  if (error?.message) return error.message
  return 'Airレジ売上取得テストに失敗しました。'
}

function toText(value) {
  return String(value ?? '')
}

function toNumber(value) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}
