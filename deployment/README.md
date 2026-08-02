# MediMesh production deployment

This directory packages the API, web application, and malware scanner for a
facility-approved production environment. PostgreSQL, Redis, S3-compatible
object storage, HTTPS ingress, monitoring, and backups must be managed outside
this Compose project.

Do not process live patient data until the regulatory and operational gates in
`../SECURITY_IMPLEMENTATION_2026-07-24.md` are complete.

## Installation

On a prepared Linux host:

```sh
cp .env.example .env
# Configure approved TLS endpoints and digest-pinned release images.
sh scripts/install.sh
```

The secret generator creates application-owned keys. Database, CA, Redis,
object-storage, and payment-provider values must be provisioned from their
authoritative services into `deployment/secrets`.

## Backups

Database and object-storage backups are created through the approved managed
service runbooks. Export both into a protected staging directory, then seal the
export:

```sh
sh scripts/backup.sh /protected/provider-export clinic-2026-07-24
sh scripts/verify-backup.sh backups/clinic-2026-07-24.tar.age
```

The backup format uses authenticated `age` encryption and a detached
`minisign` signature. Encryption identities and signing keys must be
versioned, rotated, restricted to backup administrators, and stored separately
from the application host, then mounted only for the backup or restore
operation. `BACKUP_WORK_ROOT` must be an encrypted filesystem.
Maintain immutable/offline copies and record restore-test evidence.

Extraction never modifies live services:

```sh
sh scripts/restore.sh backups/clinic-2026-07-24.tar.age /protected/empty-restore --confirm-extract
```

Restore the verified exports only through the approved database and
object-storage recovery runbooks.

## Updates

Updates require digest-pinned images and a verified backup:

```sh
sh scripts/update.sh \
  registry.example/api@sha256:<digest> \
  registry.example/web@sha256:<digest> \
  backups/clinic-2026-07-24.tar.age
```
