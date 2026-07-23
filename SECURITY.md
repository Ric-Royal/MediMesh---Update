# Security policy

## Reporting a vulnerability

Do not open a public issue containing a vulnerability, credential, patient information, or exploitable detail. Use the repository’s private GitHub Security Advisory reporting channel. Include the affected version, component, reproduction steps using synthetic data, impact, and suggested mitigation if known.

Do not access real patient records, perform denial of service, send unsolicited M-Pesa requests, test Safaricom infrastructure, exfiltrate data, persist on a system, or exceed written authorization. Preserve confidentiality while the issue is investigated.

## Supported release

Only the latest explicitly published release candidate/stable release receives security fixes. Development branches and the legacy development Compose file are not production deployment targets.

## Security controls and limitations

The repository includes automated tests, dependency audit, CodeQL, secret and container scanning, SBOM/provenance, mandatory production MFA, encrypted secrets/backups, and operational hardening. These do not replace facility risk assessment, independent penetration testing, statutory certification, monitoring, incident response, or timely patching.

See [Production operations](docs/PRODUCTION-OPERATIONS.md) and [Regulatory and release gates](docs/REGULATORY-AND-RELEASE-GATES.md).
