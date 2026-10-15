import math
import os
import re
import time
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Callable

import httpx

from app.schemas import StockHistoryResponse, StockPricePoint, StockQuoteResponse

TWELVE_DATA_URL = "https://api.twelvedata.com/quote"
TWELVE_DATA_TIME_SERIES_URL = "https://api.twelvedata.com/time_series"
API_KEY_ENV_VAR = "TWELVE_DATA_API_KEY"
REQUEST_TIMEOUT_SECONDS = 5.0
CACHE_TTL_SECONDS = 60.0
DAILY_INTERVAL = "1day"
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


def _configured_api_key() -> str:
    api_key = os.getenv(API_KEY_ENV_VAR)
    if api_key is None or not api_key.strip():
        raise MissingApiKeyError
    return api_key.strip()


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


def _parse_optional_volume(payload: dict[str, object]) -> int | None:
    value = payload.get("volume")
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise InvalidProviderResponseError
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as error:
        raise InvalidProviderResponseError from error
    if not number.is_finite() or number < 0 or number != number.to_integral_value():
        raise InvalidProviderResponseError
    return int(number)


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
        self._history_cache: dict[
            tuple[str, int], tuple[float, StockHistoryResponse]
        ] = {}

    async def _request_provider(
        self,
        url: str,
        params: dict[str, str | int],
        api_key: str,
    ) -> httpx.Response:
        try:
            async with httpx.AsyncClient(
                transport=self._transport,
                timeout=self._timeout,
            ) as client:
                return await client.get(
                    url,
                    params=params,
                    headers={"Authorization": f"apikey {api_key}"},
                )
        except httpx.TimeoutException as error:
            raise ProviderTimeoutError from error
        except httpx.RequestError as error:
            raise ProviderError from error

    async def get_quote(self, symbol: str) -> StockQuoteResponse:
        normalized_symbol = normalize_symbol(symbol)
        api_key = _configured_api_key()

        cached = self._cache.get(normalized_symbol)
        now = self._clock()
        if cached is not None:
            expires_at, quote = cached
            if expires_at > now:
                return quote
            self._cache.pop(normalized_symbol, None)

        response = await self._request_provider(
            TWELVE_DATA_URL,
            {"symbol": normalized_symbol},
            api_key,
        )

        quote = self._parse_provider_response(response, normalized_symbol)
        self._cache[normalized_symbol] = (self._clock() + self._cache_ttl, quote)
        return quote

    async def get_history(
        self,
        symbol: str,
        days: int = 30,
    ) -> StockHistoryResponse:
        normalized_symbol = normalize_symbol(symbol)
        api_key = _configured_api_key()

        cache_key = (normalized_symbol, days)
        cached = self._history_cache.get(cache_key)
        now = self._clock()
        if cached is not None:
            expires_at, history = cached
            if expires_at > now:
                return history
            self._history_cache.pop(cache_key, None)

        response = await self._request_provider(
            TWELVE_DATA_TIME_SERIES_URL,
            {
                "symbol": normalized_symbol,
                "interval": DAILY_INTERVAL,
                "outputsize": days,
            },
            api_key,
        )

        history = self._parse_history_response(response, normalized_symbol)
        self._history_cache[cache_key] = (
            self._clock() + self._cache_ttl,
            history,
        )
        return history

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

    @staticmethod
    def _parse_history_response(
        response: httpx.Response,
        requested_symbol: str,
    ) -> StockHistoryResponse:
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
        if code == 429:
            raise ProviderRateLimitError
        if code == 404 or _looks_like_unknown_stock(payload):
            raise UnknownStockError
        if (
            response.status_code >= 400
            or (code is not None and code >= 400)
            or payload.get("status") == "error"
        ):
            raise ProviderError
        if response.status_code != 200:
            raise ProviderError

        metadata = payload.get("meta")
        values = payload.get("values")
        if not isinstance(metadata, dict) or not isinstance(values, list):
            raise InvalidProviderResponseError

        response_symbol = metadata.get("symbol")
        if (
            not isinstance(response_symbol, str)
            or response_symbol.strip().upper() != requested_symbol
        ):
            raise InvalidProviderResponseError

        prices: list[tuple[datetime, StockPricePoint]] = []
        for value in values:
            if not isinstance(value, dict):
                raise InvalidProviderResponseError
            timestamp_value = value.get("datetime", value.get("date"))
            if not isinstance(timestamp_value, str) or not timestamp_value.strip():
                raise InvalidProviderResponseError
            timestamp_text = timestamp_value.strip()
            try:
                parsed_timestamp = datetime.fromisoformat(
                    timestamp_text.replace("Z", "+00:00")
                )
            except ValueError as error:
                raise InvalidProviderResponseError from error
            if parsed_timestamp.tzinfo is None:
                parsed_timestamp = parsed_timestamp.replace(tzinfo=timezone.utc)
            else:
                parsed_timestamp = parsed_timestamp.astimezone(timezone.utc)

            prices.append(
                (
                    parsed_timestamp,
                    StockPricePoint(
                        datetime=timestamp_text,
                        open=_parse_number(value, "open"),
                        high=_parse_number(value, "high"),
                        low=_parse_number(value, "low"),
                        close=_parse_number(value, "close"),
                        volume=_parse_optional_volume(value),
                    ),
                )
            )

        prices.sort(key=lambda price: price[0])
        return StockHistoryResponse(
            symbol=requested_symbol,
            exchange=_optional_text(metadata, "exchange"),
            currency=_optional_text(metadata, "currency"),
            interval=DAILY_INTERVAL,
            prices=[price for _, price in prices],
        )
