# gnee infrastructure

Deploy paths for `apps/web/spa` — the only `gnee` app that runs in a
container. `apps/ios`/`apps/android` ship as signed binaries via EAS
Build/Submit instead; see `scripts/deploy-mobile.sh` and each app's README.

## Layout

```
infrastructure/
  docker/
    web-spa.Dockerfile       # multi-stage build (Vite build -> nginx-unprivileged runtime)
    web-spa.nginx.conf       # SPA routing (try_files -> index.html)
    web-spa-stack.yml        # swarm-mode compose, deployed with `docker stack deploy`
  kubernetes/
    namespace.yaml           # "gnee" namespace
    web-spa/
      deployment.yaml
      service.yaml
      hpa.yaml
  terraform/
    kubernetes/              # applies the YAML above via the `kubernetes` provider
scripts/
  deploy-docker.sh           # local: docker build + docker run
  deploy-swarm.sh            # docker build + push + `docker stack deploy`
  deploy-k8s.sh              # docker build + push + `terraform apply` (infrastructure/terraform/kubernetes)
  deploy-mobile.sh           # EAS Build/Submit for apps/ios or apps/android
```

## Why no secrets in the web-spa image or manifests

`apps/web/spa` is a public OIDC SPA client (Authorization Code + PKCE — no
client secret by design) talking to a public GraphQL gateway URL. Its
`VITE_*` config is baked into the static bundle at `vite build` time (Vite's
own model — `import.meta.env` doesn't exist at runtime), so there's nothing
secret to inject into the container at deploy time, and no ConfigMap/Secret
in `infrastructure/kubernetes/web-spa/`. Roll out a new image (`--build-arg
...`) per environment instead of editing a running container's env.

If you later need one image across multiple environments, the standard
pattern is an `envsubst`-generated `window.__ENV__` config file written by a
container entrypoint — not implemented here to keep this scaffold matching
what's actually wired up (ask if you want it added).

## 1Password layout

Every deploy script resolves config through `op read` (falling back to a
plain default for non-secret local-dev values), so the only thing that needs
to exist per machine is `op signin` / `op plugin run` access — never a
checked-in secret. Items referenced by these scripts, grouped by vault/item:

| Reference | Used by | Contains |
|---|---|---|
| `op://zuma/web-spa-oidc/gateway_url` | `apps/web/spa/env.example`, `deploy-docker.sh`, `deploy-swarm.sh`, `deploy-k8s.sh` | `VITE_ZUMA_GATEWAY_URL` for non-local environments |
| `op://zuma/web-spa-oidc/authority` | same | `VITE_OIDC_AUTHORITY` |
| `op://zuma/web-spa-oidc/client_id` | same | `VITE_OIDC_CLIENT_ID` |
| `op://zuma/web-spa-oidc/audience` | `apps/web/spa/env.example` | `VITE_OIDC_AUDIENCE`, only if your provider requires one |
| `op://zuma/eas/expo_token` | `deploy-mobile.sh` | EAS CI auth token (`EXPO_TOKEN`) |
| `op://zuma/eas-ios/asc_api_key_p8`, `asc_api_key_id`, `asc_api_key_issuer_id` | `deploy-mobile.sh` (ios) | App Store Connect API key, for non-interactive `eas submit` |
| `op://zuma/eas-android/service_account_json` | `deploy-mobile.sh` (android) | Google Play service account key, written transiently to `apps/android/google-service-account.json` then deleted |

zuma's own `JWT_JWKS_URI`/`JWT_AUDIENCE` (so `wallet-service`/`transaction-service`
accept the OIDC-issued tokens this SPA sends) follow the same convention —
see `zuma/docs/security.md`'s "OIDC / JWKS path". I couldn't add them to
`zuma/services/*/.env.example` directly (sandboxed out of editing `.env*`
files); add these two lines to both by hand:

```
JWT_JWKS_URI=
JWT_AUDIENCE=
```

## Running a deploy

```bash
chmod +x scripts/*.sh   # once, after cloning (mirrors zuma/scripts' own setup step)

./scripts/deploy-docker.sh                                   # local container, http://localhost:8080
REGISTRY=scarlet:5000 VITE_OIDC_REDIRECT_URI=https://wallet.example.com/callback \
  ./scripts/deploy-swarm.sh                                   # docker context use scarlet-daemon first
REGISTRY=your-registry.example.com VITE_OIDC_REDIRECT_URI=https://wallet.example.com/callback \
  ./scripts/deploy-k8s.sh                                     # terraform apply prompts for confirmation
./scripts/deploy-mobile.sh ios production
./scripts/deploy-mobile.sh android production
```

Per CLAUDE.md's guardrails: none of these scripts auto-approve `terraform
apply` or skip confirmation — `deploy-k8s.sh` will prompt in your terminal.
`docker stack deploy`/`terraform apply` against a shared/production system
should still be a deliberate, reviewed action, not something run on a whim.
