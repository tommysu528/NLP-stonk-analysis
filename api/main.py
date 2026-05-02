from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import articles, backtests, prices, sentiment, signals

app = FastAPI(title="NLP-stonk-analysis", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(articles.router)
app.include_router(sentiment.router)
app.include_router(prices.router)
app.include_router(signals.router)
app.include_router(backtests.router)


@app.get("/health")
def health():
    return {"status": "ok"}
