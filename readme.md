# 🏥 MediMesh - Medical Data Management System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![HIPAA](https://img.shields.io/badge/HIPAA-Compliant-green.svg)](https://www.hhs.gov/hipaa/)
[![Security](https://img.shields.io/badge/Security-Hardened-red.svg)](https://owasp.org/)

A comprehensive, HIPAA-compliant medical data management system built with modern web technologies and enterprise-grade security features.

## 🎯 Overview

MediMesh is a full-stack medical data management platform designed for healthcare providers to securely manage patient information and medical records. The system features a React-based frontend, Node.js microservices backend, and a complete Docker infrastructure with enterprise security features.

### ✨ Key Features

- **Complete CRUD Operations** - Full patient and medical record management
- **HIPAA Compliance** - Comprehensive audit trails and data protection
- **Role-Based Access Control** - Doctor, Nurse, Admin, and Viewer roles
- **Enterprise Authentication** - Keycloak integration with JWT tokens
- **Microservices Architecture** - Scalable, containerized services
- **Advanced Security** - Field-level encryption, rate limiting, and DLP
- **Real-time Features** - Live search, filtering, and data export
- **Production Ready** - Complete Docker orchestration with monitoring

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Web     │    │   Patient API   │    │   PostgreSQL    │
│   Application   │◄──►│   (Node.js)     │◄──►│   Database      │
│   (Port 3000)   │    │   (Port 3001)   │    │   (Port 5432)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Keycloak     │    │      Redis      │    │     MinIO       │
│  (Port 8080)    │    │   (Port 6379)   │    │  (Port 9000)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Docker Desktop
- PowerShell (Windows) or Bash (Linux/macOS)
- Git

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/medimesh.git
   cd medimesh
   ```

2. **Start the development environment**
   ```bash
   # Start backend services
   docker-compose -f docker-compose.test.yml up -d
   
   # Start frontend (in a new terminal)
   cd web-app
   npm install
   npm start
   ```

3. **Test connections** (recommended):
   ```bash
   # Linux/Mac
   ./scripts/test-connections.sh
   
   # Windows PowerShell
   .\test-connections.ps1
   ```

4. **Access the application**
   - Web App: http://localhost:3000
   - API: http://localhost:3001/health
   - Use any username/password in development mode

### ✅ Connection Verification

After starting services, verify all connections are working:

- **Frontend**: http://localhost:3000 (React app)
- **Patient API**: http://localhost:3001/health (Health check)
- **PostgreSQL**: Internal connection via Docker network
- **Redis**: Internal connection with authentication

**Development Login**: Use `admin` / `admin123` for testing

If any connections fail, see [CONFIGURATION.md](CONFIGURATION.md) for troubleshooting.

## 🔐 Security & Production Deployment

### ⚠️ CRITICAL SECURITY NOTICE

This repository contains **development credentials only**. For production deployment:

1. **Generate secure passwords**
   ```powershell
   .\scripts\generate-secrets.ps1
   ```

2. **Create production environment file**
   ```bash
   cp env.production.example .env.production
   # Update with your secure passwords and domain names
   ```

3. **Never commit sensitive files**
   - `.env*` files are automatically ignored
   - Use HashiCorp Vault for production secrets
   - Rotate passwords regularly

### Production Deployment Steps

1. **Generate secure credentials**
2. **Configure SSL/TLS certificates**
3. **Set up HashiCorp Vault**
4. **Deploy with production compose file**
5. **Configure monitoring and backups**

## 📊 System Status

### ✅ Completed Features (98% Complete)

| Component | Status | Features |
|-----------|--------|----------|
| **Frontend** | ✅ Complete | 12 pages, full CRUD, responsive design |
| **Backend API** | ✅ Complete | 16 endpoints, authentication, validation |
| **Database** | ✅ Complete | PostgreSQL with sample data |
| **Authentication** | ✅ Complete | Keycloak + development mode |
| **Security** | ✅ Complete | HIPAA compliance, audit trails |
| **Docker Infrastructure** | ✅ Complete | 16+ microservices ready |

### 🧪 Testing

The system includes comprehensive test data:
- 3 sample patients (John Doe, Sarah Johnson, Robert Wilson)
- 3 medical records (Consultation, Lab Result, Prescription)
- Full CRUD operations available for testing

## 🛠️ Development

### Project Structure

```
medimesh/
├── web-app/                 # React frontend application
├── services/
│   └── patient-api/         # Node.js backend API
├── docker-compose.yml       # Full production stack
├── docker-compose.test.yml  # Development/testing stack
├── env.production.example   # Production environment template
├── scripts/                 # Deployment and utility scripts
└── secrets/                 # Development secrets (gitignored in prod)
```

### Available Scripts

```bash
# Development
npm start                    # Start frontend development server
npm test                     # Run tests
npm run build               # Build for production

# Docker
docker-compose up -d        # Start all services
docker-compose logs -f      # View logs
docker-compose down         # Stop all services

# Security
.\scripts\generate-secrets.ps1  # Generate secure passwords
```

## 🔧 Configuration

### Environment Variables

Key environment variables (see `env.production.example` for complete list):

- `NODE_ENV` - Environment (development/production)
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret
- `KEYCLOAK_*` - Authentication configuration
- `VAULT_*` - Secrets management configuration

### Feature Flags

- `ENABLE_AUDIT_LOGGING` - HIPAA audit trails
- `ENABLE_DLP` - Data loss prevention
- `ENABLE_FIELD_ENCRYPTION` - Field-level encryption
- `ENABLE_RATE_LIMITING` - API rate limiting

## 📈 Monitoring & Analytics

### Available Services

- **Metabase** (Port 3002) - Ad-hoc reporting and data exploration
- **Apache Superset** (Port 8088) - Advanced dashboards and visualization
- **Apache Airflow** (Port 8082) - ETL orchestration and data pipelines
- **Traefik Dashboard** (Port 8081) - API gateway monitoring

### Health Monitoring

- Health check endpoint: `GET /health`
- Database connectivity monitoring
- Redis connection status
- Service dependency checks

## 🔒 Security Features

### HIPAA Compliance
- ✅ Complete audit trails for all data access
- ✅ Field-level encryption for sensitive data
- ✅ Role-based access controls
- ✅ Data integrity verification
- ✅ Secure data transmission (TLS)

### Security Hardening
- ✅ JWT authentication with refresh tokens
- ✅ Rate limiting and DDoS protection
- ✅ CORS and security headers (Helmet)
- ✅ Input validation and sanitization
- ✅ Secrets management with HashiCorp Vault
- ✅ Container security best practices

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow security best practices
- Never commit sensitive data
- Write tests for new features
- Update documentation
- Follow code style guidelines

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

1. Check the [Issues](https://github.com/yourusername/medimesh/issues) page
2. Review the documentation
3. Contact the development team

## 🚨 Security Reporting

If you discover a security vulnerability, please:

1. **DO NOT** create a public issue
2. Email security concerns to: security@yourdomain.com
3. Include detailed information about the vulnerability
4. Allow time for the issue to be addressed before disclosure

---

**⚠️ Important**: This system handles sensitive medical data. Ensure compliance with HIPAA, GDPR, and other applicable regulations in your jurisdiction before deploying to production.