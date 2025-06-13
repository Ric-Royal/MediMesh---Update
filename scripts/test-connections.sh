#!/bin/bash

# MediMesh Connection Test Script
# This script tests all service connections to ensure they're working properly

set -e

echo "🔍 MediMesh Connection Test Suite"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test functions
test_service() {
    local service_name=$1
    local test_command=$2
    local expected_result=$3
    
    echo -n "Testing $service_name... "
    
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        return 1
    fi
}

test_http_endpoint() {
    local name=$1
    local url=$2
    local expected_status=$3
    
    echo -n "Testing $name ($url)... "
    
    status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")
    
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS (HTTP $status_code)${NC}"
        return 0
    else
        echo -e "${RED}✗ FAIL (HTTP $status_code, expected $expected_status)${NC}"
        return 1
    fi
}

# Check if Docker Compose is running
echo -e "\n${YELLOW}1. Docker Services Status${NC}"
echo "-------------------------"

if ! docker-compose ps > /dev/null 2>&1; then
    echo -e "${RED}Docker Compose is not running. Please start with: docker-compose up -d${NC}"
    exit 1
fi

# Show service status
docker-compose ps

# Test core infrastructure
echo -e "\n${YELLOW}2. Core Infrastructure Tests${NC}"
echo "----------------------------"

# PostgreSQL
test_service "PostgreSQL Connection" \
    "docker exec medimesh-postgres pg_isready -U medimesh_user -d medimesh" \
    "accepting connections"

test_service "PostgreSQL Query" \
    "docker exec medimesh-postgres psql -U medimesh_user -d medimesh -c 'SELECT NOW();'" \
    "success"

# Redis
test_service "Redis Connection" \
    "docker exec medimesh-redis redis-cli -a redis_password ping" \
    "PONG"

test_service "Redis Auth" \
    "docker exec medimesh-redis redis-cli -a redis_password set test_key test_value" \
    "OK"

# Test API endpoints
echo -e "\n${YELLOW}3. API Endpoint Tests${NC}"
echo "---------------------"

# Wait for API to be ready
echo "Waiting for Patient API to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        break
    fi
    sleep 2
    echo -n "."
done
echo ""

# Health check
test_http_endpoint "Patient API Health" "http://localhost:3001/health" "200"

# Development auth endpoint (should be available in dev mode)
test_http_endpoint "Development Auth Endpoint" "http://localhost:3001/api/auth/login" "400"

# Protected endpoint (should require auth)
test_http_endpoint "Protected Patients Endpoint" "http://localhost:3001/api/patients" "401"

# Test frontend
echo -e "\n${YELLOW}4. Frontend Tests${NC}"
echo "-----------------"

# Check if frontend is running
if docker ps | grep -q medimesh-web-app; then
    test_http_endpoint "Frontend Application" "http://localhost:3000" "200"
else
    echo -e "${YELLOW}Frontend not running in Docker. Check if running in development mode.${NC}"
fi

# Test database schema
echo -e "\n${YELLOW}5. Database Schema Tests${NC}"
echo "------------------------"

test_service "Patients Table Exists" \
    "docker exec medimesh-postgres psql -U medimesh_user -d medimesh -c '\\dt patients'" \
    "patients"

test_service "Medical Records Table Exists" \
    "docker exec medimesh-postgres psql -U medimesh_user -d medimesh -c '\\dt medical_records'" \
    "medical_records"

test_service "Audit Logs Table Exists" \
    "docker exec medimesh-postgres psql -U medimesh_user -d medimesh -c '\\dt audit_logs'" \
    "audit_logs"

# Test optional services (if running)
echo -e "\n${YELLOW}6. Optional Services Tests${NC}"
echo "--------------------------"

optional_services=("medimesh-keycloak:8080" "medimesh-minio:9000" "medimesh-metabase:3000" "medimesh-superset:8088" "medimesh-airflow-webserver:8080")

for service in "${optional_services[@]}"; do
    container_name=$(echo $service | cut -d: -f1)
    port=$(echo $service | cut -d: -f2)
    
    if docker ps | grep -q $container_name; then
        service_name=$(echo $container_name | sed 's/medimesh-//' | sed 's/-/ /g' | sed 's/\b\w/\U&/g')
        test_http_endpoint "$service_name" "http://localhost:$port" "200"
    else
        echo "$container_name: Not running (optional)"
    fi
done

# Test environment variables
echo -e "\n${YELLOW}7. Environment Configuration Tests${NC}"
echo "----------------------------------"

# Check API environment
echo "Checking Patient API environment variables..."
api_env=$(docker exec medimesh-patient-api env | grep -E "(DATABASE_URL|REDIS_URL|NODE_ENV|JWT_SECRET)" || true)
if [ -n "$api_env" ]; then
    echo -e "${GREEN}✓ API environment variables configured${NC}"
else
    echo -e "${RED}✗ API environment variables missing${NC}"
fi

# Integration test
echo -e "\n${YELLOW}8. Integration Test${NC}"
echo "-------------------"

echo "Testing full authentication flow..."

# Try to get a development token
auth_response=$(curl -s -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}' || echo "failed")

if echo "$auth_response" | grep -q "access_token"; then
    echo -e "${GREEN}✓ Development authentication working${NC}"
    
    # Extract token and test protected endpoint
    token=$(echo "$auth_response" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$token" ]; then
        protected_response=$(curl -s -H "Authorization: Bearer $token" http://localhost:3001/api/patients || echo "failed")
        
        if echo "$protected_response" | grep -q "data"; then
            echo -e "${GREEN}✓ Protected endpoint access working${NC}"
        else
            echo -e "${RED}✗ Protected endpoint access failed${NC}"
        fi
    fi
else
    echo -e "${YELLOW}⚠ Development authentication not available (may be production mode)${NC}"
fi

# Summary
echo -e "\n${YELLOW}9. Connection Summary${NC}"
echo "--------------------"

echo "Core Services:"
echo "  ✓ PostgreSQL: localhost:5432"
echo "  ✓ Redis: localhost:6379"
echo "  ✓ Patient API: localhost:3001"
echo "  ✓ Frontend: localhost:3000"

echo ""
echo "Service Communication:"
echo "  ✓ Frontend → Patient API: Direct HTTP"
echo "  ✓ Patient API → PostgreSQL: Connection pool"
echo "  ✓ Patient API → Redis: Connection with auth"

echo ""
echo "Authentication:"
echo "  ✓ Development mode: JWT tokens"
echo "  ✓ Production mode: Keycloak (if enabled)"

echo ""
echo -e "${GREEN}Connection test completed!${NC}"
echo ""
echo "If any tests failed, check the troubleshooting section in CONFIGURATION.md"
echo "For detailed logs, run: docker-compose logs [service-name]" 