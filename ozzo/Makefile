.PHONY: install lint typecheck test test-integration build dev generate docker-build docker-up docker-down

install:
	npm ci

generate:
	npx prisma generate

lint:
	npx biome lint .

typecheck: generate
	npx tsc -p tsconfig.json --noEmit

test:
	npm test

# Requires DATABASE_URL pointing at a disposable PostgreSQL (e.g. docker compose up -d postgres)
test-integration: generate
	npm run test:integration

build: generate
	npx tsc -p tsconfig.build.json

dev: generate
	npx tsx watch src/index.ts

docker-build:
	docker build -f docker/Dockerfile -t ozzo:latest .

docker-up:
	docker compose -f docker/docker-compose.yml --env-file .env up -d --build

docker-down:
	docker compose -f docker/docker-compose.yml --env-file .env down
