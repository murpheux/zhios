.PHONY: help install build clean dev test lint db docker deploy

help:
	@echo "Zinga - Wallet Service Microservice"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  install           Install dependencies"
	@echo "  build             Build TypeScript"
	@echo "  clean             Clean build artifacts"
	@echo "  dev               Start development server"
	@echo "  test              Run tests"
	@echo "  test-watch        Run tests in watch mode"
	@echo "  test-coverage     Run tests with coverage"
	@echo "  lint              Lint and format code"
	@echo "  lint-check        Check lint (no fix)"
	@echo "  typecheck         Type check only"
	@echo "  db-migrate        Run database migrations"
	@echo "  db-seed           Seed sample data"
	@echo "  db-reset          Reset database"
	@echo "  db-verify         Verify ledger integrity"
	@echo "  docker-build      Build Docker image"
	@echo "  docker-run        Run Docker container"
	@echo "  deploy            Deploy to Kubernetes"

install:
	npm ci

build: typecheck
	npm run build

clean:
	npm run clean

dev:
	npm run dev

dev-watch:
	npm run dev:watch

test:
	npm test

test-watch:
	npm test -- --watch

test-coverage:
	npm test -- --coverage

typecheck:
	npm run typecheck

lint:
	npm run lint

lint-check:
	npm run lint:check

format:
	npm run format

format-check:
	npm run format:check

db-migrate:
	npm run db:migrate

db-seed:
	npm run db:seed

db-reset:
	npm run db:reset

db-verify:
	npm run db:verify

docker-build:
	npm run docker:build

docker-run:
	npm run docker:run

deploy:
	@echo "Deploying to Kubernetes..."
	@kubectl apply -f infrastructure/kubernetes/namespace.yaml
	@kubectl apply -f infrastructure/kubernetes/deployment.yaml
	@kubectl apply -f infrastructure/kubernetes/service.yaml
	@kubectl apply -f infrastructure/kubernetes/configmap.yaml
	@echo "✅ Deployed successfully"
	@kubectl get pods -n zinga

# Development convenience targets
dev-up:
	@echo "Starting PostgreSQL..."
	docker-compose up -d postgres
	@echo "✅ PostgreSQL started"
	$(MAKE) db-migrate db-seed dev

dev-down:
	@echo "Stopping PostgreSQL..."
	docker-compose down
	@echo "✅ PostgreSQL stopped"

ci: clean install lint typecheck test build
	@echo "✅ CI checks passed"

pre-commit: lint typecheck test
	@echo "✅ Pre-commit checks passed"
