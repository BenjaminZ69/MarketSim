from collections.abc import Awaitable, Callable
from secrets import token_hex

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.services.market_data import MarketDataService

MOCK_PROVIDER_QUOTE = {
    "symbol": "AAPL",
    "name": "Apple Inc",
    "exchange": "NASDAQ",
    "currency": "USD",
    "datetime": "2026-10-09",
    "close": "255.45",
    "previous_close": "254.80",
    "change": "0.65",
    "percent_change": "0.2551",
    "high": "257.00",
    "low": "253.90",
}


def make_client(
    monkeypatch: pytest.MonkeyPatch,
    handler: Callable[[httpx.Request], Awaitable[httpx.Response]],
    *,
    clock: Callable[[], float] | None = None,
    cache_ttl: float = 60.0,
) -> TestClient:
    monkeypatch.setenv("TWELVE_DATA_API_KEY", f"mock-{token_hex(16)}")
    service_options: dict[str, object] = {
        "transport": httpx.MockTransport(handler),
        "cache_ttl": cache_ttl,
    }
    if clock is not None:
        service_options["clock"] = clock
    monkeypatch.setattr(main, "market_data_service", MarketDataService(**service_options))
    return TestClient(main.app)


def test_quote_normalizes_symbol_and_returns_typed_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=MOCK_PROVIDER_QUOTE)

    client = make_client(monkeypatch, handler)
    response = client.get("/api/stocks/%20aapl%20/quote")

    assert response.status_code == 200
    assert response.json() == {
        "symbol": "AAPL",
        "company_name": "Apple Inc",
        "exchange": "NASDAQ",
        "currency": "USD",
        "price": 255.45,
        "previous_close": 254.8,
        "change": 0.65,
        "percent_change": 0.2551,
        "daily_high": 257.0,
        "daily_low": 253.9,
        "last_updated": "2026-10-09",
    }
    assert len(requests) == 1
    assert requests[0].url.params["symbol"] == "AAPL"
    assert requests[0].headers["Authorization"].startswith("apikey mock-")
    assert "apikey" not in str(requests[0].url)


@pytest.mark.parametrize("symbol", ["AAPL%21", "%20%20", "ABCDEFGHIJKLMNOP"])
def test_invalid_symbol_is_rejected_without_provider_request(
    monkeypatch: pytest.MonkeyPatch,
    symbol: str,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("Invalid symbols must not reach Twelve Data")

    client = make_client(monkeypatch, handler)

    response = client.get(f"/api/stocks/{symbol}/quote")

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid stock symbol."}


def test_missing_api_key_is_safe_and_does_not_request_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("No request should be made without an API key")

    monkeypatch.delenv("TWELVE_DATA_API_KEY", raising=False)
    monkeypatch.setattr(
        main,
        "market_data_service",
        MarketDataService(transport=httpx.MockTransport(handler)),
    )
    response = TestClient(main.app).get("/api/stocks/AAPL/quote")

    assert response.status_code == 503
    assert response.json() == {"detail": "Stock quote service is not configured."}


def test_unknown_stock_maps_to_404_without_provider_details(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"code": 404, "message": "The symbol was not found: AAPX", "status": "error"},
        )

    response = make_client(monkeypatch, handler).get("/api/stocks/AAPX/quote")

    assert response.status_code == 404
    assert response.json() == {"detail": "Stock symbol was not found."}
    assert "AAPX" not in response.text


def test_http_404_without_json_maps_to_unknown_stock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    response = make_client(monkeypatch, handler).get("/api/stocks/AAPX/quote")

    assert response.status_code == 404
    assert response.json() == {"detail": "Stock symbol was not found."}


@pytest.mark.parametrize(
    ("status_code", "body"),
    [
        (429, {"code": 429, "message": "Provider quota exceeded", "status": "error"}),
        (429, None),
        (200, {"code": 429, "message": "Provider quota exceeded", "status": "error"}),
    ],
)
def test_provider_rate_limit_maps_to_429(
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
    body: dict[str, object] | None,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json=body)

    response = make_client(monkeypatch, handler).get("/api/stocks/AAPL/quote")

    assert response.status_code == 429
    assert "Provider quota" not in response.text


def test_provider_error_maps_to_safe_502(monkeypatch: pytest.MonkeyPatch) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"message": "internal provider details"})

    response = make_client(monkeypatch, handler).get("/api/stocks/AAPL/quote")

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Unable to retrieve a stock quote from the provider."
    }
    assert "internal provider details" not in response.text


def test_network_timeout_maps_to_504(monkeypatch: pytest.MonkeyPatch) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("private timeout details", request=request)

    response = make_client(monkeypatch, handler).get("/api/stocks/AAPL/quote")

    assert response.status_code == 504
    assert response.json() == {
        "detail": "Stock quote provider request timed out."
    }
    assert "private timeout details" not in response.text


def test_network_error_maps_to_safe_502(monkeypatch: pytest.MonkeyPatch) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("private network details", request=request)

    response = make_client(monkeypatch, handler).get("/api/stocks/AAPL/quote")

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Unable to retrieve a stock quote from the provider."
    }
    assert "private network details" not in response.text


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, content=b"not json"),
        httpx.Response(200, json={"symbol": "AAPL", "status": "ok"}),
        httpx.Response(200, json={**MOCK_PROVIDER_QUOTE, "high": "NaN"}),
    ],
)
def test_invalid_provider_responses_map_to_safe_502(
    monkeypatch: pytest.MonkeyPatch,
    response: httpx.Response,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return response

    result = make_client(monkeypatch, handler).get("/api/stocks/AAPL/quote")

    assert result.status_code == 502
    assert result.json() == {"detail": "Stock quote provider returned invalid data."}


def test_quote_cache_expires_after_sixty_seconds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = [100.0]
    request_count = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal request_count
        request_count += 1
        return httpx.Response(200, json=MOCK_PROVIDER_QUOTE)

    client = make_client(monkeypatch, handler, clock=lambda: now[0])

    assert client.get("/api/stocks/aapl/quote").status_code == 200
    assert client.get("/api/stocks/AAPL/quote").status_code == 200
    assert request_count == 1

    now[0] += 60.0
    assert client.get("/api/stocks/AAPL/quote").status_code == 200
    assert request_count == 2
