import type { StockQuote } from './api'

export const PAPER_PORTFOLIO_KEY = 'marketsim.paperPortfolio.v1'
export const STARTING_VIRTUAL_CASH = 100_000

export type Holding = {
  symbol: string
  shares: number
  averagePurchasePrice: number
  latestPrice: number
}

export type PaperTransaction = {
  id: string
  action: 'buy' | 'sell'
  symbol: string
  quantity: number
  executionPrice: number
  total: number
  timestamp: string
}

export type PaperPortfolio = {
  version: 1
  cash: number
  holdings: Holding[]
  transactions: PaperTransaction[]
}

export type PortfolioSummary = {
  availableCash: number
  holdingsValue: number
  totalValue: number
  unrealizedProfitLoss: number
}

export type TradeAction = PaperTransaction['action']

export class PaperTradeError extends Error {
  readonly code: 'invalid-symbol' | 'invalid-quantity' | 'unavailable-price' | 'insufficient-cash' | 'insufficient-shares'

  constructor(code: PaperTradeError['code']) {
    super(code)
    this.name = 'PaperTradeError'
    this.code = code
  }
}

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
const portfolioKeys = ['version', 'cash', 'holdings', 'transactions']
const holdingKeys = ['symbol', 'shares', 'averagePurchasePrice', 'latestPrice']
const transactionKeys = ['id', 'action', 'symbol', 'quantity', 'executionPrice', 'total', 'timestamp']

function hasOnlyKeys(value: object, allowedKeys: string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === allowedKeys.length && keys.every((key) => allowedKeys.includes(key))
}

function resolveStorage(storage?: StoragePort): StoragePort | null {
  if (storage) return storage
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function createInitialPortfolio(): PaperPortfolio {
  return {
    version: 1,
    cash: STARTING_VIRTUAL_CASH,
    holdings: [],
    transactions: [],
  }
}

export function normalizeStockSymbol(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidStockSymbol(value: string): boolean {
  return value.length <= 15 && /^[A-Z0-9]+(?:[.-][A-Z0-9]+)*$/.test(value)
}

export function parseTradeQuantity(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value.trim())) return null
  const quantity = Number(value)
  return Number.isSafeInteger(quantity) ? quantity : null
}

function isFiniteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isPortfolio(value: unknown): value is PaperPortfolio {
  if (!value || typeof value !== 'object' || !hasOnlyKeys(value, portfolioKeys)) return false
  const portfolio = value as Partial<PaperPortfolio>
  if (portfolio.version !== 1 || !isFiniteNonnegative(portfolio.cash)) return false
  if (!Array.isArray(portfolio.holdings) || !Array.isArray(portfolio.transactions)) return false

  const holdingsValid = portfolio.holdings.every((holding) =>
    Boolean(holding)
    && hasOnlyKeys(holding, holdingKeys)
    && typeof holding.symbol === 'string'
    && isValidStockSymbol(holding.symbol)
    && Number.isSafeInteger(holding.shares)
    && holding.shares > 0
    && isFiniteNonnegative(holding.averagePurchasePrice)
    && isFiniteNonnegative(holding.latestPrice),
  )
  const transactionsValid = portfolio.transactions.every((transaction) =>
    Boolean(transaction)
    && hasOnlyKeys(transaction, transactionKeys)
    && typeof transaction.id === 'string'
    && (transaction.action === 'buy' || transaction.action === 'sell')
    && typeof transaction.symbol === 'string'
    && isValidStockSymbol(transaction.symbol)
    && Number.isSafeInteger(transaction.quantity)
    && transaction.quantity > 0
    && isFiniteNonnegative(transaction.executionPrice)
    && isFiniteNonnegative(transaction.total)
    && typeof transaction.timestamp === 'string'
    && !Number.isNaN(Date.parse(transaction.timestamp)),
  )
  return holdingsValid && transactionsValid
}

export function loadPaperPortfolio(storage?: StoragePort): PaperPortfolio {
  const targetStorage = resolveStorage(storage)
  if (!targetStorage) return createInitialPortfolio()

  let stored: string | null
  try {
    stored = targetStorage.getItem(PAPER_PORTFOLIO_KEY)
  } catch {
    return createInitialPortfolio()
  }
  if (stored === null) return createInitialPortfolio()

  try {
    const parsed: unknown = JSON.parse(stored)
    if (isPortfolio(parsed)) return parsed
  } catch {
    // Invalid stored data is replaced below with a clean demo portfolio.
  }

  const initial = createInitialPortfolio()
  try {
    targetStorage.setItem(PAPER_PORTFOLIO_KEY, JSON.stringify(initial))
  } catch {
    // The in-memory default is still safe to use when browser storage is unavailable.
  }
  return initial
}

export function savePaperPortfolio(portfolio: PaperPortfolio, storage?: StoragePort): void {
  const targetStorage = resolveStorage(storage)
  if (!targetStorage) throw new Error('Browser storage is unavailable.')
  targetStorage.setItem(PAPER_PORTFOLIO_KEY, JSON.stringify(portfolio))
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function applyPaperTrade(
  portfolio: PaperPortfolio,
  action: TradeAction,
  quote: StockQuote,
  quantity: number,
  timestamp = new Date().toISOString(),
  id = crypto.randomUUID(),
): PaperPortfolio {
  const symbol = normalizeStockSymbol(quote.symbol)
  if (!isValidStockSymbol(symbol)) throw new PaperTradeError('invalid-symbol')
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new PaperTradeError('invalid-quantity')
  if (quote.currency !== 'USD' || !Number.isFinite(quote.price) || quote.price <= 0) {
    throw new PaperTradeError('unavailable-price')
  }

  const total = roundMoney(quote.price * quantity)
  if (!Number.isFinite(total) || total <= 0) throw new PaperTradeError('unavailable-price')
  const existing = portfolio.holdings.find((holding) => holding.symbol === symbol)
  let holdings: Holding[]
  let cash: number

  if (action === 'buy') {
    if (total > portfolio.cash) throw new PaperTradeError('insufficient-cash')
    cash = roundMoney(portfolio.cash - total)
    const shares = (existing?.shares ?? 0) + quantity
    const previousCost = (existing?.shares ?? 0) * (existing?.averagePurchasePrice ?? 0)
    const averagePurchasePrice = (previousCost + quote.price * quantity) / shares
    const updated: Holding = { symbol, shares, averagePurchasePrice, latestPrice: quote.price }
    holdings = existing
      ? portfolio.holdings.map((holding) => holding.symbol === symbol ? updated : holding)
      : [...portfolio.holdings, updated]
  } else {
    if (!existing || quantity > existing.shares) throw new PaperTradeError('insufficient-shares')
    cash = roundMoney(portfolio.cash + total)
    holdings = existing.shares === quantity
      ? portfolio.holdings.filter((holding) => holding.symbol !== symbol)
      : portfolio.holdings.map((holding) => holding.symbol === symbol
        ? { ...holding, shares: holding.shares - quantity, latestPrice: quote.price }
        : holding)
  }

  const transaction: PaperTransaction = {
    id,
    action,
    symbol,
    quantity,
    executionPrice: quote.price,
    total,
    timestamp,
  }

  return {
    version: 1,
    cash,
    holdings,
    transactions: [transaction, ...portfolio.transactions],
  }
}

export function updateHoldingLatestPrice(
  portfolio: PaperPortfolio,
  symbol: string,
  latestPrice: number,
): PaperPortfolio {
  if (!Number.isFinite(latestPrice) || latestPrice <= 0) return portfolio
  const normalizedSymbol = normalizeStockSymbol(symbol)
  let changed = false
  const holdings = portfolio.holdings.map((holding) => {
    if (holding.symbol !== normalizedSymbol) return holding
    changed = true
    return { ...holding, latestPrice }
  })
  return changed ? { ...portfolio, holdings } : portfolio
}

export function summarizePortfolio(portfolio: PaperPortfolio): PortfolioSummary {
  const holdingsValue = portfolio.holdings.reduce(
    (total, holding) => total + holding.latestPrice * holding.shares,
    0,
  )
  const costBasis = portfolio.holdings.reduce(
    (total, holding) => total + holding.averagePurchasePrice * holding.shares,
    0,
  )
  return {
    availableCash: roundMoney(portfolio.cash),
    holdingsValue: roundMoney(holdingsValue),
    totalValue: roundMoney(portfolio.cash + holdingsValue),
    unrealizedProfitLoss: roundMoney(holdingsValue - costBasis),
  }
}
