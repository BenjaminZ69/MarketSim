import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyPaperTrade,
  createInitialPortfolio,
  loadPaperPortfolio,
  PAPER_PORTFOLIO_KEY,
  PaperTradeError,
} from '../src/services/paperPortfolio.ts'

function quote(symbol = 'AAPL', price = 100) {
  return { symbol, price, currency: 'USD' }
}

test('starts with $100,000 in virtual cash', () => {
  assert.deepEqual(createInitialPortfolio(), {
    version: 1,
    cash: 100_000,
    holdings: [],
    transactions: [],
  })
})

test('buys shares at the fetched quote price', () => {
  const result = applyPaperTrade(createInitialPortfolio(), 'buy', quote('AAPL', 125), 4, '2026-10-17T15:00:00Z', 'trade-1')
  assert.equal(result.cash, 99_500)
  assert.deepEqual(result.holdings, [{ symbol: 'AAPL', shares: 4, averagePurchasePrice: 125, latestPrice: 125 }])
  assert.equal(result.transactions[0].total, 500)
})

test('calculates weighted average cost for additional purchases', () => {
  const firstBuy = applyPaperTrade(createInitialPortfolio(), 'buy', quote('AAPL', 100), 2, '2026-10-17T15:00:00Z', 'trade-1')
  const secondBuy = applyPaperTrade(firstBuy, 'buy', quote('AAPL', 130), 2, '2026-10-17T15:01:00Z', 'trade-2')
  assert.equal(secondBuy.holdings[0].shares, 4)
  assert.equal(secondBuy.holdings[0].averagePurchasePrice, 115)
})

test('rejects purchases that exceed available cash', () => {
  assert.throws(
    () => applyPaperTrade(createInitialPortfolio(), 'buy', quote('AAPL', 100_001), 1),
    (error) => error instanceof PaperTradeError && error.code === 'insufficient-cash',
  )
})

test('sells owned shares and returns proceeds to virtual cash', () => {
  const purchased = applyPaperTrade(createInitialPortfolio(), 'buy', quote('AAPL', 100), 3, '2026-10-17T15:00:00Z', 'trade-1')
  const sold = applyPaperTrade(purchased, 'sell', quote('AAPL', 125), 1, '2026-10-17T15:01:00Z', 'trade-2')
  assert.equal(sold.cash, 99_825)
  assert.equal(sold.holdings[0].shares, 2)
  assert.equal(sold.transactions[0].total, 125)
})

test('rejects selling more shares than are owned', () => {
  const purchased = applyPaperTrade(createInitialPortfolio(), 'buy', quote('AAPL', 100), 2, '2026-10-17T15:00:00Z', 'trade-1')
  assert.throws(
    () => applyPaperTrade(purchased, 'sell', quote('AAPL', 100), 3),
    (error) => error instanceof PaperTradeError && error.code === 'insufficient-shares',
  )
})

test('removes a holding after all shares are sold', () => {
  const purchased = applyPaperTrade(createInitialPortfolio(), 'buy', quote('AAPL', 100), 2, '2026-10-17T15:00:00Z', 'trade-1')
  const sold = applyPaperTrade(purchased, 'sell', quote('AAPL', 90), 2, '2026-10-17T15:01:00Z', 'trade-2')
  assert.deepEqual(sold.holdings, [])
})

test('recovers corrupted localStorage data to the default portfolio', () => {
  const values = new Map([[PAPER_PORTFOLIO_KEY, '{not valid json']])
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }

  assert.deepEqual(loadPaperPortfolio(storage), createInitialPortfolio())
  assert.deepEqual(JSON.parse(values.get(PAPER_PORTFOLIO_KEY)), createInitialPortfolio())
})
