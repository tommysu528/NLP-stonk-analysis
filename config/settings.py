from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://stonk:stonk@localhost:5432/stonk"
    newsapi_key: str = ""
    sentiment_model: str = "ProsusAI/finbert"
    tickers: str = "AAPL,MSFT,NVDA,TSLA,AMZN,META,GOOGL,AMD,NFLX,LZ"
    ingest_interval_minutes: int = 60

    # Alpaca paper trading. Leave empty to disable trading.
    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_paper: bool = True
    alpaca_trade_size_usd: float = 500.0
    alpaca_max_positions: int = 8

    @property
    def ticker_list(self) -> list[str]:
        return [t.strip().upper() for t in self.tickers.split(",") if t.strip()]


settings = Settings()
