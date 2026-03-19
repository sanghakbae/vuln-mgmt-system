const LOCK_ERROR_PATTERNS = [
  'deadlock detected',
  'canceling statement due to lock timeout',
  'canceling statement due to statement timeout',
  'could not obtain lock on row',
  'could not obtain lock on relation',
  'tuple concurrently updated',
  'serialization failure',
]

const TRANSIENT_CODES = new Set([
  '40P01',
  '55P03',
  '40001',
  '57014',
])

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function isRetriableSupabaseError(error) {
  if (!error) return false

  const code = String(error.code || '').toUpperCase()
  const message = String(error.message || error.details || error.hint || '').toLowerCase()

  if (TRANSIENT_CODES.has(code)) return true
  return LOCK_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
}

export async function runSupabaseMutation(task, options = {}) {
  const { retries = 3, baseDelayMs = 250, onRetry } = options

  let attempt = 0

  while (true) {
    try {
      return await task()
    } catch (error) {
      if (attempt >= retries || !isRetriableSupabaseError(error)) {
        throw error
      }

      attempt += 1

      if (typeof onRetry === 'function') {
        onRetry(error, attempt)
      }

      const jitter = Math.floor(Math.random() * 100)
      await sleep(baseDelayMs * attempt + jitter)
    }
  }
}

export function chunkArray(items, size = 100) {
  if (!Array.isArray(items) || items.length === 0) return []

  const chunkSize = Math.max(1, Number(size) || 1)
  const chunks = []

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }

  return chunks
}
