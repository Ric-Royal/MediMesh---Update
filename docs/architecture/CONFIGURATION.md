# MediMesh Configuration Guide

This document explains how all services in MediMesh are connected and configured to work together.

## 🔗 Service Architecture & Connections

### Core Services (Always Required)
```
Frontend (React) ←→ Patient API (Node.js) ←→ PostgreSQL Database
                                        ↓
                                    Redis Cache
```

### Optional Services (Can be added incrementally)
```
Traefik (Reverse Proxy) ←→ All Services
Keycloak (Auth) ←→ Frontend & APIs
MinIO (File Storage) ←→ Patient API
Vault (Secrets) ←→ All Services
Airflow (ETL) ←→ PostgreSQL
Metabase (Reporting) ←→ PostgreSQL
Superset (Analytics) ←→ PostgreSQL
```

## 🌐 Network Configuration

All services communicate through the `medimesh-network` Docker network:

- **Frontend**: `http://localhost:3000` (external) → `web-app:3000` (internal)
- **Patient API**: `http://localhost:3001` (external) → `patient-api:3000` (internal)
- **PostgreSQL**: `postgres:5432` (internal only)
- **Redis**: `redis:6379` (internal only)

## 🔧 Environment Variables & Connections

### Frontend → Backend Connection
```javascript
// web-app/src/services/api.js
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Docker Compose
environment:
  REACT_APP_API_URL: http://localhost:3001  # Direct connection for development
```

### Backend → Database Connection
```javascript
// services/patient-api/src/utils/database.js
connectionString: process.env.DATABASE_URL || 'postgresql://medimesh_user:MediMeshDB2024!@localhost:5432/medimesh'

// Docker Compose
environment:
  DATABASE_URL: postgresql://medimesh_user:MediMeshDB2024!@postgres:5432/medimesh
```

### Backend → Redis Connection
```javascript
// services/patient-api/src/utils/redis.js
url: process.env.REDIS_URL || 'redis://localhost:6379'
password: process.env.REDIS_PASSWORD || 'redis_password'

// Docker Compose
environment:
  REDIS_URL: redis://redis:6379
  REDIS_PASSWORD: redis_password
```

## 🔐 Authentication Flow

### Development Mode (Current Setup)
1. Frontend checks `REACT_APP_DEV_MODE=true`
2. Uses simple JWT authentication via `/api/auth/login`
3. Stores token in localStorage as `dev_token`
4. Sends token in Authorization header to API

### Production Mode (Optional)
1. Frontend initializes Keycloak client
2. Redirects to Keycloak for authentication
3. Receives OIDC token from Keycloak
4. Sends token to API for validation

## 📊 Database Schema & Connections

### Main Database: `medimesh`
- **Tables**: `patients`, `medical_records`, `audit_logs`
- **Used by**: Patient API, Metabase, Superset
- **Connection**: `postgresql://medimesh_user:password@postgres:5432/medimesh`

### Service-Specific Databases
- **Keycloak**: `keycloak` database
- **Airflow**: `airflow` database  
- **Metabase**: `metabase` database
- **Superset**: `superset` database

## 🚀 Startup Dependencies

### Correct Startup Order
1. **PostgreSQL** (with health check)
2. **Redis** (with health check)
3. **Patient API** (depends on PostgreSQL + Redis)
4. **Frontend** (depends on Patient API)
5. **Optional Services** (depend on PostgreSQL)

### Health Checks
```yaml
# PostgreSQL
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U medimesh_user -d medimesh"]

# Redis  
healthcheck:
  test: ["CMD", "redis-cli", "-a", "redis_password", "ping"]
```

## 🔧 Configuration Files

### Docker Compose Files
- `docker-compose.yml` - Full production setup with all services
- `docker-compose.test.yml` - Minimal setup (PostgreSQL + Redis + API + Frontend)

### Application Configuration
- `services/patient-api/src/index.js` - API server configuration
- `web-app/src/App.js` - Frontend routing and authentication
- `init-scripts/01-create-databases.sql` - Database initialization

## 🛠️ Development vs Production

### Development Configuration
```yaml
# Direct API access
REACT_APP_API_URL: http://localhost:3001

# Simple authentication
REACT_APP_DEV_MODE: "true"

# Relaxed security
NODE_ENV: development
ALLOWED_ORIGINS: http://localhost:3000,http://localhost
```

### Production Configuration  
```yaml
# Reverse proxy access
REACT_APP_API_URL: http://localhost/api

# Keycloak authentication
REACT_APP_DEV_MODE: "false"

# Strict security
NODE_ENV: production
ALLOWED_ORIGINS: https://yourdomain.com
```

## 🔍 Troubleshooting Connections

### Common Issues & Solutions

1. **Frontend can't reach API**
   - Check `REACT_APP_API_URL` matches API port
   - Verify CORS settings in API (`ALLOWED_ORIGINS`)

2. **API can't connect to database**
   - Check `DATABASE_URL` format
   - Verify PostgreSQL is healthy: `docker-compose ps`

3. **API can't connect to Redis**
   - Check `REDIS_URL` and `REDIS_PASSWORD`
   - Verify Redis auth: `docker exec -it medimesh-redis redis-cli -a redis_password ping`

4. **Authentication not working**
   - Development: Check `JWT_SECRET` is set
   - Production: Verify Keycloak configuration

### Verification Commands
```bash
# Check service health
docker-compose ps

# Test database connection
docker exec -it medimesh-postgres psql -U medimesh_user -d medimesh -c "SELECT NOW();"

# Test Redis connection  
docker exec -it medimesh-redis redis-cli -a redis_password ping

# Test API health
curl http://localhost:3001/health

# Check API logs
docker logs medimesh-patient-api
```

## 📝 Configuration Checklist

Before starting the system, ensure:

- [ ] All required secrets are in `secrets/` directory
- [ ] Database passwords match between Docker Compose and init scripts
- [ ] Frontend API URL matches backend port configuration
- [ ] Redis password is consistent across services
- [ ] CORS origins include frontend URL
- [ ] Health checks are properly configured
- [ ] Service dependencies are correctly defined

## 🔄 Adding New Services

When adding new services:

1. Add to `medimesh-network`
2. Configure appropriate dependencies with health checks
3. Add environment variables for connections
4. Update this documentation
5. Test integration with existing services 