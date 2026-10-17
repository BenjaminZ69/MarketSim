import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getStockQuote, type StockQuote } from '../services/api'
import { clearDemoSession } from '../services/demoSession'
import {
  applyPaperTrade,
  isValidStockSymbol,
  loadPaperPortfolio,
  normalizeStockSymbol,
  parseTradeQuantity,
  PaperTradeError,
  savePaperPortfolio,
  summarizePortfolio,
  updateHoldingLatestPrice,
  type PaperPortfolio,
  type TradeAction,
} from '../services/paperPortfolio'
import '../styles/PortfolioPage.css'

type Feedback = {
  kind: 'success' | 'validation' | 'unavailable' | 'error'
  text: string
} | null

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function validateTrade(symbol: string, quantityText: string): { symbol: string; quantity: number } | string {
  const normalizedSymbol = normalizeStockSymbol(symbol)
  if (!isValidStockSymbol(normalizedSymbol)) return 'Enter a valid stock symbol, such as AAPL.'
  const quantity = parseTradeQuantity(quantityText)
  if (quantity === null) return 'Enter a positive whole number of shares.'
  return { symbol: normalizedSymbol, quantity }
}

function tradeErrorMessage(error: unknown): string {
  if (!(error instanceof PaperTradeError)) return 'The trade could not be completed. Please try again.'
  switch (error.code) {
    case 'invalid-symbol': return 'Enter a valid stock symbol.'
    case 'invalid-quantity': return 'Enter a positive whole number of shares.'
    case 'unavailable-price': return 'A valid price is unavailable for this symbol. No trade was placed.'
    case 'insufficient-cash': return 'This purchase exceeds your available virtual cash.'
    case 'insufficient-shares': return 'You do not own enough shares to complete this sale.'
  }
}

export default function PortfolioPage() {
  const navigate = useNavigate()
  const [portfolio, setPortfolio] = useState<PaperPortfolio>(() => loadPaperPortfolio())
  const [symbol, setSymbol] = useState('AAPL')
  const [quantity, setQuantity] = useState('1')
  const [previewQuote, setPreviewQuote] = useState<StockQuote | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const processingRef = useRef(false)
  const summary = summarizePortfolio(portfolio)

  function validateInputs(): { symbol: string; quantity: number } | null {
    const result = validateTrade(symbol, quantity)
    if (typeof result === 'string') {
      setFeedback({ kind: 'validation', text: result })
      return null
    }
    setSymbol(result.symbol)
    return result
  }

  async function loadQuote(tradeAction: TradeAction | null) {
    if (processingRef.current) return
    const validInput = validateInputs()
    if (!validInput) return

    processingRef.current = true
    setIsProcessing(true)
    setFeedback(null)
    setPreviewQuote(null)
    try {
      const quote = await getStockQuote(validInput.symbol)
      if (normalizeStockSymbol(quote.symbol) !== validInput.symbol || quote.currency !== 'USD' || !Number.isFinite(quote.price) || quote.price <= 0) {
        setPreviewQuote(null)
        setFeedback({ kind: 'unavailable', text: 'A current USD price is unavailable for this symbol. No trade was placed.' })
        return
      }
      setPreviewQuote(quote)

      if (!tradeAction) {
        setFeedback({ kind: 'success', text: `Latest available quote loaded for ${validInput.symbol}.` })
        return
      }

      const action = tradeAction
      const nextPortfolio = applyPaperTrade(portfolio, action, quote, validInput.quantity)
      try {
        savePaperPortfolio(nextPortfolio)
      } catch {
        setFeedback({ kind: 'error', text: 'The demo portfolio could not be saved locally. No trade was applied.' })
        return
      }
      setPortfolio(nextPortfolio)
      setFeedback({
        kind: 'success',
        text: `${action === 'buy' ? 'Bought' : 'Sold'} ${validInput.quantity} ${validInput.symbol} share${validInput.quantity === 1 ? '' : 's'} at ${formatMoney(quote.price)} per share.`,
      })
    } catch (error) {
      setPreviewQuote(null)
      if (error instanceof PaperTradeError) {
        setFeedback({
          kind: error.code === 'unavailable-price' ? 'unavailable' : 'validation',
          text: tradeErrorMessage(error),
        })
      } else {
        setFeedback({ kind: 'error', text: 'The quote service is unavailable. No trade was placed.' })
      }
    } finally {
      processingRef.current = false
      setIsProcessing(false)
    }
  }

  function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void loadQuote(null)
  }

  function handleTrade(action: TradeAction) {
    if (processingRef.current) return
    const validated = validateInputs()
    if (!validated) return
    void loadQuote(action)
  }

  async function refreshHoldingPrices() {
    if (processingRef.current || portfolio.holdings.length === 0) return
    processingRef.current = true
    setIsProcessing(true)
    setFeedback(null)
    try {
      const results = await Promise.allSettled(
        portfolio.holdings.map((holding) => getStockQuote(holding.symbol)),
      )
      const validQuotes = results.flatMap((result, index) => {
        if (result.status !== 'fulfilled') return []
        const quote = result.value
        return normalizeStockSymbol(quote.symbol) === portfolio.holdings[index].symbol
          && quote.currency === 'USD'
          && Number.isFinite(quote.price)
          && quote.price > 0
          ? [quote]
          : []
      })
      if (validQuotes.length === 0) {
        setFeedback({ kind: 'unavailable', text: 'No holding prices could be refreshed. Your saved portfolio was not changed.' })
        return
      }

      const nextPortfolio = validQuotes.reduce(
        (current, quote) => updateHoldingLatestPrice(current, quote.symbol, quote.price),
        portfolio,
      )
      try {
        savePaperPortfolio(nextPortfolio)
      } catch {
        setFeedback({ kind: 'error', text: 'Updated prices could not be saved locally. Your saved portfolio was not changed.' })
        return
      }
      setPortfolio(nextPortfolio)
      setFeedback({
        kind: validQuotes.length === portfolio.holdings.length ? 'success' : 'unavailable',
        text: validQuotes.length === portfolio.holdings.length
          ? 'Latest available prices updated.'
          : `Updated ${validQuotes.length} of ${portfolio.holdings.length} holding prices. Some prices are unavailable.`,
      })
    } finally {
      processingRef.current = false
      setIsProcessing(false)
    }
  }

  function signOut() {
    clearDemoSession()
    navigate('/login', { replace: true })
  }

  return (
    <div className="portfolio-page">
      <header className="portfolio-header">
        <div className="portfolio-header-inner">
          <Link className="portfolio-brand" to="/dashboard" aria-label="MarketSim dashboard">
            <span className="portfolio-brand-mark" aria-hidden="true">↗</span>
            <span>Market<span>Sim</span></span>
          </Link>
          <nav className="portfolio-nav" aria-label="Main navigation">
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/portfolio" aria-current="page">Portfolio</Link>
          </nav>
          <div className="portfolio-header-actions">
            <span className="portfolio-demo-tag">PAPER TRADING</span>
            <button className="portfolio-signout" type="button" onClick={signOut}>Sign Out</button>
          </div>
        </div>
      </header>

      <main className="portfolio-main">
        <div className="portfolio-page-heading">
          <div>
            <p className="portfolio-eyebrow">MARKETSIM PAPER ACCOUNT</p>
            <h1>Portfolio</h1>
            <p>Practice buying and selling with virtual cash and live market quotes.</p>
          </div>
          <Link className="portfolio-back-link" to="/dashboard">← Back to dashboard</Link>
        </div>

        <section className="paper-summary" aria-label="Portfolio summary">
          <article className="paper-summary-card">
            <span>Available virtual cash</span>
            <strong>{formatMoney(summary.availableCash)}</strong>
          </article>
          <article className="paper-summary-card">
            <span>Current holdings value</span>
            <strong>{formatMoney(summary.holdingsValue)}</strong>
          </article>
          <article className="paper-summary-card paper-summary-total">
            <span>Total portfolio value</span>
            <strong>{formatMoney(summary.totalValue)}</strong>
          </article>
          <article className="paper-summary-card">
            <span>Unrealized profit / loss</span>
            <strong className={summary.unrealizedProfitLoss >= 0 ? 'paper-positive' : 'paper-negative'}>
              {summary.unrealizedProfitLoss > 0 ? '+' : ''}{formatMoney(summary.unrealizedProfitLoss)}
            </strong>
            <small>{summary.unrealizedProfitLoss >= 0 ? 'Gain' : 'Loss'}</small>
          </article>
        </section>

        <section className="portfolio-panel trade-panel" aria-labelledby="trade-title">
          <div className="portfolio-panel-heading">
            <div>
              <h2 id="trade-title">Place a paper trade</h2>
              <p>Each trade uses a fresh USD quote from the MarketSim API.</p>
            </div>
            <span className="virtual-cash-note">Virtual balance · {formatMoney(summary.availableCash)}</span>
          </div>

          <form className="trade-form" onSubmit={handlePreview} noValidate>
            <div className="trade-field">
              <label htmlFor="trade-symbol">Stock symbol</label>
              <input
                id="trade-symbol"
                name="symbol"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={15}
                placeholder="AAPL"
                value={symbol}
                disabled={isProcessing}
                onChange={(event) => {
                  setSymbol(event.target.value.toUpperCase())
                  setFeedback(null)
                  setPreviewQuote(null)
                }}
                aria-describedby="symbol-hint"
              />
              <small id="symbol-hint">Letters and numbers, for example AAPL or BRK.B.</small>
            </div>
            <div className="trade-field trade-quantity-field">
              <label htmlFor="trade-quantity">Quantity</label>
              <input
                id="trade-quantity"
                name="quantity"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={quantity}
                disabled={isProcessing}
                onChange={(event) => {
                  setQuantity(event.target.value)
                  setFeedback(null)
                }}
                aria-describedby="quantity-hint"
              />
              <small id="quantity-hint">Enter a positive whole number of shares.</small>
            </div>
            <button className="quote-preview-button" type="submit" disabled={isProcessing}>
              {isProcessing ? 'Checking quote…' : 'Preview quote'}
            </button>
            <div className="trade-actions">
              <button className="buy-button" type="button" disabled={isProcessing} onClick={() => handleTrade('buy')}>
                {isProcessing ? 'Processing…' : 'Buy'}
              </button>
              <button className="sell-button" type="button" disabled={isProcessing} onClick={() => handleTrade('sell')}>
                {isProcessing ? 'Processing…' : 'Sell'}
              </button>
            </div>
          </form>

          {previewQuote && (
            <div className="quote-preview" role="status">
              <span><strong>{previewQuote.symbol}</strong> latest available price</span>
              <strong>{formatMoney(previewQuote.price)}</strong>
              <small>Quote date: {previewQuote.last_updated}</small>
            </div>
          )}
          {feedback && (
            <p className={`trade-feedback trade-feedback-${feedback.kind}`} role={feedback.kind === 'success' ? 'status' : 'alert'}>
              <span aria-hidden="true">{feedback.kind === 'success' ? '✓' : '!'}</span> {feedback.text}
            </p>
          )}
        </section>

        <section className="portfolio-panel holdings-panel" aria-labelledby="holdings-title">
          <div className="portfolio-panel-heading">
            <div>
              <h2 id="holdings-title">Your holdings</h2>
              <p>Prices reflect the latest quote used for each holding.</p>
            </div>
            <div className="holdings-heading-actions">
              <span className="holding-count">{portfolio.holdings.length} {portfolio.holdings.length === 1 ? 'position' : 'positions'}</span>
              {portfolio.holdings.length > 0 && (
                <button className="refresh-prices-button" type="button" disabled={isProcessing} onClick={() => void refreshHoldingPrices()}>
                  {isProcessing ? 'Updating…' : 'Refresh prices'}
                </button>
              )}
            </div>
          </div>
          {portfolio.holdings.length === 0 ? (
            <p className="portfolio-empty" role="status">You don’t have any holdings yet. Preview a quote and place your first paper trade.</p>
          ) : (
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <caption className="portfolio-visually-hidden">Paper-trading holdings and unrealized profit or loss</caption>
                <thead><tr><th scope="col">Symbol</th><th scope="col">Shares owned</th><th scope="col">Average purchase price</th><th scope="col">Latest available price</th><th scope="col">Market value</th><th scope="col">Unrealized P/L</th></tr></thead>
                <tbody>
                  {portfolio.holdings.map((holding) => {
                    const marketValue = holding.latestPrice * holding.shares
                    const profitLoss = marketValue - holding.averagePurchasePrice * holding.shares
                    return (
                      <tr key={holding.symbol}>
                        <th scope="row">{holding.symbol}</th>
                        <td>{holding.shares.toLocaleString('en-US')}</td>
                        <td>{formatMoney(holding.averagePurchasePrice)}</td>
                        <td>{formatMoney(holding.latestPrice)}</td>
                        <td>{formatMoney(marketValue)}</td>
                        <td className={profitLoss >= 0 ? 'paper-positive' : 'paper-negative'}>
                          {profitLoss > 0 ? '+' : ''}{formatMoney(profitLoss)} <span>({profitLoss >= 0 ? 'Gain' : 'Loss'})</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="portfolio-panel transactions-panel" aria-labelledby="transactions-title">
          <div className="portfolio-panel-heading">
            <div>
              <h2 id="transactions-title">Transaction history</h2>
              <p>Every completed paper trade is saved in this browser.</p>
            </div>
            <span className="holding-count">{portfolio.transactions.length} {portfolio.transactions.length === 1 ? 'trade' : 'trades'}</span>
          </div>
          {portfolio.transactions.length === 0 ? (
            <p className="portfolio-empty" role="status">No transactions yet. Your completed buys and sells will appear here.</p>
          ) : (
            <div className="portfolio-table-wrap">
              <table className="portfolio-table transaction-table">
                <caption className="portfolio-visually-hidden">Paper-trading transaction history</caption>
                <thead><tr><th scope="col">Action</th><th scope="col">Symbol</th><th scope="col">Quantity</th><th scope="col">Execution price</th><th scope="col">Total</th><th scope="col">Date and time</th></tr></thead>
                <tbody>
                  {portfolio.transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td><span className={`transaction-action transaction-action-${transaction.action}`}>{transaction.action === 'buy' ? 'Buy' : 'Sell'}</span></td>
                      <th scope="row">{transaction.symbol}</th>
                      <td>{transaction.quantity.toLocaleString('en-US')}</td>
                      <td>{formatMoney(transaction.executionPrice)}</td>
                      <td>{formatMoney(transaction.total)}</td>
                      <td>{formatDate(transaction.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="paper-disclaimer" aria-label="Paper trading disclaimer">
          <strong>Educational simulation only.</strong> Trades use virtual funds and do not connect to a brokerage or involve real money. MarketSim is not financial advice.
        </aside>
      </main>
    </div>
  )
}
