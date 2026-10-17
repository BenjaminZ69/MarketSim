import type { StockHistory } from './api'

export type HistoryChartPoint = {
  date: string
  value: number
}

export function getHistoryChartPoints(history: StockHistory): HistoryChartPoint[] {
  return [...history.prices]
    .sort((first, second) => first.datetime.localeCompare(second.datetime))
    .map(({ datetime, close }) => ({ date: datetime, value: close }))
}
