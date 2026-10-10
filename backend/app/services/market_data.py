import math
import os
import re
import time
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Callable

import httpx

from app.schemas import StockQuoteResponse

TWELVE_DATA_URL = "https://api.twelvedata.com/quote"
API_KEY_ENV_VAR = "TWELVE_DATA_API_KEY"
REQUEST_TIMEOUT_SECONDS = 5.0
CACHE_TTL_SECONDS = 60.0
MAX_SYMBOL_LENGTH = 15
SYMBOL_PATTERN = re.compile(r"^[A-Z0-9]+(?:[.-][A-Z0-9]+)*$")


class MarketDataError(Exception):
    """Base class for safe, expected market-data failures."""


class InvalidStockSymbolError(MarketDataError):
    pass


class MissingApiKeyError(MarketDataError):
    pass


class UnknownStockError(MarketDataError):
    pass


class ProviderRateLimitError(MarketDataError):
    pass


class ProviderError(MarketDataError):
    pass


class ProviderTimeoutError(MarketDataError):
    pass


class InvalidProviderResponseError(MarketDataError):
    pass


def normalize_symbol(symbol: str) -> str:
    normalized = symbol.strip().upper()
    if (
        not normalized
        or len(normalized) > MAX_SYMBOL_LENGTH
        or SYMBOL_PATTERN.fullmatch(normalized) is None
    ):
        raise InvalidStockSymbolError
    return normalized


def _provider_code(payload: dict[str, object]) -> int | None:
    code = payload.get("code")
    if isinstance(code, bool):
        return None
    try:
        return int(code) if code is not None else None
    except (TypeError, ValueError):
        return None


def _looks_like_unknown_stock(payload: dict[str, object]) -> bool:
    message = payload.get("message")
    if not isinstance(message, str):
        return False
    normalized_message = message.lower()
    return any(
        phrase in normalized_message
        for phrase in (
            "symbol not found",
            "unknown symbol",
            "invalid symbol",
            "instrument not found",
            "no data found",
        )
    )


def _parse_number(payload: dict[str, object], field: str) -> float:
    value = payload.get(field)
    if isinstance(value, bool) or value is None:
        raise InvalidProviderResponseError
    try:
        number = float(Decimal(str(value)))
    except (InvalidOperation, TypeError, ValueError, OverflowError) as error:
        raise InvalidProviderResponseError from error
    if not math.isfinite(number):
        raise InvalidProviderResponseError
    return number


def _optional_text(payload: dict[str, object], field: str) -> str | None:
    value = payload.get(field)
    if value is None:
        return None
    if not isinstance(value, str):
        raise InvalidProviderResponseError
    return value.strip() or None


def _last_updated(payload: dict[str, object]) -> str:
    value = payload.get("datetime")
    if isinstance(value, str) and value.strip():
        return value.strip()

    timestamp = payload.get("timestamp")
    if isinstance(timestamp, bool) or timestamp is None:
        raise InvalidProviderResponseError
    try:
        unix_time = float(timestamp)
        if not math.isfinite(unix_time):
            raise ValueError
        return datetime.fromtimestamp(unix_time, tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OverflowError, OSError) as error:
        raise InvalidProviderResponseError from error


class MarketDataService:
    def __init__(
        self,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = REQUEST_TIMEOUT_SECONDS,
        cache_ttl: float = CACHE_TTL_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._transport = transport
        self._timeout = timeout
        self._cache_ttl = cache_ttl
        self._clock = clock
        self._cache: dict[str, tuple[float, StockQuoteResponse]] = {}

    async def get_quote(self, symbol: str) -> StockQuoteResponse:
        normalized_symbol = normalize_symbol(symbol)
        api_key = os.getenv(API_KEY_ENV_VAR)
        if api_key is None or not api_key.strip():
            raise MissingApiKeyError

        cached = self._cache.get(normalized_symbol)
        now = self._clock()
        if cached is not None:
            expires_at, quote = cached
            if expires_at > now:
                return quote
            self._cache.pop(normalized_symbol, None)

        try:
            async with httpx.AsyncClient(
                transport=self._transport,
                timeout=self._timeout,
            ) as client:
                response = await client.get(
                    TWELVE_DATA_URL,
                    params={"symbol": normalized_symbol},
                    headers={"Authorization": f"apikey {api_key.strip()}"},
                )
        except httpx.TimeoutException as error:
            raise ProviderTimeoutError from error
        except httpx.RequestError as error:
            raise ProviderError from error

        quote = self._parse_provider_response(response, normalized_symbol)
        self._cache[normalized_symbol] = (self._clock() + self._cache_ttl, quote)
        return quote

    @staticmethod
    def _parse_provider_response(
        response: httpx.Response,
        requested_symbol: str,
    ) -> StockQuoteResponse:
        if response.status_code == 429:
            raise ProviderRateLimitError
        if response.status_code == 404:
            raise UnknownStockError
        if response.status_code >= 500:
            raise ProviderError

        try:
            payload = response.json()
        except (ValueError, UnicodeDecodeError) as error:
            raise InvalidProviderResponseError from error
        if not isinstance(payload, dict):
            raise InvalidProviderResponseError

        code = _provider_code(payload)
        if response.status_code == 429 or code == 429:
            raise ProviderRateLimitError
        if (
            response.status_code == 404
            or code == 404
            or _looks_like_unknown_stock(payload)
        ):
            raise UnknownStockError
        if (
            response.status_code >= 400
            or (code is not None and code >= 400)
            or payload.get("status") == "error"
        ):
            raise ProviderError
        if response.status_code != 200:
            raise ProviderError

        response_symbol = payload.get("symbol")
        if (
            not isinstance(response_symbol, str)
            or response_symbol.strip().upper() != requested_symbol
        ):
            raise InvalidProviderResponseError

        price = _parse_number(payload, "close")
        previous_close = _parse_number(payload, "previous_close")
        change = _parse_number(payload, "change")
        percent_change = _parse_number(payload, "percent_change")
        daily_high = _parse_number(payload, "high")
        daily_low = _parse_number(payload, "low")
        if (
            price <= 0
            or previous_close <= 0
            or daily_high <= 0
            or daily_low <= 0
            or daily_high < daily_low
        ):
            raise InvalidProviderResponseError

        return StockQuoteResponse(
            symbol=requested_symbol,
            company_name=_optional_text(payload, "name"),
            exchange=_optional_text(payload, "exchange"),
            currency=_optional_text(payload, "currency"),
            price=price,
            previous_close=previous_close,
            change=change,
            percent_change=percent_change,
            daily_high=daily_high,
            daily_low=daily_low,
            last_updated=_last_updated(payload),
        )
