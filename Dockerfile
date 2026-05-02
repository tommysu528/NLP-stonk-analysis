FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY api/ ./api/
COPY ingestion/ ./ingestion/
COPY nlp/ ./nlp/
COPY strategy/ ./strategy/
COPY config/ ./config/
COPY migrations/ ./migrations/
COPY alembic.ini ./
COPY stonk_cli.py ./

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
