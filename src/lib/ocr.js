const PRODUCT_LABEL_MAPPINGS = [
  { appName: '\u5473\u5a18\u3000100g\u888b', labelName: '\u5473\u5a18 - 100' },
  { appName: '\u5473\u5a18\u3000200g\u888b', labelName: '\u5473\u5a18 - 200' },
  { appName: '\u304b\u305f\u3089\u3044\u3000200g\u888b', labelName: '\u304b\u305f\u3089\u3044 - 200' },
  { appName: '\u304b\u305f\u3089\u3044\u3000500g\u888b', labelName: '\u304b\u305f\u3089\u3044 - 500' },
  { appName: '\u4f0a\u52e2\u6df1\u3080\u3057\u8336\u30c6\u30a3\u30fc\u30d0\u30c3\u30b0\uff08\u7e01\uff09', labelName: '\u4f0a\u52e2\u8336TB(\u7e01)' },
  { appName: '\u7dd1\u8336\u30c6\u30a3\u30fc\u30d0\u30c3\u30b050\u500b\u5165', labelName: '\u4f0a\u52e2\u8336TB(50\u500b\u5165)' },
  { appName: '\u304b\u308a\u304c\u306d\u307b\u3046\u3058\u8336', labelName: '\u830e\u307b\u3046\u3058\u8336 - 150' },
  { appName: '\u6df1\u84b8\u3057\u307b\u3046\u3058\u8336\u30c6\u30a3\u30fc\u30d0\u30c3\u30b020\u5165', labelName: '\u6df1\u84b8\u3057\u307b\u3046\u3058\u8336TB' },
]

export function matchProductNameFromOcr(text, productNames) {
  const [best] = getProductNameCandidatesFromOcr(text, productNames, 1)
  return best?.score >= 18 ? best.name : ''
}

export function extractExpiryDateFromOcr(text) {
  return getExpiryDateCandidatesFromOcr(text, 1)[0]?.value ?? ''
}

export function getProductNameCandidatesFromOcr(text, productNames, limit = 3) {
  const normalizedText = normalizeForOcrMatch(text)
  if (!normalizedText) return []

  const appNameCandidates = productNames.map((name) => {
    const normalizedName = normalizeForOcrMatch(name)
    const tokens = getProductTokens(name)
    let score = normalizedText.includes(normalizedName) ? 120 + normalizedName.length : 0

    for (const token of tokens) {
      if (normalizedText.includes(token)) score += /\d/.test(token) ? 18 : Math.min(28, token.length * 4)
    }

    score += Math.round(diceCoefficient(getBigrams(normalizedName), getBigrams(normalizedText)) * 55)
    return { name, score }
  })

  return mergeProductCandidates([
    ...appNameCandidates,
    ...getLabelProductCandidates(normalizedText, productNames),
  ])
    .filter((candidate) => candidate.score >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function getExpiryDateCandidatesFromOcr(text, limit = 3) {
  const normalizedText = normalizeDateText(text)
  const candidates = [
    ...findExpiryLabelDates(normalizedText),
    ...findDelimitedDates(normalizedText),
    ...findCompactDates(normalizedText),
    ...findLooseDateBlocks(normalizedText),
  ]
  return unique(candidates).filter(Boolean).filter(isLikelyExpiryDate).slice(0, limit).map((value) => ({ value }))
}


function getLabelProductCandidates(normalizedText, productNames) {
  return PRODUCT_LABEL_MAPPINGS.map(({ appName, labelName }) => {
    const productName = resolveAppProductName(appName, productNames)
    if (!productName) return null

    const normalizedLabel = normalizeForOcrMatch(labelName)
    const tokens = getProductTokens(labelName)
    let score = normalizedText.includes(normalizedLabel) ? 180 + normalizedLabel.length : 0

    for (const token of tokens) {
      if (normalizedText.includes(token)) score += /\d/.test(token) ? 24 : Math.min(34, token.length * 5)
    }

    score += Math.round(diceCoefficient(getBigrams(normalizedLabel), getBigrams(normalizedText)) * 75)
    return { name: productName, score }
  }).filter(Boolean)
}

function resolveAppProductName(appName, productNames) {
  const normalizedAppName = normalizeForOcrMatch(appName)
  return productNames.find((name) => normalizeForOcrMatch(name) === normalizedAppName) ?? ''
}

function mergeProductCandidates(candidates) {
  const byName = new Map()

  for (const candidate of candidates) {
    const current = byName.get(candidate.name)
    if (!current || candidate.score > current.score) {
      byName.set(candidate.name, candidate)
    }
  }

  return [...byName.values()]
}


function findExpiryLabelDates(text) {
  const results = []
  const pattern = /(?:\u8cde\u5473\u671f\u9650|\u671f\u9650|EXP|BB|BEST\s*BEFORE)\D{0,12}((?:20)?\d{2})\s*[\u5e74.\/\-?]\s*(\d{1,2})\s*[\u6708.\/\-?]\s*(\d{1,2})\s*\u65e5?/gi
  let match = pattern.exec(text)
  while (match) {
    results.push(formatDateCandidate(match[1], match[2], match[3]))
    match = pattern.exec(text)
  }
  return results
}

function findDelimitedDates(text) {
  const results = []
  const pattern = /((?:20)?\d{2})\s*[年./\-／]\s*(\d{1,2})\s*[月./\-／]\s*(\d{1,2})\s*日?/g
  let match = pattern.exec(text)
  while (match) {
    results.push(formatDateCandidate(match[1], match[2], match[3]))
    match = pattern.exec(text)
  }
  return results
}

function findCompactDates(text) {
  const results = []
  const patterns = [/\b(20\d{2})(\d{2})(\d{2})\b/g, /\b(\d{2})(\d{2})(\d{2})\b/g]
  for (const pattern of patterns) {
    let match = pattern.exec(text)
    while (match) {
      results.push(formatDateCandidate(match[1], match[2], match[3]))
      match = pattern.exec(text)
    }
  }
  return results
}

function findLooseDateBlocks(text) {
  const results = []
  const pattern = /(賞味期限|期限|EXP|BB|BEST BEFORE)?[^0-9]{0,10}((?:20)?\d{2})\D{1,4}(\d{1,2})\D{1,4}(\d{1,2})/gi
  let match = pattern.exec(text)
  while (match) {
    results.push(formatDateCandidate(match[2], match[3], match[4]))
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
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return ''
  return [String(year).padStart(4, '0'), String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-')
}

function normalizeYear(year) {
  if (year >= 2000 && year <= 2099) return year
  if (year >= 0 && year <= 99) return 2000 + year
  return 0
}

function isLikelyExpiryDate(value) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const oldest = new Date(today)
  oldest.setFullYear(oldest.getFullYear() - 1)
  const newest = new Date(today)
  newest.setFullYear(newest.getFullYear() + 10)
  return date >= oldest && date <= newest
}

function getProductTokens(value) {
  return unique(
    (String(value ?? '')
      .normalize('NFKC')
      .match(/\d+[a-z]*|[a-z]+|[\p{Script=Han}\u3005\u3006\u30F5\u30F6]+|[\p{Script=Hiragana}\p{Script=Katakana}\u30FC]+/giu) ?? []
    ).map(normalizeForOcrMatch),
  ).filter((token) => token.length >= 2)
}

function normalizeDateText(value) {
  return String(value ?? '').normalize('NFKC').replace(/[oO]/g, '0').replace(/[|]/g, '1').replace(/[：:]/g, ' ')
}

function normalizeForOcrMatch(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u30FC\uFF70\-\uFF0D]/g, '')
    .replace(/[()\uFF08\uFF09\uFF3B\uFF3D\[\]\u3010\u3011]/g, '')
    .replace(/[\u3001\uFF0C,\u3002\uFF0E.\u30FB\uFF65/\uFF0F\s]/g, '')
    .toLowerCase()
}

function getBigrams(value) {
  const chars = Array.from(value)
  if (chars.length < 2) return chars
  return chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1]}`)
}

function diceCoefficient(source, target) {
  if (!source.length || !target.length) return 0
  const targetCounts = new Map()
  for (const item of target) targetCounts.set(item, (targetCounts.get(item) ?? 0) + 1)
  let matches = 0
  for (const item of source) {
    const count = targetCounts.get(item) ?? 0
    if (count > 0) {
      matches += 1
      targetCounts.set(item, count - 1)
    }
  }
  return (2 * matches) / (source.length + target.length)
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}
