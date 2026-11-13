# Phase 0 Changes Summary

## What Changed

✅ **Yone Port Migration**
- Changed default port: `3004` → `3005`
- Resolves collision with ozzo (which also defaults to 3004)
- Updated: `yone/src/config/yone-config.ts`, `yone/README.md`, `yone/tests/config.test.ts`

✅ **Service Token Verifier Refactored**
- Extracted reusable `verifyServiceToken()` from `shared/http/src/service-auth.ts`
- Added `expectedSubject` option for token validation
- Framework-agnostic: used by both HTTP and future gRPC handlers
- File: `zuma/shared/http/src/service-auth.ts`, new tests in `zuma/shared/http/tests/service-token-verify.test.ts`

✅ **ADR-0005 Documented**
- Design decision recorded in `zuma/docs/adr/0005-grpc-east-west.md`
- Covers context, decision, consequences, alternatives, and risks
- References: `zuma/docs/grpc-design.md` (to be written in Phase 1)

✅ **Project CLAUDE.md Updated**
- Added "Multi-Service Delegation Pattern" section
- Documents parallel sub-agent usage for prompts applying to all 4 microservices
- Helps future agents understand when to parallelize vs. serialize

## What Needs Updating (Manual)

### Architecture Diagram (`architecture/architecture.drawio`)
- **Page 1 (Logical Architecture):** Update yone service port label from 3004 to 3005
- **Page 2 (AWS Deployment):** Update yone container port mapping in the diagram
- **All pages:** Add notation that gRPC ports (50051-50055) will be added in Phase 1

### README Files
- **yone/README.md:** Already updated to port 3005 ✅
- **zuma/README.md:** Add reference to ADR-0005 and grpc-design.md docs
- **ozzo/README.md:** Note port 3004 (previously collided with yone, now resolved)
- **gnee/README.md:** No changes (gnee has no port assignment)

### Commits (Ready to Run Locally)
Run these three `git commit` commands from the project root:

```zsh
# 1. Yone port fix
git add yone/README.md yone/src/config/yone-config.ts yone/tests/config.test.ts
ggshield secret scan pre-commit --yes
git commit -S -m "fix(yone): move default port to 3005" -m "Port 3004 collides with ozzo. Move yone to 3005 and update the README and config test to match. Prep for Phase 1 gRPC setup.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"

# 2. Service token verifier enhancement
git add zuma/shared/http/src/service-auth.ts zuma/shared/http/tests/service-token-verify.test.ts
ggshield secret scan pre-commit --yes
git commit -S -m "feat(http): add expectedSubject to service token verifier" -m "Let callers pin the expected token subject so a token minted for one internal service cannot be replayed against another. Covered by three new verifier tests.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"

# 3. Architecture decision recorded
git add zuma/docs/adr/0005-grpc-east-west.md
ggshield secret scan pre-commit --yes
git commit -S -m "docs(adr): add ADR-0005 gRPC for east-west communication" -m "Record the decision to use gRPC for service-to-service traffic, with context, options considered and consequences, so Phase 1 has a documented basis.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"

# 4. Project CLAUDE.md with delegation pattern
git add CLAUDE.md
ggshield secret scan pre-commit --yes
git commit -S -m "docs: add multi-service parallel delegation pattern to CLAUDE.md" -m "Document that prompts applying to all 4 microservices should use sub-agents in parallel for speed. Helps future coordinators understand when to parallelize work.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

## Next: Phase 1

Once these commits land, Phase 1 can begin:
- Create `proto/` directory with buf config and proto definitions
- Set up `@zuma/shared-grpc` workspace
- Extract mTLS and gRPC server/client factories
- Update architecture diagram with gRPC ports (50051-50055)
- Write `zuma/docs/grpc-design.md` (full design reference)

## Files Changed by Phase 0

| File | Change | Status |
|---|---|---|
| `yone/src/config/yone-config.ts` | PORT: 3004 → 3005 | ✅ Done |
| `yone/README.md` | All port references updated | ✅ Done |
| `yone/tests/config.test.ts` | Expected port updated to 3005 | ✅ Done |
| `zuma/shared/http/src/service-auth.ts` | Added `expectedSubject` option | ✅ Done |
| `zuma/shared/http/tests/service-token-verify.test.ts` | New verifier tests | ✅ Done |
| `zuma/docs/adr/0005-grpc-east-west.md` | New ADR | ✅ Done |
| `/CLAUDE.md` | Multi-service delegation pattern | ✅ Done |
| `architecture/architecture.drawio` | Yone port 3005, gRPC note | 🔲 Manual |
