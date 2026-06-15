const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json; charset=utf-8',
}

type AirRegiSaleLine = {
  saleLineId: string
  soldAt: string
  productCode: string
  productName: string
  quantity: number
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'POST only' }, 405)
  }

  const endpoint = getAirRegiEndpoint()
  const token = Deno.env.get('AIRREGI_API_TOKEN')

  if (!endpoint || !token) {
    return jsonResponse(
      {
        error:
          'AirレジAPIの接続設定が未設定です。Supabase SecretsにAIRREGI_API_URLまたはAIRREGI_API_BASE_URL、AIRREGI_API_TOKENを設定してください。',
      },
      500,
    )
  }

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: buildAirRegiHeaders(token),
    })

    if (!response.ok) {
      return jsonResponse(
        {
          error: `AirレジAPIの取得に失敗しました。ステータス: ${response.status}`,
        },
        502,
      )
    }

    const payload = await response.json()
    const sales = normalizeAirRegiSales(payload)

    return jsonResponse({ sales, count: sales.length, fetchedAt: new Date().toISOString() })
  } catch (_error) {
    return jsonResponse({ error: 'AirレジAPIの取得中にエラーが発生しました。' }, 500)
  }
})

function getAirRegiEndpoint() {
  const fullUrl = Deno.env.get('AIRREGI_API_URL')
  if (fullUrl) return fullUrl

  const baseUrl = Deno.env.get('AIRREGI_API_BASE_URL')
  if (!baseUrl) return ''

  const salesPath = Deno.env.get('AIRREGI_SALES_PATH') || '/sales'
  return `${baseUrl.replace(/\/$/, '')}/${salesPath.replace(/^\//, '')}`
}

function buildAirRegiHeaders(token: string) {
  const authHeaderName = Deno.env.get('AIRREGI_AUTH_HEADER') || 'Authorization'
  const authScheme = Deno.env.get('AIRREGI_AUTH_SCHEME') || 'Bearer'
  const headers = new Headers({ Accept: 'application/json' })

  headers.set(authHeaderName, authScheme ? `${authScheme} ${token}` : token)
  return headers
}

function normalizeAirRegiSales(payload: unknown): AirRegiSaleLine[] {
  const rows = findSalesRows(payload)
  return rows.map(normalizeSaleLine).filter((sale): sale is AirRegiSaleLine => Boolean(sale))
}

function findSalesRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord)
  if (!isRecord(payload)) return []

  const candidates = [
    payload.sales,
    payload.items,
    payload.data,
    payload.results,
    payload.salesDetails,
    payload.sales_details,
    payload.details,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(isRecord)
  }

  return []
}

function normalizeSaleLine(row: Record<string, unknown>): AirRegiSaleLine | null {
  const saleLineId = getString(row, [
    'saleLineId',
    'sale_line_id',
    'salesLineId',
    'sales_line_id',
    'salesDetailId',
    'sales_detail_id',
    'detailId',
    'detail_id',
    'id',
  ])
  const soldAt = getString(row, [
    'soldAt',
    'sold_at',
    'salesDate',
    'sales_date',
    'transactionDate',
    'transaction_date',
    'createdAt',
    'created_at',
  ])
  const productCode = getString(row, ['productCode', 'product_code', 'itemCode', 'item_code', 'code', 'janCode', 'jan_code'])
  const productName = getString(row, ['productName', 'product_name', 'itemName', 'item_name', 'name'])
  const quantity = getNumber(row, ['quantity', 'salesQuantity', 'sales_quantity', 'soldQuantity', 'sold_quantity', 'count'])

  if (!saleLineId && !productCode && !productName) return null

  return {
    saleLineId,
    soldAt,
    productCode,
    productName,
    quantity,
  }
}

function getString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null) return String(value)
  }
  return ''
}

function getNumber(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    const numberValue = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(numberValue)) return numberValue
  }
  return 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  })
}