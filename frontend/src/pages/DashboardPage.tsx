import '../styles/DashboardPage.css'

type WatchlistStock = {
  symbol: string
  company: string
  price: number
  changePercent: number
  changeDirection: 'up' | 'down'
  initials: string
  tone: string
}

const watchlist: WatchlistStock[] = [
  { symbol: 'NVDA', company: 'NVIDIA Corporation', price: 875.28, changePercent: 2.48, changeDirection: 'up', initials: 'N', tone: 'violet' },
  { symbol: 'AAPL', company: 'Apple Inc.', price: 189.84, changePercent: 0.72, changeDirection: 'up', initials: 'A', tone: 'slate' },
  { symbol: 'MSFT', company: 'Microsoft Corporation', price: 425.22, changePercent: 1.16, changeDirection: 'up', initials: 'M', tone: 'blue' },
  { symbol: 'TSLA', company: 'Tesla, Inc.', price: 172.63, changePercent: 1.34, changeDirection: 'down', initials: 'T', tone: 'red' },
  { symbol: 'AMZN', company: 'Amazon.com, Inc.', price: 180.96, changePercent: 0.58, changeDirection: 'up', initials: 'a', tone: 'amber' },
]

type MarketMover = {
  symbol: string
  company: string
  price: number
  changePercent: number
}

const topGainers: MarketMover[] = [
  { symbol: 'NVDA', company: 'NVIDIA', price: 875.28, changePercent: 2.48 },
  { symbol: 'META', company: 'Meta Platforms', price: 505.95, changePercent: 1.82 },
  { symbol: 'MSFT', company: 'Microsoft', price: 425.22, changePercent: 1.16 },
]

const topLosers: MarketMover[] = [
  { symbol: 'TSLA', company: 'Tesla', price: 172.63, changePercent: -1.34 },
  { symbol: 'INTC', company: 'Intel', price: 43.12, changePercent: -0.86 },
  { symbol: 'DIS', company: 'Walt Disney', price: 112.46, changePercent: -0.42 },
]

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function formatMoney(value: number) {
  return money.format(value)
}

function formatChange(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function ArrowMark({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg className={`market-arrow market-arrow-${direction}`} viewBox="0 0 12 12" aria-hidden="true">
      <path d={direction === 'up' ? 'M2 8.5 8.5 2M3 2h5.5v5.5' : 'M2 3.5 8.5 10M3 10h5.5V4.5'} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MarketMoverList({ movers, direction }: { movers: MarketMover[]; direction: 'up' | 'down' }) {
  if (movers.length === 0) {
    return <p className="dashboard-empty" role="status">No {direction === 'up' ? 'gainers' : 'losers'} to show right now.</p>
  }

  return (
    <ul className="mover-list">
      {movers.map((mover) => (
        <li className="mover-row" key={mover.symbol}>
          <div className="mover-company">
            <span className={`mover-symbol mover-symbol-${direction}`}>{mover.symbol.slice(0, 1)}</span>
            <span className="mover-name-wrap">
              <strong>{mover.symbol}</strong>
              <span>{mover.company}</span>
            </span>
          </div>
          <div className="mover-value">
            <span>{formatMoney(mover.price)}</span>
            <span className={`change-value change-${direction}`}>
              <ArrowMark direction={direction} /> {formatChange(mover.changePercent)}
            </span>
          </div>
        </li>
      ))}
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
  // Replace this mock-ready flag with the dashboard data request state when an API is added.
  const isLoading = false

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
                      <caption className="visually-hidden">Mock stock watchlist with current prices and daily percentage changes</caption>
                      <thead><tr><th scope="col">Company</th><th scope="col">Price</th><th scope="col">Daily change</th></tr></thead>
                      <tbody>
                        {watchlist.map((stock) => (
                          <tr key={stock.symbol}>
                            <th scope="row">
                              <span className={`company-avatar avatar-${stock.tone}`} aria-hidden="true">{stock.initials}</span>
                              <span className="watchlist-company"><strong>{stock.symbol}</strong><span>{stock.company}</span></span>
                            </th>
                            <td>{formatMoney(stock.price)}</td>
                            <td><span className={`change-badge change-${stock.changeDirection}`}><ArrowMark direction={stock.changeDirection} /> {formatChange(stock.changePercent)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mock-data-note"><span aria-hidden="true">ⓘ</span> Sample data for demonstration only</p>
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
                  <MarketMoverList movers={topGainers} direction="up" />
                </section>

                <section className="dashboard-panel movers-panel" aria-labelledby="losers-title">
                  <div className="panel-heading movers-heading">
                    <div className="panel-title-group">
                      <span className="movers-heading-mark movers-mark-down" aria-hidden="true"><ArrowMark direction="down" /></span>
                      <div><h2 id="losers-title">Top losers</h2><p>Biggest dips today</p></div>
                    </div>
                    <span className="market-period-label">TODAY</span>
                  </div>
                  <MarketMoverList movers={topLosers} direction="down" />
                </section>
              </div>
            </div>

            <footer className="dashboard-disclaimer">
              <span className="disclaimer-symbol" aria-hidden="true">i</span>
              <p><strong>Educational use only.</strong> MarketSim is a paper-trading application. All prices, holdings, and performance figures shown are mock data for educational purposes and do not represent real market activity. This information is not financial advice.</p>
            </footer>
          </>
        )}
      </main>
    </div>
  )
}
