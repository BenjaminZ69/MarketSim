# MarketSim API

Initial FastAPI backend for MarketSim.

## Requirements

Python 3.10 or newer.

## Set up

From the repository root, create a virtual environment:

```sh
python3 -m venv backend/.venv
```

Activate it on macOS:

```sh
source backend/.venv/bin/activate
```

Install the backend dependencies:

```sh
python -m pip install -r backend/requirements.txt
```

## Twelve Data API key

Copy the example environment file, replace `your_key_here` with your Twelve
Data API key in `backend/.env`, and keep that file private:

```sh
cp backend/.env.example backend/.env
```

Load the local environment file into the current macOS shell before starting
the server:

```sh
set -a
source backend/.env
set +a
```

`backend/.env` is ignored by Git. Keep the key in the backend environment; do
not add it to frontend configuration.

## Run the server

From the repository root, run:

```sh
uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

The health endpoint is available at <http://127.0.0.1:8000/api/health>.

## Stock quotes

Get a normalized quote for a stock symbol:

```sh
curl http://127.0.0.1:8000/api/stocks/aapl/quote
```

The response includes the symbol, company and market details when available,
price and daily change fields, and the provider's last updated time. Successful
quotes are cached in memory for 60 seconds.

## Run the tests

From the repository root, run:

```sh
pytest -p no:cacheprovider backend/tests
```
