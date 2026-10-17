import assert from 'node:assert/strict'
import test from 'node:test'
import { getHistoryChartPoints } from '../src/services/historyChart.ts'

test('maps the confirmed history response prices into dated close values', () => {
  const history = {
    symbol: 'AAPL',
    exchange: 'NASDAQ',
    currency: 'USD',
    interval: '1day',
    prices: [
      {
        datetime: '2026-09-08',
        open: 317.1,
        high: 320.7,
        low: 314.9,
        close: 316.22,
        volume: 35477100,
      },
      {
        datetime: '2026-09-04',
        open: 328.31,
        high: 328.93,
        low: 317.86,
        close: 319.97,
        volume: 39606900,
      },
    ],
  }

  assert.deepEqual(getHistoryChartPoints(history), [
    { date: '2026-09-04', value: 319.97 },
    { date: '2026-09-08', value: 316.22 },
  ])
})
