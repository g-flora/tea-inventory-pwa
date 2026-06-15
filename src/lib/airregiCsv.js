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
  quantity: ['販売数量', '売上数量', '数量', '販売数', '点数', 'quantity', 'qty', 'count'],
  soldAt: ['販売日時', '売上日時', '取引日時', '販売日', '日付', 'soldAt', 'sales_date', 'date'],
  saleLineId: ['売上明細ID', '明細ID', '取引ID', 'saleLineId', 'lineId', 'id'],
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
      const productName = productNameIndex >= 0 ? String(row[productNameIndex] ?? '').trim() : ''
      const quantity = parseQuantity(row[quantityIndex])

      if (!productCode && !productName) {
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
      quantity: 0,
      rows: [],
    }

    current.productCode ||= sale.productCode
    current.productName ||= sale.productName
    current.quantity += Number(sale.quantity ?? 0)
    current.rows.push(sale)
    grouped.set(key, current)
  }

  return Array.from(grouped.values())
}
