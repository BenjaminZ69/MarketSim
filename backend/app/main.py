from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import StockQuoteResponse
from app.services.market_data import (
    InvalidProviderResponseError,
    InvalidStockSymbolError,
    MarketDataService,
    MissingApiKeyError,
    ProviderError,
    ProviderRateLimitError,
    ProviderTimeoutError,
    UnknownStockError,
)

app = FastAPI(title="MarketSim API")
market_data_service = MarketDataService()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["Accept", "Content-Type"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "MarketSim API"}


@app.get("/api/stocks/{symbol}/quote", response_model=StockQuoteResponse)
async def stock_quote(symbol: str) -> StockQuoteResponse:
    try:
        return await market_data_service.get_quote(symbol)
    except InvalidStockSymbolError as error:
        raise HTTPException(
            status_code=422,
            detail="Invalid stock symbol.",
        ) from error
    except MissingApiKeyError as error:
        raise HTTPException(
            status_code=503,
            detail="Stock quote service is not configured.",
        ) from error
    except UnknownStockError as error:
        raise HTTPException(
            status_code=404,
            detail="Stock symbol was not found.",
        ) from error
    except ProviderRateLimitError as error:
        raise HTTPException(
            status_code=429,
            detail="Stock quote provider rate limit reached. Try again later.",
        ) from error
    except ProviderTimeoutError as error:
        raise HTTPException(
            status_code=504,
            detail="Stock quote provider request timed out.",
        ) from error
    except InvalidProviderResponseError as error:
        raise HTTPException(
            status_code=502,
            detail="Stock quote provider returned invalid data.",
        ) from error
    except ProviderError as error:
        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve a stock quote from the provider.",
        ) from error
