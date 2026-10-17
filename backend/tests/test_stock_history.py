from collections.abc import Awaitable, Callable
from secrets import token_hex

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.services.market_data import MarketDataService

MOCK_PROVIDER_HISTORY = {
    "meta": {
        "symbol": "AAPL",
        "interval": "1day",
        "currency": "USD",
        "exchange": "NASDAQ",
    },
    "values": [
        {
            "datetime": "2026-10-10",
            "open": "256.00",
            "high": "258.00",
            "low": "255.00",
            "close": "257.25",
        },
        {
            "datetime": "2026-10-08",
            "open": "253.00",
            "high": "256.00",
            "low": "252.50",
            "close": "255.45",
            "volume": "1234567",
        },
    ],
}


def make_client(
    monkeypatch: pytest.MonkeyPatch,
    handler: Callable[[httpx.Request], Awaitable[httpx.Response]],
    *,
    clock: Callable[[], float] | None = None,
    cache_ttl: float = 60.0,
    api_key: bool = True,
) -> TestClient:
    if api_key:
        monkeypatch.setenv("TWELVE_DATA_API_KEY", f"mock-{token_hex(16)}")
    else:
        monkeypatch.delenv("TWELVE_DATA_API_KEY", raising=False)
    service_options: dict[str, object] = {
        "transport": httpx.MockTransport(handler),
        "cache_ttl": cache_ttl,
    }
    if clock is not None:
        service_options["clock"] = clock
    monkeypatch.setattr(main, "market_data_service", MarketDataService(**service_options))
    return TestClient(main.app)


def history_response(
    *, values: list[dict[str, object]] | None = None,
) -> httpx.Response:
    payload = {**MOCK_PROVIDER_HISTORY}
    if values is not None:
        payload["values"] = values
    return httpx.Response(200, json=payload)


def test_history_returns_typed_oldest_to_newest_prices_and_normalizes_symbol(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return history_response()

    response = make_client(monkeypatch, handler).get(
        "/api/stocks/%20aapl%20/history"
    )

    assert response.status_code == 200
    assert response.json() == {
        "symbol": "AAPL",
        "exchange": "NASDAQ",
        "currency": "USD",
        "interval": "1day",
        "prices": [
            {
                "datetime": "2026-10-08",
                "open": 253.0,
                "high": 256.0,
                "low": 252.5,
                "close": 255.45,
                "volume": 1234567,
            },
            {
                "datetime": "2026-10-10",
                "open": 256.0,
                "high": 258.0,
                "low": 255.0,
                "close": 257.25,
                "volume": None,
            },
        ],
    }
    assert len(requests) == 1
    assert requests[0].url.path == "/time_series"
    assert requests[0].url.params["symbol"] == "AAPL"
    assert requests[0].url.params["interval"] == "1day"
    assert requests[0].url.params["outputsize"] == "30"
    assert "apikey" not in str(requests[0].url)


def test_history_custom_days_are_sent_to_twelve_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return history_response()

    response = make_client(monkeypatch, handler).get(
        "/api/stocks/AAPL/history?days=7"
    )

    assert response.status_code == 200
    assert requests[0].url.params["outputsize"] == "7"


@pytest.mark.parametrize("symbol", ["AAPL%21", "%20%20", "ABCDEFGHIJKLMNOP"])
def test_invalid_history_symbol_is_rejected_without_provider_request(
    monkeypatch: pytest.MonkeyPatch,
    symbol: str,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("Invalid symbols must not reach Twelve Data")

    response = make_client(monkeypatch, handler).get(
        f"/api/stocks/{symbol}/history"
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid stock symbol."}


@pytest.mark.parametrize("days", ["0", "366", "not-a-number"])
def test_invalid_days_are_rejected_without_provider_request(
    monkeypatch: pytest.MonkeyPatch,
    days: str,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("Invalid days must not reach Twelve Data")

    response = make_client(monkeypatch, handler).get(
        f"/api/stocks/AAPL/history?days={days}"
    )

    assert response.status_code == 422


def test_missing_api_key_returns_safe_service_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("No request should be made without an API key")

    response = make_client(monkeypatch, handler, api_key=False).get(
        "/api/stocks/AAPL/history"
    )

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Stock history service is not configured."
    }


def test_unknown_stock_maps_to_safe_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "code": 404,
                "message": "The symbol was not found: AAPX",
                "status": "error",
            },
        )

    response = make_client(monkeypatch, handler).get(
        "/api/stocks/AAPX/history"
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Stock symbol was not found."}
    assert "AAPX" not in response.text


@pytest.mark.parametrize(
    ("status_code", "body"),
    [
        (429, {"code": 429, "message": "Provider quota exceeded", "status": "error"}),
        (429, None),
        (200, {"code": 429, "message": "Provider quota exceeded", "status": "error"}),
    ],
)
def test_provider_rate_limit_maps_to_safe_too_many_requests(
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
    body: dict[str, object] | None,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json=body)

    response = make_client(monkeypatch, handler).get(
        "/api/stocks/AAPL/history"
    )

    assert response.status_code == 429
    assert "Provider quota" not in response.text


def test_provider_error_maps_to_safe_bad_gateway(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"code": 400, "message": "private provider details", "status": "error"},
        )

    response = make_client(monkeypatch, handler).get(
        "/api/stocks/AAPL/history"
    )

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Unable to retrieve historical stock data from the provider."
    }
    assert "private provider details" not in response.text


def test_network_timeout_maps_to_safe_gateway_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("private timeout details", request=request)

    response = make_client(monkeypatch, handler).get(
        "/api/stocks/AAPL/history"
    )

    assert response.status_code == 504
    assert response.json() == {
        "detail": "Stock history provider request timed out."
    }
    assert "private timeout details" not in response.text


def test_network_failure_maps_to_safe_bad_gateway(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("private network details", request=request)

    response = make_client(monkeypatch, handler).get(
        "/api/stocks/AAPL/history"
    )

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Unable to retrieve historical stock data from the provider."
    }
    assert "private network details" not in response.text


@pytest.mark.parametrize(
    "provider_response",
    [
        httpx.Response(200, content=b"not json"),
        httpx.Response(200, json=["not", "an", "object"]),
        httpx.Response(200, json={"values": []}),
        httpx.Response(200, json={"meta": {"symbol": "AAPL"}}),
        httpx.Response(
            200,
            json={
                "meta": {"symbol": "AAPL"},
                "values": [{"datetime": "2026-10-10", "open": "NaN"}],
            },
        ),
    ],
)
def test_malformed_provider_responses_map_to_safe_bad_gateway(
    monkeypatch: pytest.MonkeyPatch,
    provider_response: httpx.Response,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return provider_response

    response = make_client(monkeypatch, handler).get(
        "/api/stocks/AAPL/history"
    )

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Stock history provider returned invalid data."
    }


def test_empty_history_is_returned_as_an_empty_price_list(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return history_response(values=[])

    response = make_client(monkeypatch, handler).get(
        "/api/stocks/AAPL/history"
    )

    assert response.status_code == 200
    assert response.json()["prices"] == []


def test_history_cache_reuses_same_normalized_symbol_and_days(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request_count = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal request_count
        request_count += 1
        return history_response()

    client = make_client(monkeypatch, handler)

    assert client.get("/api/stocks/%20aapl/history?days=30").status_code == 200
    assert client.get("/api/stocks/AAPL/history?days=30").status_code == 200
    assert request_count == 1


def test_history_cache_uses_separate_entries_for_each_days_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return history_response()

    client = make_client(monkeypatch, handler)

    assert client.get("/api/stocks/AAPL/history?days=30").status_code == 200
    assert client.get("/api/stocks/AAPL/history?days=90").status_code == 200
    assert client.get("/api/stocks/AAPL/history?days=30").status_code == 200
    assert [request.url.params["outputsize"] for request in requests] == [
        "30",
        "90",
    ]


def test_history_cache_expires_after_sixty_seconds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = [100.0]
    request_count = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal request_count
        request_count += 1
        return history_response()

    client = make_client(monkeypatch, handler, clock=lambda: now[0])

    assert client.get("/api/stocks/AAPL/history").status_code == 200
    assert client.get("/api/stocks/AAPL/history").status_code == 200
    assert request_count == 1

    now[0] += 60.0
    assert client.get("/api/stocks/AAPL/history").status_code == 200
    assert request_count == 2
