# zhios — root automation. Default deploy path: Terraform (kreuzwerker/docker) in
# infrastructure/terraform/docker. Alternative / test path: docker compose (docker-compose.yml).
#
#   make secrets-local && make deploy          # Terraform (interactive apply)
#   make compose-up && make compose-test       # docker compose + smoke test
#
# Secrets never pass through make variables or the command line: scripts read the git-ignored
# root .env or inject them with `op run` (see scripts/terraform-run.sh).

SHELL := bash
.SHELLFLAGS := -euo pipefail -c
.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory

TF_DIR        := infrastructure/terraform/docker
TF_RUN        := bash scripts/terraform-run.sh
COMPOSE       := docker compose
LINT_ENV      := deploy/env/lint.env
# compose build/config need *some* env file to interpolate; placeholders are fine for those.
BUILD_ENV     := $(if $(wildcard .env),.env,$(LINT_ENV))
SHELL_SCRIPTS := $(wildcard scripts/*.sh)

.PHONY: help lint lint-js lint-sh lint-tf lint-compose test coverage build build-js build-images \
        deploy destroy tf-init tf-validate tf-plan tf-apply tf-output \
        compose-up compose-test compose-down compose-logs postman secrets-local secrets-op \
        tunnel tunnel-stop tunnel-status

help: ## List targets
	@grep -E '^[a-z][a-zA-Z0-9_-]*:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  %-16s %s\n", $$1, $$2}'

# ---------------------------------------------------------------------------------------------
# Quality
# ---------------------------------------------------------------------------------------------

lint: lint-js lint-sh lint-tf lint-compose ## Biome (zuma + gnee), shellcheck, terraform fmt, compose config

lint-js: ## Biome lint in zuma and gnee
	npm --prefix zuma run lint
	npm --prefix gnee run lint

lint-sh: ## shellcheck root scripts
	shellcheck $(SHELL_SCRIPTS)

lint-tf: ## terraform fmt -check
	terraform fmt -check -recursive $(TF_DIR)

lint-compose: ## Validate the compose model with placeholder env (never prints secrets)
	ZHIOS_ENV_FILE=$(LINT_ENV) $(COMPOSE) --env-file $(LINT_ENV) config -q

test: ## Unit tests: zuma (test:unit) + gnee + dev OIDC provider
	node --test deploy/mock-oidc/server.test.mjs
	npm --prefix zuma run test:unit
	npm --prefix gnee test

coverage: ## Coverage: zuma (+ summary) + gnee
	npm --prefix zuma run test:coverage
	node zuma/scripts/coverage-summary.mjs
	@# gnee: its own test:coverage script if it has one, else --coverage on every workspace's
	@# test (jest; vitest needs @vitest/coverage-v8)
	if node -e "process.exit(require('./gnee/package.json').scripts?.['test:coverage'] ? 0 : 1)"; then \
		npm --prefix gnee run test:coverage; \
	else \
		npm --prefix gnee run test --workspaces --if-present -- --coverage; \
	fi

# ---------------------------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------------------------

build: build-js build-images ## tsc/vite builds + container images

build-js: ## zuma tsc -b, gnee web-spa vite build
	npm --prefix zuma run build
	npm --prefix gnee run build -w @gnee/web-spa

build-images: ## docker compose build -> zhios/<service>:local (reused by Terraform with build_images=false)
	ZHIOS_ENV_FILE=$(BUILD_ENV) $(COMPOSE) --env-file $(BUILD_ENV) build

# ---------------------------------------------------------------------------------------------
# Deploy — Terraform (default)
# ---------------------------------------------------------------------------------------------

deploy: tf-init tf-apply ## Terraform init + interactive apply (shows the plan, asks for "yes")

tf-init: ## terraform init (local backend)
	$(TF_RUN) init

tf-validate: tf-init ## terraform validate
	$(TF_RUN) validate

tf-plan: ## terraform plan (secrets via .env or op run; no plan file is written)
	$(TF_RUN) plan

tf-apply: ## terraform apply — interactive, never -auto-approve
	$(TF_RUN) apply

tf-output: ## Show stack URLs and OIDC endpoints
	$(TF_RUN) output

destroy: ## Destroy the Terraform stack (needs CONFIRM=yes, then Terraform's own prompt)
	@if [[ "$(CONFIRM)" != "yes" ]]; then \
		echo "Refusing: this removes every zhios container, both networks and the Mongo volume (local data)."; \
		echo "Run:  make destroy CONFIRM=yes   (Terraform will still ask you to type 'yes')"; \
		exit 1; \
	fi
	CONFIRM=yes $(TF_RUN) destroy

# ---------------------------------------------------------------------------------------------
# Deploy — docker compose (alternative / test)
# ---------------------------------------------------------------------------------------------

compose-up: ## docker compose up -d --build --wait (needs root .env)
	@test -f .env || { echo "error: root .env missing — run 'make secrets-local' or 'make secrets-op'" >&2; exit 1; }
	$(COMPOSE) up -d --build --wait --wait-timeout 300

compose-test: ## Smoke test (brings the stack up first; ARGS="--down" / "--no-up")
	bash scripts/compose-smoke-test.sh $(ARGS)

compose-down: ## docker compose down (keeps the Mongo volume; add -v yourself to wipe it)
	$(COMPOSE) down

compose-logs: ## Tail compose logs (SVC=<service>)
	$(COMPOSE) logs --tail 200 -f $(SVC)

tunnel: ## Remote Docker host (ssh:// context): forward its loopback ports to localhost (no-op if local)
	bash scripts/docker-tunnel.sh start

tunnel-stop: ## Close the SSH port-forward to the remote Docker host
	bash scripts/docker-tunnel.sh stop

tunnel-status: ## Show whether the SSH port-forward is up
	bash scripts/docker-tunnel.sh status

postman: tunnel ## Run the Postman/newman collection against the running stack
	bash zuma/scripts/run-postman.sh $(ARGS)

# ---------------------------------------------------------------------------------------------
# Secrets
# ---------------------------------------------------------------------------------------------

secrets-local: ## Generate a local-only root .env with openssl (refuses to overwrite)
	bash scripts/generate-local-secrets.sh

secrets-op: ## Render the root .env from 1Password (deploy/env/local.env.tpl)
	bash scripts/inject-op-secrets.sh
