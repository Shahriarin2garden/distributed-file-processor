.PHONY: help build up down restart logs test clean prod-up prod-down prod-logs prod-ps

help:
	@echo "Available commands:"
	@echo "  make build    - Build Docker images"
	@echo "  make up       - Start all services (dev)"
	@echo "  make down     - Stop all services"
	@echo "  make restart  - Restart all services"
	@echo "  make logs     - Show logs"
	@echo "  make test     - Run tests"
	@echo "  make clean    - Clean storage and containers"
	@echo "  make prod-up  - Start production stack (uses .env.production)"
	@echo "  make prod-down - Stop production stack"
	@echo "  make prod-logs - Follow production logs"
	@echo "  make prod-ps  - Show production stack status"

build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

restart:
	docker-compose restart

logs:
	docker-compose logs -f

test:
	pytest tests/ -v

clean:
	docker-compose down -v
	rm -rf storage/
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

prod-up:
	docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

prod-down:
	docker compose --env-file .env.production -f docker-compose.prod.yml down

prod-logs:
	docker compose --env-file .env.production -f docker-compose.prod.yml logs -f

prod-ps:
	docker compose --env-file .env.production -f docker-compose.prod.yml ps