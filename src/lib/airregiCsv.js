const COLUMN_ALIASES = {
  productCode: [
    '商品コード',
    '商品番号',
    '品番',
    'JANコード',
    'JAN',
    'コード',
    'product_code',
    'productCode',
    'code',
    'sku',
  ],
  productName: [
    '商品名',
    '品名',
    '商品',
    '商品名称',
    'product_name',
    'productName',
    'item_name',
    'itemName',
    'name',
  ],
  quantity: ['販売商品数', '販売商品', '販売数量', '売上数量', '数量', '販売数', '点数', 'quantity', 'qty', 'count'],
  soldAt: ['販売日時', '売上日時', '取引日時', '販売日', '日付', 'soldAt', 'sales_date', 'date'],
  saleLineId: ['売上明細ID', '明細ID', '取引ID', 'saleLineId', 'lineId', 'id'],
}

const UNSUPPORTED_PRODUCT_NAME = '\u672a\u5bfe\u5fdc'

export const AIRREGI_PRODUCT_NAME_BY_CODE = {
  'TEA-AJI100': '\u5473\u5a18\u3000100g\u888b',
  'TEA-AJI200': '\u5473\u5a18\u3000200g\u888b',
  'TEA-KATA200': '\u304b\u305f\u3089\u3044\u3000200g\u888b',
  'TEA-KATA500': '\u304b\u305f\u3089\u3044\u3000500g\u888b',
  'TEA-ISE-TB30': '\u4f0a\u52e2\u6df1\u3080\u3057\u8336\u30c6\u30a3\u30fc\u30d0\u30c3\u30b030\u500b\u5165',
  'TEA-RYOKU-TB50': '\u7dd1\u8336\u30c6\u30a3\u30fc\u30d0\u30c3\u30b050\u500b\u5165',
  'TEA-KARI-HOJI150': '\u304b\u308a\u304c\u306d\u307b\u3046\u3058\u8336150g\u888b',
  'TEA-FUKA-HOJI-TB20': '\u6df1\u84b8\u3057\u307b\u3046\u3058\u8336\u30c6\u30a3\u30fc\u30d0\u30c3\u30b020\u5165',
}

function normalizeProductCode(value) {
  return String(value ?? '').trim().toUpperCase()
}

export function mapAirRegiProductCodeToProductName(productCode) {
  return AIRREGI_PRODUCT_NAME_BY_CODE[normalizeProductCode(productCode)] ?? ''
}

function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000_\-/\\()[\]{}（）【】「」『』:：.．]/g, '')
}

function normalizeDigits(value) {
  return String(value ?? '').replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
}

function parseQuantity(value) {
  const normalized = normalizeDigits(value).replace(/,/g, '').replace(/[^\d.-]/g, '')
  const quantity = Number(normalized)

  return Number.isFinite(quantity) ? quantity : 0
}

function parseCsvRows(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const csvText = String(text ?? '').replace(/^\uFEFF/, '')

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index]
    const nextChar = csvText[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && char === ',') {
      row.push(field.trim())
      field = ''
      continue
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') index += 1
      row.push(field.trim())
      rows.push(row)
      row = []
      field = ''
      continue
    }

    field += char
  }

  row.push(field.trim())
  rows.push(row)

  return rows.filter((currentRow) => currentRow.some((cell) => String(cell ?? '').trim() !== ''))
}

function findColumnIndex(headers, aliases) {
  const normalizedAliases = aliases.map(normalizeHeader)
  const normalizedHeaders = headers.map(normalizeHeader)

  return normalizedHeaders.findIndex((header) => normalizedAliases.includes(header))
}

function findHeaderRow(rows) {
  for (let index = 0; index < Math.min(rows.length, 10); index += 1) {
    const headers = rows[index]
    const productCodeIndex = findColumnIndex(headers, COLUMN_ALIASES.productCode)
    const productNameIndex = findColumnIndex(headers, COLUMN_ALIASES.productName)
    const quantityIndex = findColumnIndex(headers, COLUMN_ALIASES.quantity)

    if ((productCodeIndex >= 0 || productNameIndex >= 0) && quantityIndex >= 0) {
      return { headerIndex: index, headers }
    }
  }

  return null
}

export function parseAirRegiSalesCsvText(text) {
  const rows = parseCsvRows(text)
  const headerRow = findHeaderRow(rows)

  if (!headerRow) {
    throw new Error('商品コードまたは商品名、販売数量の列が見つかりませんでした。')
  }

  const { headerIndex, headers } = headerRow
  const productCodeIndex = findColumnIndex(headers, COLUMN_ALIASES.productCode)
  const productNameIndex = findColumnIndex(headers, COLUMN_ALIASES.productName)
  const quantityIndex = findColumnIndex(headers, COLUMN_ALIASES.quantity)
  const soldAtIndex = findColumnIndex(headers, COLUMN_ALIASES.soldAt)
  const saleLineIdIndex = findColumnIndex(headers, COLUMN_ALIASES.saleLineId)
  const warnings = []
  const sales = rows
    .slice(headerIndex + 1)
    .map((row, index) => {
      const rowNumber = headerIndex + index + 2
      const productCode = productCodeIndex >= 0 ? String(row[productCodeIndex] ?? '').trim() : ''
      const rawProductName = productNameIndex >= 0 ? String(row[productNameIndex] ?? '').trim() : ''
      const mappedProductName = productCode ? mapAirRegiProductCodeToProductName(productCode) : ''
      const isUnsupportedProductCode = Boolean(productCode && !mappedProductName)
      const productName = productCode ? mappedProductName || UNSUPPORTED_PRODUCT_NAME : rawProductName
      const quantity = parseQuantity(row[quantityIndex])

      if (!productCode && !rawProductName) {
        warnings.push(`${rowNumber}行目は商品コードと商品名が空なので読み飛ばしました。`)
        return null
      }

      if (quantity <= 0) {
        warnings.push(`${rowNumber}行目は販売数量が0以下なので読み飛ばしました。`)
        return null
      }

      return {
        rowNumber,
        productCode,
        productName,
        rawProductName,
        mappedProductName,
        isUnsupportedProductCode,
        quantity,
        soldAt: soldAtIndex >= 0 ? String(row[soldAtIndex] ?? '').trim() : '',
        saleLineId: saleLineIdIndex >= 0 ? String(row[saleLineIdIndex] ?? '').trim() : '',
      }
    })
    .filter(Boolean)

  return {
    headers,
    sales,
    warnings,
  }
}

export async function readAirRegiSalesCsvFile(file) {
  if (!file) {
    throw new Error('CSVファイルを選択してください。')
  }

  const text = await file.text()
  return parseAirRegiSalesCsvText(text)
}

export function groupAirRegiSales(sales) {
  const grouped = new Map()

  for (const sale of sales) {
    const key = sale.productCode ? `code:${sale.productCode}` : `name:${sale.productName}`
    const current = grouped.get(key) ?? {
      productCode: sale.productCode,
      productName: sale.productName,
      rawProductName: sale.rawProductName,
      mappedProductName: sale.mappedProductName,
      isUnsupportedProductCode: sale.isUnsupportedProductCode,
      quantity: 0,
      rows: [],
    }

    current.productCode ||= sale.productCode
    current.productName ||= sale.productName
    current.rawProductName ||= sale.rawProductName
    current.mappedProductName ||= sale.mappedProductName
    current.isUnsupportedProductCode ||= sale.isUnsupportedProductCode
    current.quantity += Number(sale.quantity ?? 0)
    current.rows.push(sale)
    grouped.set(key, current)
  }

  return Array.from(grouped.values())
}
