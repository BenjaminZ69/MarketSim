from pydantic import BaseModel


class StockQuoteResponse(BaseModel):
    symbol: str
    company_name: str | None
    exchange: str | None
    currency: str | None
    price: float
    previous_close: float
    change: float
    percent_change: float
    daily_high: float
    daily_low: float
    last_updated: str
