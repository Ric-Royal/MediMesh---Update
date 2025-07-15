# HashiCorp Vault Configuration for MediMesh Healthcare Platform
# This configuration provides secure secret management for healthcare data

# Storage backend configuration
storage "file" {
  path = "/vault/data"
}

# Listener configuration for API and UI
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1  # Disabled for development, enable for production
}

# API address
api_addr = "http://0.0.0.0:8200"

# Cluster address
cluster_addr = "http://0.0.0.0:8201"

# UI configuration
ui = true

# Disable mlock for containerized environments
disable_mlock = true

# Default lease TTL
default_lease_ttl = "168h"

# Maximum lease TTL
max_lease_ttl = "720h"

# Plugin directory
plugin_directory = "/vault/plugins"

# Log level
log_level = "INFO"

# Log format
log_format = "json"

# Enable raw endpoint (for health checks)
raw_storage_endpoint = true

# Disable clustering for single-node setup
disable_clustering = true

# Seal configuration (for auto-unseal in production)
# seal "awskms" {
#   region     = "us-west-2"
#   kms_key_id = "alias/vault-unseal-key"
# }

# Telemetry configuration
telemetry {
  disable_hostname = true
  prometheus_retention_time = "30s"
  statsd_address = "localhost:8125"
}

# Enterprise license (if applicable)
# license_path = "/vault/license/vault.hclic"

# Performance settings
# cache_size = "32000"

# Entropy augmentation (for better randomness)
entropy "seal" {
  mode = "augmentation"
}

# Audit device configuration
# audit "file" {
#   file_path = "/vault/logs/audit.log"
# }

# Development mode settings (remove for production)
# These settings are for development only
# In production, use proper TLS and authentication 