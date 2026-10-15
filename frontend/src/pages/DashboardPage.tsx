import { useEffect, useState } from 'react'
import {
  getApiHealth,
  getStockHistory,
  getStockQuote,
  type StockHistory,
  type StockQuote,
} from '../services/api'
import '../styles/DashboardPage.css'

type WatchlistStock = {
  symbol: string
  initials: string
  tone: string
}

const watchlist: WatchlistStock[] = [
  { symbol: 'NVDA', initials: 'N', tone: 'violet' },
  { symbol: 'AAPL', initials: 'A', tone: 'slate' },
  { symbol: 'MSFT', initials: 'M', tone: 'blue' },
  { symbol: 'TSLA', initials: 'T', tone: 'red' },
  { symbol: 'AMZN', initials: 'a', tone: 'amber' },
]

const QUOTE_SYMBOLS = [
  ...new Set([...watchlist.map(({ symbol }) => symbol), 'META', 'INTC', 'DIS']),
]

type Direction = 'up' | 'down'
type HistoryLoadState =
  | { symbol: string; status: 'success'; data: StockHistory }
  | { symbol: string; status: 'error' }

function directionFor(changePercent: number): Direction {
  return changePercent >= 0 ? 'up' : 'down'
}

function getTopMovers(quotes: StockQuote[], direction: Direction): StockQuote[] {
  const matchingQuotes = quotes.filter((quote) =>
    direction === 'up' ? quote.percent_change > 0 : quote.percent_change < 0,
  )
  matchingQuotes.sort((first, second) =>
    direction === 'up'
      ? second.percent_change - first.percent_change
      : first.percent_change - second.percent_change,
  )
  return matchingQuotes.slice(0, 3)
}

function formatMoney(value: number, currency = 'USD') {
  const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : 'USD'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrency,
  }).format(value)
}

function formatChange(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatHistoryDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function StockHistoryChart({ history }: { history: StockHistory }) {
  const prices = [...history.prices].sort((first, second) =>
    first.datetime.localeCompare(second.datetime),
  )

  if (prices.length === 0) {
    return <p className="history-message" role="status">No historical prices are available.</p>
  }

  const width = 700
  const height = 220
  const padding = { top: 18, right: 12, bottom: 34, left: 12 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const values = prices.map(({ close }) => close)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const coordinates = prices.map(({ close }, index) => ({
    x: padding.left + (prices.length === 1 ? chartWidth / 2 : (index / (prices.length - 1)) * chartWidth),
    y: padding.top + ((max - close) / range) * chartHeight,
  }))
  const labels = [...new Set([0, Math.floor((prices.length - 1) / 2), prices.length - 1])]

  return (
    <div className="history-chart-wrap">
      <svg className="history-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${history.symbol} closing prices over the last 30 days`}>
        {[0, 0.5, 1].map((fraction) => {
          const y = padding.top + fraction * chartHeight
          return <line key={fraction} x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="history-gridline" />
        })}
        <polyline
          points={coordinates.map(({ x, y }) => `${x},${y}`).join(' ')}
          className="history-line"
        />
        {coordinates.length === 1 && <circle cx={coordinates[0].x} cy={coordinates[0].y} r="4" className="history-point" />}
      </svg>
      <div className="history-date-axis" aria-hidden="true">
        {labels.map((index) => (
          <span key={index}>{formatHistoryDate(prices[index].datetime)}</span>
        ))}
      </div>
    </div>
  )
}

function ArrowMark({ direction }: { direction: Direction }) {
  return (
    <svg className={`market-arrow market-arrow-${direction}`} viewBox="0 0 12 12" aria-hidden="true">
      <path d={direction === 'up' ? 'M2 8.5 8.5 2M3 2h5.5v5.5' : 'M2 3.5 8.5 10M3 10h5.5V4.5'} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MarketMoverList({
  movers,
  direction,
  isLoading,
}: {
  movers: StockQuote[]
  direction: Direction
  isLoading: boolean
}) {
  if (isLoading) {
    return <p className="dashboard-empty" role="status">Loading stock quotes…</p>
  }

  if (movers.length === 0) {
    return <p className="dashboard-empty" role="status">No live {direction === 'up' ? 'gainers' : 'losers'} available.</p>
  }

  return (
    <ul className="mover-list">
      {movers.map((mover) => {
        const moverDirection = directionFor(mover.percent_change)
        return (
          <li className="mover-row" key={mover.symbol}>
            <div className="mover-company">
              <span className={`mover-symbol mover-symbol-${moverDirection}`}>{mover.symbol.slice(0, 1)}</span>
              <span className="mover-name-wrap">
                <strong>{mover.symbol}</strong>
                <span>{mover.company_name || mover.symbol}</span>
              </span>
            </div>
            <div className="mover-value">
              <span>{formatMoney(mover.price, mover.currency || 'USD')}</span>
              <span className={`change-value change-${moverDirection}`}>
                <ArrowMark direction={moverDirection} /> {formatChange(mover.percent_change)}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function DashboardLoadingState() {
  return (
    <div className="dashboard-loading" role="status" aria-label="Loading dashboard">
      <span className="loading-line loading-line-wide" />
      <span className="loading-line loading-line-short" />
      <div className="loading-card-row"><span /><span /><span /><span /></div>
      <span className="loading-panel" />
    </div>
  )
}

export default function DashboardPage() {
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({})
  const [historySymbol, setHistorySymbol] = useState('AAPL')
  const [historyLoadState, setHistoryLoadState] = useState<HistoryLoadState | null>(null)
  const [failedQuoteSymbols, setFailedQuoteSymbols] = useState<string[]>([])
  const [quotesLoading, setQuotesLoading] = useState(true)
  const [apiStatus, setApiStatus] = useState<'connecting' | 'connected' | 'unavailable'>('connecting')

  const isLoading = quotesLoading
  const availableQuotes = Object.values(quotes)
  const topGainers = getTopMovers(availableQuotes, 'up')
  const topLosers = getTopMovers(availableQuotes, 'down')
  const currentHistoryState = historyLoadState?.symbol === historySymbol
    ? historyLoadState
    : null

  useEffect(() => {
    const controller = new AbortController()

    async function loadQuotes() {
      await Promise.all(
        QUOTE_SYMBOLS.map(async (symbol) => {
          try {
            const quote = await getStockQuote(symbol, controller.signal)
            if (!controller.signal.aborted) {
              setQuotes((currentQuotes) => ({
                ...currentQuotes,
                [symbol]: quote,
              }))
            }
          } catch {
            if (!controller.signal.aborted) {
              setFailedQuoteSymbols((failedSymbols) =>
                failedSymbols.includes(symbol)
                  ? failedSymbols
                  : [...failedSymbols, symbol],
              )
            }
          }
        }),
      )

      if (!controller.signal.aborted) setQuotesLoading(false)
    }

    void loadQuotes()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    getStockHistory(historySymbol, 30, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setHistoryLoadState({ symbol: historySymbol, status: 'success', data: result })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHistoryLoadState({ symbol: historySymbol, status: 'error' })
        }
      })

    return () => controller.abort()
  }, [historySymbol])

  useEffect(() => {
    const controller = new AbortController()

    getApiHealth(controller.signal)
      .then(({ status }) => {
        setApiStatus(status === 'ok' ? 'connected' : 'unavailable')
      })
      .catch(() => {
        if (!controller.signal.aborted) setApiStatus('unavailable')
      })

    return () => controller.abort()
  }, [])

  const apiStatusText = {
    connecting: 'Connecting…',
    connected: 'API connected',
    unavailable: 'API unavailable',
  }[apiStatus]

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <a className="dashboard-brand" href="#overview" aria-label="MarketSim dashboard home">
            <span className="dashboard-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none">
                <path d="M5 23.5 12.2 16l5 4.6L27 9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20.5 9H27v6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>Market<span className="dashboard-brand-accent">Sim</span></span>
          </a>

          <nav className="dashboard-nav" aria-label="Main navigation">
            <a className="dashboard-nav-link is-active" href="#overview" aria-current="page">Dashboard</a>
            <a className="dashboard-nav-link" href="#watchlist">Watchlist</a>
            <a className="dashboard-nav-link" href="#portfolio">Portfolio</a>
          </nav>

          <div className="dashboard-header-actions">
            <span className={`api-status api-status-${apiStatus}`} role="status" aria-live="polite">
              <span className="api-status-dot" aria-hidden="true" />
              {apiStatusText}
            </span>
            <span className="demo-indicator"><span aria-hidden="true" /> DEMO ACCOUNT</span>
            <button className="signout-button" type="button" title="Demo button; no account is connected">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M8 3.5H4.75a1.25 1.25 0 0 0-1.25 1.25v10.5a1.25 1.25 0 0 0 1.25 1.25H8M12.5 6l4 4-4 4M7 10h9.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main" id="overview" aria-busy={isLoading}>
        {isLoading ? <DashboardLoadingState /> : (
          <>
            <section className="dashboard-welcome" aria-labelledby="dashboard-title">
              <div className="welcome-copy">
                <div className="welcome-eyebrow"><span className="welcome-eyebrow-dot" /> YOUR MARKET, SIMPLIFIED</div>
                <h1 id="dashboard-title">Good morning, Alex <span aria-hidden="true">✦</span></h1>
                <p>Welcome to your paper-trading dashboard. Explore the market, follow companies, and practice investing with virtual money.</p>
              </div>
              <div className="welcome-note" aria-label="Paper trading account">
                <span className="welcome-note-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M4 7.25A2.25 2.25 0 0 1 6.25 5h11.5A2.25 2.25 0 0 1 20 7.25v9.5A2.25 2.25 0 0 1 17.75 19H6.25A2.25 2.25 0 0 1 4 16.75v-9.5Z" stroke="currentColor" strokeWidth="1.5"/><path d="M4.5 9h15M8 14h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </span>
                <span><strong>Practice with confidence</strong><small>Virtual funds · No real money at risk</small></span>
              </div>
            </section>

            <section className="portfolio-section" id="portfolio" aria-labelledby="portfolio-title">
              <div className="section-heading">
                <div>
                  <h2 id="portfolio-title">Portfolio overview</h2>
                  <p>Your paper-trading performance at a glance</p>
                </div>
                <span className="portfolio-period"><span aria-hidden="true">◷</span> All time</span>
              </div>

              <div className="portfolio-cards">
                <article className="summary-card">
                  <div className="summary-card-top"><span className="summary-icon icon-cash" aria-hidden="true">$</span><span className="summary-label">Virtual cash</span></div>
                  <p className="summary-value">$24,580<span className="summary-cents">.00</span></p>
                  <p className="summary-footnote">Available to invest</p>
                </article>
                <article className="summary-card summary-card-highlight">
                  <div className="summary-card-top"><span className="summary-icon icon-value" aria-hidden="true">◫</span><span className="summary-label">Portfolio value</span></div>
                  <p className="summary-value">$53,294<span className="summary-cents">.26</span></p>
                  <p className="summary-footnote">Cash + investments</p>
                </article>
                <article className="summary-card">
                  <div className="summary-card-top"><span className="summary-icon icon-daily" aria-hidden="true"><ArrowMark direction="up" /></span><span className="summary-label">Daily change</span></div>
                  <p className="summary-value summary-positive">+$342<span className="summary-cents">.18</span></p>
                  <p className="summary-footnote"><span className="change-badge change-up"><ArrowMark direction="up" /> +0.65%</span> today</p>
                </article>
                <article className="summary-card">
                  <div className="summary-card-top"><span className="summary-icon icon-profit" aria-hidden="true">↗</span><span className="summary-label">Total profit / loss</span></div>
                  <p className="summary-value summary-positive">+$3,294<span className="summary-cents">.26</span></p>
                  <p className="summary-footnote"><span className="change-badge change-up"><ArrowMark direction="up" /> +6.59%</span> all time</p>
                </article>
              </div>
            </section>

            <section className="dashboard-panel history-panel" aria-labelledby="history-title">
              <div className="panel-heading history-heading">
                <div>
                  <h2 id="history-title">Price history</h2>
                  <p>Daily closing prices over the last 30 days</p>
                </div>
                <label className="history-symbol-label">
                  <span>Stock</span>
                  <select value={historySymbol} onChange={(event) => setHistorySymbol(event.target.value)}>
                    {watchlist.map(({ symbol }) => <option key={symbol} value={symbol}>{symbol}</option>)}
                  </select>
                </label>
              </div>
              <div className="history-chart-content" aria-live="polite" aria-busy={!currentHistoryState}>
                {!currentHistoryState ? (
                  <p className="history-message" role="status">Loading {historySymbol} price history…</p>
                ) : currentHistoryState.status === 'error' ? (
                  <p className="history-message history-error" role="status">Historical prices are temporarily unavailable. Please try again later.</p>
                ) : (
                  <StockHistoryChart history={currentHistoryState.data} />
                )}
              </div>
            </section>

            <div className="dashboard-content-grid">
              <section className="dashboard-panel watchlist-panel" id="watchlist" aria-labelledby="watchlist-title">
                <div className="panel-heading">
                  <div className="panel-title-group">
                    <span className="panel-title-icon" aria-hidden="true">☆</span>
                    <div><h2 id="watchlist-title">Your watchlist</h2><p>Keep an eye on the stocks you follow</p></div>
                  </div>
                  <a className="panel-action" href="#watchlist" aria-label="View all watchlist stocks">View all <span aria-hidden="true">→</span></a>
                </div>

                {watchlist.length === 0 ? (
                  <div className="dashboard-empty watchlist-empty" role="status">
                    <span className="empty-watch-icon" aria-hidden="true">☆</span>
                    <strong>Your watchlist is ready</strong>
                    <span>Add a company to start tracking its price here.</span>
                  </div>
                ) : (
                  <div className="watchlist-table-wrap">
                    <table className="watchlist-table">
                      <caption className="visually-hidden">Stock watchlist with prices and daily percentage changes from the MarketSim API</caption>
                      <thead><tr><th scope="col">Company</th><th scope="col">Price</th><th scope="col">Daily change</th></tr></thead>
                      <tbody>
                        {watchlist.map((stock) => {
                          const quote = quotes[stock.symbol]
                          return (
                            <tr key={stock.symbol}>
                              <th scope="row">
                                <span className={`company-avatar avatar-${stock.tone}`} aria-hidden="true">{stock.initials}</span>
                                <span className="watchlist-company">
                                  <strong>{stock.symbol}</strong>
                                  <span>{quote?.company_name || stock.symbol}</span>
                                </span>
                              </th>
                              <td>
                                {quote ? (
                                  formatMoney(quote.price, quote.currency || 'USD')
                                ) : (
                                  <span className="quote-unavailable" role="status">Unavailable</span>
                                )}
                              </td>
                              <td>
                                {quote ? (
                                  <span className={`change-badge change-${directionFor(quote.percent_change)}`}>
                                    <ArrowMark direction={directionFor(quote.percent_change)} /> {formatChange(quote.percent_change)}
                                  </span>
                                ) : (
                                  <span className="quote-unavailable" aria-label={`${stock.symbol} quote unavailable`}>—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="quote-data-note" role={failedQuoteSymbols.length ? 'status' : undefined}>
                  <span aria-hidden="true">ⓘ</span>
                  {failedQuoteSymbols.length === 0
                    ? 'Quotes supplied by the MarketSim API.'
                    : `${failedQuoteSymbols.length} of ${QUOTE_SYMBOLS.length} stock quotes are unavailable.`}
                </p>
              </section>

              <div className="movers-column">
                <section className="dashboard-panel movers-panel" aria-labelledby="gainers-title">
                  <div className="panel-heading movers-heading">
                    <div className="panel-title-group">
                      <span className="movers-heading-mark movers-mark-up" aria-hidden="true"><ArrowMark direction="up" /></span>
                      <div><h2 id="gainers-title">Top gainers</h2><p>Strongest today</p></div>
                    </div>
                    <span className="market-period-label">TODAY</span>
                  </div>
                  <MarketMoverList movers={topGainers} direction="up" isLoading={quotesLoading} />
                </section>

                <section className="dashboard-panel movers-panel" aria-labelledby="losers-title">
                  <div className="panel-heading movers-heading">
                    <div className="panel-title-group">
                      <span className="movers-heading-mark movers-mark-down" aria-hidden="true"><ArrowMark direction="down" /></span>
                      <div><h2 id="losers-title">Top losers</h2><p>Biggest dips today</p></div>
                    </div>
                    <span className="market-period-label">TODAY</span>
                  </div>
                  <MarketMoverList movers={topLosers} direction="down" isLoading={quotesLoading} />
                </section>
              </div>
            </div>

            <footer className="dashboard-disclaimer">
              <span className="disclaimer-symbol" aria-hidden="true">i</span>
              <p><strong>Educational use only.</strong> MarketSim is a paper-trading application. Portfolio balances and performance figures are demo data; stock quotes are retrieved through the MarketSim API and may be delayed. This information is not financial advice.</p>
            </footer>
          </>
        )}
      </main>
    </div>
  )
}
