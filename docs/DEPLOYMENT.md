# Deployment

**One canonical path: Docker.** There is exactly one supported way to deploy LEADOS. Previous
ad-hoc scripts are unified into `deploy-production.sh`; do not write a second deploy script —
extend that one and document the change here.

## Topology

```
[client] -> [reverse proxy / TLS termination, your infra]
              -> [LEADOS container, port 3000]
                   -> [PostgreSQL]
```

LEADOS has **no built-in authentication** (see `docs/explanation.md` → Security posture). The
reverse proxy in front of it is not optional infrastructure polish — until M1 (auth) ships, the
proxy (or network ACL) is the *only* access control this system has. Put it behind:
- a VPN / private subnet, or
- a reverse proxy enforcing its own auth (basic auth, SSO proxy, mTLS), or
- both.

## Build the image

```bash
docker build -t leados:X.Y.Z .
```

The `Dockerfile` is a multi-stage build: `deps` (install), `builder` (`next build`), `runner`
(minimal runtime image running `next start` as a non-root user). It bakes in nothing
environment-specific — `DATABASE_URL` is supplied at container run time, never at build time.

## Staging

```bash
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@staging-db:5432/leados" \
  --name leados-staging \
  leados:X.Y.Z

npx drizzle-kit push --config drizzle.config.json   # run once against the staging DB
curl http://localhost:3000/api/health               # must return {"ok":true,...}
```

Exercise the full tutorial flow (`docs/tutorials.md`) against staging before promoting.

## Production — health-gated rollout

1. Apply schema changes first: run `npx drizzle-kit push` against production (or your migration
   tool, if you've since switched away from `push` — see `docs/explanation.md`), **before**
   starting the new container, so the old version keeps running against a schema it's still
   compatible with (expand/contract discipline — see `docs/ROLLBACK.md`).
2. Start the new container alongside the old one (different port or a blue/green slot).
3. Health-gate: poll `/api/health` on the new container every 2 seconds for up to 30 seconds. Do
   not route traffic to it until it returns `{"ok":true}` with the expected `version`.
4. Flip the reverse proxy / load balancer to the new container.
5. Keep the old container running, not destroyed, for at least one rollback window (see
   `docs/ROLLBACK.md`) before tearing it down.
6. Run the smoke test from `docs/RELEASING.md` step 11 against the production URL.

`deploy-production.sh` automates steps 2–4 for a single-host Docker deployment; for a
multi-host/orchestrated environment (Kubernetes, ECS, etc.), translate the same sequence into your
platform's native rolling-update/health-check primitives — the sequence, not the script, is the
contract.

## Rollback

See `docs/ROLLBACK.md`.
