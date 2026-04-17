export type NormalizeSearchOptions = {
  allowDots?: boolean
  allowHyphen?: boolean
}

export type SplitTokenOptions = {
  stripDots?: boolean
  minLength?: number
}

export function normalizeSearchText(
  value: string,
  options: NormalizeSearchOptions = {}
) {
  const { allowDots = false, allowHyphen = true } = options

  const cleanupRegex = allowDots
    ? allowHyphen
      ? /[^a-z0-9\s.-]/g
      : /[^a-z0-9\s.]/g
    : allowHyphen
      ? /[^a-z0-9\s-]/g
      : /[^a-z0-9\s]/g

  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(cleanupRegex, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0

  const rows = a.length + 1
  const cols = b.length + 1
  const dp: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0)
  )

  for (let i = 0; i < rows; i += 1) dp[i][0] = i
  for (let j = 0; j < cols; j += 1) dp[0][j] = j

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }

  return dp[rows - 1][cols - 1]
}

export function splitMatchTokens(
  value: string,
  options: SplitTokenOptions = {}
) {
  const { stripDots = false, minLength = 2 } = options

  return value
    .split(' ')
    .map((token) => (stripDots ? token.replace(/\./g, '') : token))
    .filter((token) => token.length >= minLength)
}

export function areTokensClose(a: string, b: string) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false

  const maxDistance = a.length >= 8 ? 2 : 1
  return levenshteinDistance(a, b) <= maxDistance
}

export function hasFuzzyTokenCoverage(
  sourceTokens: string[],
  targetTokens: string[]
) {
  if (targetTokens.length === 0) return false

  return targetTokens.every((targetToken) =>
    sourceTokens.some((sourceToken) => areTokensClose(targetToken, sourceToken))
  )
}
