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

  return productNames
    .map((name) => {
      const normalizedName = normalizeForOcrMatch(name)
      const tokens = getProductTokens(name)
      let score = normalizedText.includes(normalizedName) ? 120 + normalizedName.length : 0

      for (const token of tokens) {
        if (normalizedText.includes(token)) score += /\d/.test(token) ? 18 : Math.min(28, token.length * 4)
      }

      score += Math.round(diceCoefficient(getBigrams(normalizedName), getBigrams(normalizedText)) * 55)
      return { name, score }
    })
    .filter((candidate) => candidate.score >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function getExpiryDateCandidatesFromOcr(text, limit = 3) {
  const normalizedText = normalizeDateText(text)
  const candidates = [...findDelimitedDates(normalizedText), ...findCompactDates(normalizedText), ...findLooseDateBlocks(normalizedText)]
  return unique(candidates).filter(Boolean).filter(isLikelyExpiryDate).slice(0, limit).map((value) => ({ value }))
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
  return unique((String(value ?? '').normalize('NFKC').match(/\d+[a-z]*|[\p{Script=Han}々〆ヵヶ]+|[\p{Script=Hiragana}\p{Script=Katakana}ー]+/giu) ?? []).map(normalizeForOcrMatch)).filter((token) => token.length >= 2)
}

function normalizeDateText(value) {
  return String(value ?? '').normalize('NFKC').replace(/[oO]/g, '0').replace(/[|]/g, '1').replace(/[：:]/g, ' ')
}

function normalizeForOcrMatch(value) {
  return String(value ?? '').normalize('NFKC').replace(/[‐‑‒–—―ーｰ\-－]/g, '').replace(/[、，,。．.・･/／\s]/g, '').toLowerCase()
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
