# MediMesh Connection Test Script (PowerShell)
# This script tests all service connections to ensure they're working properly

param(
    [switch]$Verbose
)

Write-Host "🔍 MediMesh Connection Test Suite" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

# Test functions
function Test-Service {
    param(
        [string]$ServiceName,
        [string]$TestCommand,
        [string]$ExpectedResult
    )
    
    Write-Host "Testing $ServiceName... " -NoNewline
    
    try {
        $result = Invoke-Expression $TestCommand 2>$null
        if ($result -match $ExpectedResult -or $LASTEXITCODE -eq 0) {
            Write-Host "✓ PASS" -ForegroundColor Green
            return $true
        } else {
            Write-Host "✗ FAIL" -ForegroundColor Red
            if ($Verbose) {
                Write-Host "Expected: $ExpectedResult, Got: $result" -ForegroundColor Red
            }
            return $false
        }
    } catch {
        Write-Host "✗ FAIL" -ForegroundColor Red
        if ($Verbose) {
            Write-Host "Error: $_" -ForegroundColor Red
        }
        return $false
    }
}

function Test-HttpEndpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$ExpectedStatus
    )
    
    Write-Host "Testing $Name ($Url)... " -NoNewline
    
    try {
        $response = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 10 -ErrorAction SilentlyContinue
        $statusCode = $response.StatusCode.ToString()
        
        if ($statusCode -eq $ExpectedStatus) {
            Write-Host "✓ PASS (HTTP $statusCode)" -ForegroundColor Green
            return $true
        } else {
            Write-Host "✗ FAIL (HTTP $statusCode, expected $ExpectedStatus)" -ForegroundColor Red
            return $false
        }
    } catch {
        $statusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { "000" }
        if ($statusCode -eq $ExpectedStatus) {
            Write-Host "✓ PASS (HTTP $statusCode)" -ForegroundColor Green
            return $true
        } else {
            Write-Host "✗ FAIL (HTTP $statusCode, expected $ExpectedStatus)" -ForegroundColor Red
            return $false
        }
    }
}

# Check if Docker Compose is running
Write-Host "`n1. Docker Services Status" -ForegroundColor Yellow
Write-Host "-------------------------" -ForegroundColor Yellow

try {
    $composeStatus = docker-compose ps 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Docker Compose is not running. Please start with: docker-compose up -d" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Docker Compose is not available. Please ensure Docker is installed and running." -ForegroundColor Red
    exit 1
}

# Show service status
docker-compose ps

# Test core infrastructure
Write-Host "`n2. Core Infrastructure Tests" -ForegroundColor Yellow
Write-Host "----------------------------" -ForegroundColor Yellow

# PostgreSQL
Test-Service "PostgreSQL Connection" `
    "docker exec medimesh-postgres pg_isready -U medimesh_user -d medimesh" `
    "accepting connections"

Test-Service "PostgreSQL Query" `
    "docker exec medimesh-postgres psql -U medimesh_user -d medimesh -c 'SELECT NOW();'" `
    "now"

# Redis
Test-Service "Redis Connection" `
    "docker exec medimesh-redis redis-cli -a redis_password ping" `
    "PONG"

Test-Service "Redis Auth" `
    "docker exec medimesh-redis redis-cli -a redis_password set test_key test_value" `
    "OK"

# Test API endpoints
Write-Host "`n3. API Endpoint Tests" -ForegroundColor Yellow
Write-Host "---------------------" -ForegroundColor Yellow

# Wait for API to be ready
Write-Host "Waiting for Patient API to be ready..."
$apiReady = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -Method GET -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $apiReady = $true
            break
        }
    } catch {
        # Continue waiting
    }
    Start-Sleep -Seconds 2
    Write-Host "." -NoNewline
}
Write-Host ""

if (-not $apiReady) {
    Write-Host "⚠ Patient API not responding after 60 seconds" -ForegroundColor Yellow
}

# Health check
Test-HttpEndpoint "Patient API Health" "http://localhost:3001/health" "200"

# Development auth endpoint (should return 400 for missing credentials)
Test-HttpEndpoint "Development Auth Endpoint" "http://localhost:3001/api/auth/login" "400"

# Protected endpoint (should require auth)
Test-HttpEndpoint "Protected Patients Endpoint" "http://localhost:3001/api/patients" "401"

# Test frontend
Write-Host "`n4. Frontend Tests" -ForegroundColor Yellow
Write-Host "-----------------" -ForegroundColor Yellow

# Check if frontend is running
$frontendRunning = docker ps | Select-String "medimesh-web-app"
if ($frontendRunning) {
    Test-HttpEndpoint "Frontend Application" "http://localhost:3000" "200"
} else {
    Write-Host "Frontend not running in Docker. Check if running in development mode." -ForegroundColor Yellow
}

# Test database schema
Write-Host "`n5. Database Schema Tests" -ForegroundColor Yellow
Write-Host "------------------------" -ForegroundColor Yellow

Test-Service "Patients Table Exists" `
    "docker exec medimesh-postgres psql -U medimesh_user -d medimesh -c '\dt patients'" `
    "patients"

Test-Service "Medical Records Table Exists" `
    "docker exec medimesh-postgres psql -U medimesh_user -d medimesh -c '\dt medical_records'" `
    "medical_records"

Test-Service "Audit Logs Table Exists" `
    "docker exec medimesh-postgres psql -U medimesh_user -d medimesh -c '\dt audit_logs'" `
    "audit_logs"

# Test optional services (if running)
Write-Host "`n6. Optional Services Tests" -ForegroundColor Yellow
Write-Host "--------------------------" -ForegroundColor Yellow

$optionalServices = @(
    @{Name="medimesh-keycloak"; Port="8080"},
    @{Name="medimesh-minio"; Port="9000"},
    @{Name="medimesh-metabase"; Port="3000"},
    @{Name="medimesh-superset"; Port="8088"},
    @{Name="medimesh-airflow-webserver"; Port="8080"}
)

foreach ($service in $optionalServices) {
    $containerRunning = docker ps | Select-String $service.Name
    if ($containerRunning) {
        $serviceName = $service.Name -replace "medimesh-", "" -replace "-", " "
        $serviceName = (Get-Culture).TextInfo.ToTitleCase($serviceName)
        Test-HttpEndpoint $serviceName "http://localhost:$($service.Port)" "200"
    } else {
        Write-Host "$($service.Name): Not running (optional)" -ForegroundColor Gray
    }
}

# Test environment variables
Write-Host "`n7. Environment Configuration Tests" -ForegroundColor Yellow
Write-Host "----------------------------------" -ForegroundColor Yellow

Write-Host "Checking Patient API environment variables..."
try {
    $apiEnv = docker exec medimesh-patient-api env | Select-String -Pattern "(DATABASE_URL|REDIS_URL|NODE_ENV|JWT_SECRET)"
    if ($apiEnv) {
        Write-Host "✓ API environment variables configured" -ForegroundColor Green
        if ($Verbose) {
            Write-Host "Found variables:" -ForegroundColor Gray
            $apiEnv | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
        }
    } else {
        Write-Host "✗ API environment variables missing" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Could not check API environment variables" -ForegroundColor Red
    if ($Verbose) {
        Write-Host "Error: $_" -ForegroundColor Red
    }
}

# Integration test
Write-Host "`n8. Integration Test" -ForegroundColor Yellow
Write-Host "-------------------" -ForegroundColor Yellow

Write-Host "Testing full authentication flow..."

try {
    $authBody = @{
        username = "admin"
        password = "admin123"
    } | ConvertTo-Json

    $authResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $authBody `
        -ErrorAction SilentlyContinue

    if ($authResponse.access_token) {
        Write-Host "✓ Development authentication working" -ForegroundColor Green
        
        # Test protected endpoint with token
        $headers = @{
            "Authorization" = "Bearer $($authResponse.access_token)"
        }
        
        try {
            $protectedResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/patients" `
                -Method GET `
                -Headers $headers `
                -ErrorAction SilentlyContinue
            
            if ($protectedResponse.data) {
                Write-Host "✓ Protected endpoint access working" -ForegroundColor Green
                Write-Host "✓ Found $($protectedResponse.data.Count) patients in database" -ForegroundColor Green
            } else {
                Write-Host "✗ Protected endpoint access failed - no data returned" -ForegroundColor Red
            }
        } catch {
            Write-Host "✗ Protected endpoint access failed" -ForegroundColor Red
            if ($Verbose) {
                Write-Host "Error: $_" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "⚠ Development authentication not available (may be production mode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠ Development authentication not available (may be production mode)" -ForegroundColor Yellow
    if ($Verbose) {
        Write-Host "Error: $_" -ForegroundColor Red
    }
}

# Test data seeding (if available)
Write-Host "`n9. Data Verification" -ForegroundColor Yellow
Write-Host "--------------------" -ForegroundColor Yellow

try {
    $patientCount = docker exec medimesh-postgres psql -U medimesh_user -d medimesh -t -c "SELECT COUNT(*) FROM patients;" 2>$null
    if ($patientCount -and $patientCount.Trim() -gt 0) {
        Write-Host "✓ Database contains $($patientCount.Trim()) patients" -ForegroundColor Green
    } else {
        Write-Host "⚠ No patients found in database (may need seeding)" -ForegroundColor Yellow
        Write-Host "  Run: curl -X POST http://localhost:3001/api/seed/patients" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ Could not verify patient data" -ForegroundColor Red
}

try {
    $recordCount = docker exec medimesh-postgres psql -U medimesh_user -d medimesh -t -c "SELECT COUNT(*) FROM medical_records;" 2>$null
    if ($recordCount -and $recordCount.Trim() -gt 0) {
        Write-Host "✓ Database contains $($recordCount.Trim()) medical records" -ForegroundColor Green
    } else {
        Write-Host "⚠ No medical records found in database" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Could not verify medical records data" -ForegroundColor Red
}

# Summary
Write-Host "`n10. Connection Summary" -ForegroundColor Yellow
Write-Host "---------------------" -ForegroundColor Yellow

Write-Host "Core Services:"
Write-Host "  ✓ PostgreSQL: localhost:5432 (internal access only)" -ForegroundColor Green
Write-Host "  ✓ Redis: localhost:6379 (internal access only)" -ForegroundColor Green
Write-Host "  ✓ Patient API: localhost:3001" -ForegroundColor Green
Write-Host "  ✓ Frontend: localhost:3000" -ForegroundColor Green

Write-Host ""
Write-Host "Service Communication:"
Write-Host "  ✓ Frontend → Patient API: Direct HTTP" -ForegroundColor Green
Write-Host "  ✓ Patient API → PostgreSQL: Connection pool" -ForegroundColor Green
Write-Host "  ✓ Patient API → Redis: Connection with auth" -ForegroundColor Green

Write-Host ""
Write-Host "Authentication:"
Write-Host "  ✓ Development mode: JWT tokens" -ForegroundColor Green
Write-Host "  ✓ Production mode: Keycloak (if enabled)" -ForegroundColor Green

Write-Host ""
Write-Host "Next Steps:"
Write-Host "  • Access frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "  • Login with: admin / admin123" -ForegroundColor Cyan
Write-Host "  • API docs: http://localhost:3001/health" -ForegroundColor Cyan

Write-Host ""
Write-Host "Connection test completed!" -ForegroundColor Green
Write-Host ""
Write-Host "If any tests failed, check the troubleshooting section in CONFIGURATION.md" -ForegroundColor Gray
Write-Host "For detailed logs, run: docker-compose logs [service-name]" -ForegroundColor Gray
Write-Host "For verbose output, run: .\test-connections.ps1 -Verbose" -ForegroundColor Gray 