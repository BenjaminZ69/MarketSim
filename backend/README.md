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

## Run the server

From the repository root, run:

```sh
uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

The health endpoint is available at <http://127.0.0.1:8000/api/health>.

## Run the tests

From the repository root, run:

```sh
pytest -p no:cacheprovider backend/tests
```
