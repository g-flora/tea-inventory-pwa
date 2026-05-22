export function matchProductNameFromOcr(text, productNames) {
  const normalizedText = normalizeForOcrMatch(text)

  if (!normalizedText) return ''

  let best = { name: '', score: 0 }

  for (const productName of productNames) {
    const normalizedName = normalizeForOcrMatch(productName)
    let score = 0

    if (normalizedText.includes(normalizedName)) {
      score = 1000 + normalizedName.length
    } else {
      const fragments = normalizedName.match(/[0-9A-Za-z]+|[一-龠ぁ-んァ-ヶー]+/g) ?? []
      score = fragments.reduce((sum, fragment) => {
        if (fragment.length < 2) return sum
        return normalizedText.includes(fragment) ? sum + fragment.length : sum
      }, 0)
    }

    if (score > best.score) {
      best = { name: productName, score }
    }
  }

  return best.score >= 5 ? best.name : ''
}

export function extractExpiryDateFromOcr(text) {
  const normalizedText = text.normalize('NFKC')
  const candidates = [
    ...findDelimitedDates(normalizedText),
    ...findCompactDates(normalizedText),
  ]

  return candidates.find(Boolean) ?? ''
}

function findDelimitedDates(text) {
  const results = []
  const pattern = /(?:賞味期限|期限|EXP|Best Before|消費期限)?[^0-9]{0,8}((?:20)?\d{2})[年./\-\s]+(\d{1,2})[月./\-\s]+(\d{1,2})日?/gi
  let match = pattern.exec(text)

  while (match) {
    results.push(formatDateCandidate(match[1], match[2], match[3]))
    match = pattern.exec(text)
  }

  return results
}

function findCompactDates(text) {
  const results = []
  const pattern = /\b(20\d{2})(\d{2})(\d{2})\b/g
  let match = pattern.exec(text)

  while (match) {
    results.push(formatDateCandidate(match[1], match[2], match[3]))
    match = pattern.exec(text)
  }

  return results
}

function formatDateCandidate(yearText, monthText, dayText) {
  const year = normalizeYear(Number(yearText))
  const month = Number(monthText)
  const day = Number(dayText)

  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return ''

  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return ''
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

function normalizeYear(year) {
  if (year >= 2000 && year <= 2099) return year
  if (year >= 0 && year <= 99) return 2000 + year
  return 0
}

function normalizeForOcrMatch(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s/g, '')
    .replace(/[‐‑‒–—―ー\-]/g, '')
    .toLowerCase()
}
