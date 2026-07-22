# MediMesh clinic deployment

This directory contains the supported production packaging for one isolated clinic/hospital instance. Start with [the production operations guide](../docs/PRODUCTION-OPERATIONS.md) and do not use real patient data until its go-live gates are complete.

Quick path on a prepared Linux host:

```sh
cp .env.example .env
# Set DOMAIN, TLS_EMAIL, and approved immutable image versions.
sh scripts/install.sh
```

Operational commands:

```sh
sh scripts/healthcheck.sh
sh scripts/backup.sh
sh scripts/verify-backup.sh backups/<file>.tar.enc
sh scripts/update.sh <version>
sh scripts/restore.sh backups/<file>.tar.enc --confirm-destroy-current-data
```

Secrets and backups are ignored by Git. The installer pulls release images; it does not compile on the clinic server.

Release notes are maintained in the repository [changelog](../CHANGELOG.md).
