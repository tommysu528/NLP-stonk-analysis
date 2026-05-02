.PHONY: up down logs migrate prices news score signals backtest pipeline shell ps

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f api

migrate:
	docker compose exec api alembic upgrade head

prices:
	docker compose exec api stonk fetch-prices

news:
	docker compose exec api stonk fetch-news

score:
	docker compose exec api stonk score

signals:
	docker compose exec api stonk signals

backtest:
	docker compose exec api stonk backtest

pipeline:
	docker compose exec api stonk pipeline

shell:
	docker compose exec api python

ps:
	docker compose ps
