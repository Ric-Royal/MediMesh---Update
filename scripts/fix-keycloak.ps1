# MediMesh Keycloak Fix Script
Write-Host "🔧 Fixing Keycloak Authentication Service..." -ForegroundColor Green

# Function to check if service is running
function Test-ServiceHealth {
    param($serviceName, $url)
    try {
        $response = Invoke-WebRequest -Uri $url -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ $serviceName is healthy" -ForegroundColor Green
            return $true
        }
    } catch {
        Write-Host "❌ $serviceName is not responding" -ForegroundColor Red
        return $false
    }
}

# Check if Docker is running
try {
    docker info | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 1: Stopping Keycloak service..." -ForegroundColor Blue
docker-compose stop keycloak

Write-Host ""
Write-Host "Step 2: Ensuring PostgreSQL is healthy..." -ForegroundColor Blue
$postgresHealthy = Test-ServiceHealth "PostgreSQL" "http://localhost:5432"

if (-not $postgresHealthy) {
    Write-Host "Starting PostgreSQL..." -ForegroundColor Yellow
    docker-compose up -d postgres
    
    Write-Host "Waiting for PostgreSQL to be ready..." -ForegroundColor Yellow
    $retries = 0
    do {
        Start-Sleep -Seconds 5
        $retries++
        Write-Host "Checking PostgreSQL health (attempt $retries/12)..." -ForegroundColor Gray
        
        # Test database connection
        try {
            $dbTest = docker exec medimesh-postgres psql -U postgres -d postgres -c "SELECT 1;" 2>$null
            if ($dbTest -like "*1*") {
                Write-Host "✅ PostgreSQL is ready" -ForegroundColor Green
                break
            }
        } catch {
            # Continue waiting
        }
        
        if ($retries -ge 12) {
            Write-Host "❌ PostgreSQL failed to start after 60 seconds" -ForegroundColor Red
            exit 1
        }
    } while ($true)
}

Write-Host ""
Write-Host "Step 3: Verifying Keycloak database user..." -ForegroundColor Blue
try {
    $userCheck = docker exec medimesh-postgres psql -U postgres -d keycloak -c "\du keycloak_user" 2>$null
    if ($userCheck -like "*keycloak_user*") {
        Write-Host "✅ Keycloak database user exists" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Creating Keycloak database user..." -ForegroundColor Yellow
        docker exec medimesh-postgres psql -U postgres -c "CREATE USER keycloak_user WITH PASSWORD 'KeycloakDB2024!';"
        docker exec medimesh-postgres psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak_user;"
        Write-Host "✅ Keycloak database user created" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Could not verify database user, but continuing..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 4: Starting Keycloak with updated configuration..." -ForegroundColor Blue
docker-compose up -d keycloak

Write-Host ""
Write-Host "Step 5: Waiting for Keycloak to start (this may take 2-3 minutes)..." -ForegroundColor Blue
$retries = 0
do {
    Start-Sleep -Seconds 10
    $retries++
    Write-Host "Checking Keycloak health (attempt $retries/18)..." -ForegroundColor Gray
    
    $keycloakHealthy = Test-ServiceHealth "Keycloak" "http://localhost:8080/health/ready"
    if ($keycloakHealthy) {
        break
    }
    
    if ($retries -ge 18) {
        Write-Host ""
        Write-Host "⚠️  Keycloak is taking longer than expected to start." -ForegroundColor Yellow
        Write-Host "Let's check the logs for any issues..." -ForegroundColor Yellow
        Write-Host ""
        docker logs medimesh-keycloak --tail 20
        Write-Host ""
        Write-Host "You can continue monitoring with: docker logs -f medimesh-keycloak" -ForegroundColor Cyan
        break
    }
} while ($true)

Write-Host ""
Write-Host "Step 6: Final service status check..." -ForegroundColor Blue
$services = @(
    @{Name="PostgreSQL"; URL="http://localhost:5432"; Container="medimesh-postgres"},
    @{Name="Keycloak"; URL="http://localhost:8080/health/ready"; Container="medimesh-keycloak"}
)

foreach ($service in $services) {
    $status = docker inspect --format='{{.State.Status}}' $service.Container 2>$null
    if ($status -eq "running") {
        Write-Host "✅ $($service.Name) container is running" -ForegroundColor Green
    } else {
        Write-Host "❌ $($service.Name) container status: $status" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "🎉 Keycloak Fix Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Access Keycloak Admin: http://localhost:8080" -ForegroundColor White
Write-Host "   Login: admin / admin123" -ForegroundColor White
Write-Host ""
Write-Host "2. The 'medimesh' realm should be automatically imported with:" -ForegroundColor White
Write-Host "   - Client: medimesh-client (configured for React app)" -ForegroundColor White
Write-Host "   - Users: admin/admin123, doctor/doctor123, nurse/nurse123" -ForegroundColor White
Write-Host "   - Roles: admin, doctor, nurse, viewer" -ForegroundColor White
Write-Host ""
Write-Host "3. Update frontend to use Keycloak:" -ForegroundColor White
Write-Host "   Set REACT_APP_DEV_MODE=false in web-app/.env" -ForegroundColor White
Write-Host ""
Write-Host "Troubleshooting:" -ForegroundColor Yellow
Write-Host "- If Keycloak still fails, check logs: docker logs medimesh-keycloak" -ForegroundColor White
Write-Host "- For database issues: docker logs medimesh-postgres" -ForegroundColor White
Write-Host "- Manual restart: docker-compose restart keycloak" -ForegroundColor White 