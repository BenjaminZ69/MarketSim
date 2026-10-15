const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '')

export type ApiHealth = {
  status: string
  service: string
}

export type StockQuote = {
  symbol: string
  company_name: string | null
  exchange: string | null
  currency: string | null
  price: number
  previous_close: number
  change: number
  percent_change: number
  daily_high: number
  daily_low: number
  last_updated: string
}

export type StockPricePoint = {
  datetime: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

export type StockHistory = {
  symbol: string
  exchange: string | null
  currency: string | null
  interval: string
  prices: StockPricePoint[]
}

export async function getApiHealth(signal?: AbortSignal): Promise<ApiHealth> {
  const response = await fetch(`${API_BASE_URL}/api/health`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  })

  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}`)
  }

  return response.json() as Promise<ApiHealth>
}

export async function getStockQuote(
  symbol: string,
  signal?: AbortSignal,
): Promise<StockQuote> {
  const response = await fetch(
    `${API_BASE_URL}/api/stocks/${encodeURIComponent(symbol)}/quote`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    },
  )

  if (!response.ok) {
    throw new Error('Stock quote request failed.')
  }

  return response.json() as Promise<StockQuote>
}

export async function getStockHistory(
  symbol: string,
  days = 30,
  signal?: AbortSignal,
): Promise<StockHistory> {
  const query = new URLSearchParams({ days: String(days) })
  const response = await fetch(
    `${API_BASE_URL}/api/stocks/${encodeURIComponent(symbol)}/history?${query}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    },
  )

  if (!response.ok) {
    throw new Error('Stock history request failed.')
  }

  return response.json() as Promise<StockHistory>
}
