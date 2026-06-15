function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]/g, '')
}

function normalizeProductName(value) {
  return normalizeText(value).replace(/袋|個入|入/g, '')
}

function toQuantity(value) {
  const quantity = Number(value ?? 0)

  return Number.isFinite(quantity) ? quantity : 0
}

function namesMatch(inventoryName, saleName) {
  const normalizedInventoryName = normalizeProductName(inventoryName)
  const normalizedSaleName = normalizeProductName(saleName)

  if (!normalizedInventoryName || !normalizedSaleName) return false
  if (normalizedInventoryName === normalizedSaleName) return true

  const shorterName = normalizedInventoryName.length < normalizedSaleName.length ? normalizedInventoryName : normalizedSaleName
  const longerName = normalizedInventoryName.length < normalizedSaleName.length ? normalizedSaleName : normalizedInventoryName

  return shorterName.length >= 5 && longerName.includes(shorterName)
}

function matchesSale(item, sale) {
  const itemCode = normalizeText(item.product_code)
  const saleCode = normalizeText(sale.productCode)

  if (itemCode && saleCode && itemCode === saleCode) return true

  return namesMatch(item.product_name, sale.productName)
}

export function sortInventoryByOldestExpiry(items) {
  return [...items].sort((a, b) => {
    const expiryCompare = String(a.expiry_date ?? '').localeCompare(String(b.expiry_date ?? ''))
    if (expiryCompare !== 0) return expiryCompare

    const arrivalCompare = String(a.arrival_date ?? '').localeCompare(String(b.arrival_date ?? ''))
    if (arrivalCompare !== 0) return arrivalCompare

    return String(a.id ?? '').localeCompare(String(b.id ?? ''))
  })
}

export function createInventoryReductionPlan(inventoryItems, salesItems) {
  return salesItems.map((sale) => {
    const requestedQuantity = toQuantity(sale.quantity)
    let remainingQuantity = requestedQuantity
    const matchingInventory = sortInventoryByOldestExpiry(inventoryItems).filter((item) => matchesSale(item, sale))
    const reductions = []

    for (const item of matchingInventory) {
      if (remainingQuantity <= 0) break

      const beforeQuantity = Math.max(0, toQuantity(item.quantity))
      if (beforeQuantity <= 0) continue

      const reduceQuantity = Math.min(beforeQuantity, remainingQuantity)
      reductions.push({
        inventoryId: item.id,
        productName: item.product_name,
        productCode: item.product_code,
        arrivalDate: item.arrival_date,
        expiryDate: item.expiry_date,
        beforeQuantity,
        reduceQuantity,
        afterQuantity: beforeQuantity - reduceQuantity,
      })

      remainingQuantity -= reduceQuantity
    }

    return {
      sale,
      matchedProductName: reductions[0]?.productName ?? sale.productName,
      requestedQuantity,
      plannedQuantity: requestedQuantity - remainingQuantity,
      shortageQuantity: Math.max(0, remainingQuantity),
      reductions,
    }
  })
}
