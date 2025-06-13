# MediMesh Setup Script for Windows
Write-Host "Setting up MediMesh Medical Data Management System..." -ForegroundColor Green

# Check if Docker is installed
if (!(Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Host "Docker is not installed. Please install Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Check if Docker Compose is available
if (!(Get-Command "docker-compose" -ErrorAction SilentlyContinue)) {
    Write-Host "Docker Compose is not installed. Please install Docker Compose first." -ForegroundColor Red
    exit 1
}

Write-Host "✓ Docker is available" -ForegroundColor Green

# Create necessary directories if they don't exist
$directories = @(
    "logs",
    "data/postgres",
    "data/redis", 
    "data/minio",
    "data/vault"
)

foreach ($dir in $directories) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        Write-Host "✓ Created directory: $dir" -ForegroundColor Green
    }
}

# Copy environment file if it doesn't exist
if (!(Test-Path ".env")) {
    if (Test-Path "env.example") {
        Copy-Item "env.example" ".env"
        Write-Host "✓ Created .env file from env.example" -ForegroundColor Green
        Write-Host "Please review and update the .env file with your specific configuration." -ForegroundColor Yellow
    } else {
        Write-Host "Warning: env.example file not found" -ForegroundColor Yellow
    }
}

# Generate secure passwords for production
Write-Host "Generating secure passwords..." -ForegroundColor Blue

$secrets = @{
    "db_password.txt" = [System.Web.Security.Membership]::GeneratePassword(16, 4)
    "minio_password.txt" = [System.Web.Security.Membership]::GeneratePassword(16, 4)
    "keycloak_password.txt" = [System.Web.Security.Membership]::GeneratePassword(16, 4)
    "keycloak_db_password.txt" = [System.Web.Security.Membership]::GeneratePassword(16, 4)
}

foreach ($secret in $secrets.GetEnumerator()) {
    $secretPath = "secrets/$($secret.Key)"
    if (!(Test-Path $secretPath)) {
        $secret.Value | Out-File -FilePath $secretPath -NoNewline
        Write-Host "✓ Generated secret: $($secret.Key)" -ForegroundColor Green
    }
}

# Set appropriate permissions (Windows equivalent)
Write-Host "Setting file permissions..." -ForegroundColor Blue
icacls "secrets" /inheritance:r /grant:r "$env:USERNAME:(OI)(CI)F" | Out-Null

Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Review and update the .env file"
Write-Host "2. Run: docker-compose up -d"
Write-Host "3. Wait for services to start (about 2-3 minutes)"
Write-Host "4. Access the web interface at http://localhost:3000"
Write-Host ""
Write-Host "Service URLs:" -ForegroundColor Cyan
Write-Host "- Web App: http://localhost:3000"
Write-Host "- API: http://localhost:3001"
Write-Host "- Keycloak: http://localhost:8080"
Write-Host "- MinIO: http://localhost:9001"
Write-Host "- Vault: http://localhost:8200"
Write-Host "- Traefik Dashboard: http://localhost:8081"
Write-Host "- Metabase: http://localhost:3002"
Write-Host "- Superset: http://localhost:8088"
Write-Host "- Airflow: http://localhost:8082" 