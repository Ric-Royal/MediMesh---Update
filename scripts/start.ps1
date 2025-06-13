# MediMesh Startup Script
Write-Host "Starting MediMesh Medical Data Management System..." -ForegroundColor Green

# Check if Docker is running
try {
    docker info | Out-Null
    Write-Host "✓ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Start the services
Write-Host "Starting core services..." -ForegroundColor Blue
docker-compose up -d postgres redis minio vault

Write-Host "Waiting for core services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

Write-Host "Starting application services..." -ForegroundColor Blue
docker-compose up -d keycloak patient-api web-app traefik

Write-Host "Starting analytics services..." -ForegroundColor Blue
docker-compose up -d airflow-webserver metabase superset

Write-Host "Checking service status..." -ForegroundColor Blue
docker-compose ps

Write-Host ""
Write-Host "MediMesh is starting up!" -ForegroundColor Green
Write-Host "Please wait 2-3 minutes for all services to be fully ready." -ForegroundColor Yellow
Write-Host ""
Write-Host "Service URLs:" -ForegroundColor Cyan
Write-Host "- Web App: http://localhost:3000" -ForegroundColor White
Write-Host "- Patient API: http://localhost:3001" -ForegroundColor White
Write-Host "- Keycloak Admin: http://localhost:8080 (admin/MediMeshKeycloak2024!)" -ForegroundColor White
Write-Host "- MinIO Console: http://localhost:9001 (medimesh-admin/MediMeshMinio2024!)" -ForegroundColor White
Write-Host "- Vault UI: http://localhost:8200 (token: myroot)" -ForegroundColor White
Write-Host "- Traefik Dashboard: http://localhost:8081" -ForegroundColor White
Write-Host "- Metabase: http://localhost:3002" -ForegroundColor White
Write-Host "- Superset: http://localhost:8088" -ForegroundColor White
Write-Host "- Airflow: http://localhost:8082" -ForegroundColor White
Write-Host ""
Write-Host "To check logs: docker-compose logs -f [service-name]" -ForegroundColor Gray
Write-Host "To stop all services: docker-compose down" -ForegroundColor Gray 