# MediMesh

MediMesh is a configurable clinical operations platform for clinics and hospitals. It connects registration, triage, consultation, repeatable diagnostic review, pharmacy, ward capacity, billing, payments, records, and administration around one patient encounter.

Current build: **1.0.0-rc.1**. This is a release candidate with production packaging; it is not a claim of regulatory certification or permission to process live patient data. Review [regulatory and release gates](docs/REGULATORY-AND-RELEASE-GATES.md) before any live deployment.

## Operational design

- Named multi-user accounts and role-specific workspaces for receptionist, nurse, doctor, lab, radiology, pharmacy, cashier, ward, and administrator staff.
- A solo-clinic role preset lets one authorized operator use several workspaces without bypassing workflow/audit stages.
- Administrators configure facility naming, departments, clinics, wards/capacity, users/roles, medications/stock, laboratory tests, radiology studies, and prices.
- Diagnostics return to the doctor for results review. The same encounter may repeat doctor → diagnostics → doctor as required; billing activates only after clinical work is complete.
- M-Pesa STK payment uses authenticated callback reconciliation. An unanswered request becomes retryable after 60 seconds, while late confirmed money remains accounted for.
- Production account MFA, session revocation, protected files, audit controls, encrypted backup validation, HTTPS deployment, and image supply-chain evidence.

## Documentation

- [User guide by role](docs/USER-GUIDE.md)
- [Production installation and operations](docs/PRODUCTION-OPERATIONS.md)
- [Regulatory and commercial release gates](docs/REGULATORY-AND-RELEASE-GATES.md)
- [Deployment package](deployment/README.md)
- [Security reporting policy](SECURITY.md)
- [Release changelog](CHANGELOG.md)

## Development environment

The root `docker-compose.yml` is for local development/training and contains intentionally local services/defaults. Do not expose it to the internet or use real patient information.

```sh
docker compose up -d --build
```

Open `http://localhost:3000`. Local demo accounts exist only when `NODE_ENV=development` and `ALLOW_DEMO_AUTH=true`.

Run tests:

```sh
cd services/patient-api && npm ci && npm test -- --runInBand
cd web-app && npm ci && npm test -- --watchAll=false --runInBand
```

## Production release

Production hosts pull versioned images; they do not build source:

```sh
cd deployment
cp .env.example .env
# Set the real domain, TLS email, and approved immutable image versions.
sh scripts/install.sh
```

The release workflow publishes GHCR images from version tags with multi-architecture manifests, SBOMs, and provenance attestations. Follow the production guide for DNS/TLS, secrets, M-Pesa activation, monitoring, backups, restores, updates, rollback, penetration testing, and go-live acceptance.

## License and clinical responsibility

Repository licensing does not grant regulatory approval. Healthcare providers remain responsible for professional judgment, patient safety, lawful processing, facility policy, and verification that the deployed system is certified and fit for their intended use.
