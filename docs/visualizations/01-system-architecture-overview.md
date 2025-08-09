# MediMesh System Architecture Overview

This diagram shows the complete MediMesh application architecture including all 11 services and their relationships.

```mermaid
graph TB
    subgraph "Frontend - React Application"
        WEB[Web App :3000<br/>React + Material-UI]
        AUTH[AuthContext<br/>Authentication State]
        SETTINGS[SettingsContext<br/>User & System Settings]
        THEME[ThemeContext<br/>Theme Management]
    end
    
    subgraph "API Gateway"
        TRAEFIK[Traefik Reverse Proxy<br/>:80 -> Internal Services]
    end
    
    subgraph "Backend - Patient API :3001"
        API[Node.js Express API<br/>Port 3000 Internal]
        ROUTES[API Routes<br/>/api/patients, /api/records<br/>/api/files, /api/settings]
    end
    
    subgraph "Authentication Services"
        KC[Keycloak SSO<br/>:8080<br/>Production Auth]
        DEV[Development Auth<br/>Simple Login]
    end
    
    subgraph "Data Storage"
        PG[(PostgreSQL :5432<br/>Main Database)]
        REDIS[(Redis :6379<br/>Cache & Sessions)]
        MINIO[(MinIO :9000<br/>File Storage)]
    end
    
    subgraph "Security & Secrets"
        VAULT[HashiCorp Vault<br/>:8200<br/>Secret Management]
    end
    
    subgraph "Analytics & BI"
        AIRFLOW[Apache Airflow<br/>:8082<br/>Data Pipelines]
        METABASE[Metabase<br/>:3002<br/>Business Intelligence]
        SUPERSET[Apache Superset<br/>:8088<br/>Advanced Analytics]
    end
    
    WEB --> TRAEFIK
    WEB -.->|Auth| KC
    WEB -.->|Dev Mode| DEV
    AUTH --> SETTINGS
    SETTINGS --> THEME
    
    TRAEFIK --> API
    API --> PG
    API --> REDIS
    API --> MINIO
    API --> VAULT
    
    AIRFLOW --> PG
    METABASE --> PG
    SUPERSET --> PG
    
    classDef frontend fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef backend fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef database fill:#e8f5e8,stroke:#388e3c,stroke-width:2px
    classDef security fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef analytics fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    
    class WEB,AUTH,SETTINGS,THEME frontend
    class TRAEFIK,API,ROUTES backend
    class PG,REDIS,MINIO database
    class KC,DEV,VAULT security
    class AIRFLOW,METABASE,SUPERSET analytics
```

## Service Breakdown

### Frontend Services
- **Web App (React)** - Single Page Application with Material-UI
- **AuthContext** - Authentication state management
- **SettingsContext** - User and system settings management
- **ThemeContext** - Material-UI theme management

### Backend Services
- **Patient API** - Node.js/Express REST API
- **Traefik** - Reverse proxy and load balancer

### Data Storage
- **PostgreSQL** - Primary relational database
- **Redis** - Caching and session storage
- **MinIO** - S3-compatible object storage

### Security & Authentication
- **Keycloak** - Enterprise SSO (production)
- **Development Auth** - Simple authentication (development)
- **HashiCorp Vault** - Secrets management

### Analytics & Business Intelligence
- **Apache Airflow** - Data pipeline orchestration
- **Metabase** - Business intelligence and reporting
- **Apache Superset** - Advanced data visualization

## Key Features
- **Microservices Architecture** - 11 containerized services
- **Dual Authentication** - Production (Keycloak) and Development modes
- **HIPAA Compliance** - Audit trails and data protection
- **Real-time Settings** - Dynamic configuration across all components
- **Enterprise Analytics** - Complete BI stack for healthcare insights