# Connection Security

Core service connections no longer use source-controlled passwords or direct
host exposure.

- The local secret initializer creates random values in the ignored `secrets`
  directory.
- Docker secrets are mounted as files and loaded before application modules.
- PostgreSQL and Redis are reachable only on the internal backend network.
- Object storage uses separate root and least-privilege application accounts.
- The web container proxies same-origin `/api` and WebSocket requests.
- Production startup rejects non-TLS database, cache, object-storage, and
  public origins.

Validate the local model with:

```powershell
docker compose config --quiet
```

See `SECURITY_IMPLEMENTATION_2026-07-24.md` for production prerequisites.
