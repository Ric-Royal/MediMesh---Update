# 🚀 MediMesh Optional Services Development Guide

This document outlines the implementation roadmap for optional services that are configured in `docker-compose.yml` but not yet fully integrated with the core MediMesh application.

## 📋 Current Status

### ✅ **Core Services (Fully Implemented)**
- **PostgreSQL** - Primary database
- **Redis** - Caching and session management  
- **Patient API** - Backend REST API
- **React Frontend** - Web application

### 🔧 **Optional Services (Ready for Development)**
- **MinIO** - Object storage for file uploads
- **Keycloak** - Enterprise authentication
- **Apache Airflow** - ETL orchestration
- **Metabase** - Ad-hoc reporting
- **Apache Superset** - Advanced dashboards
- **Traefik** - API gateway and load balancing
- **HashiCorp Vault** - Production secrets management

---

## 📁 **File Upload Implementation (MinIO)**

### Current Configuration
- **Service**: MinIO S3-compatible object storage
- **Port**: 9000 (API), 9001 (Console)
- **Status**: Configured but not integrated

### Implementation Steps

#### 1. Backend Integration
```javascript
// Add to services/patient-api/package.json
"aws-sdk": "^2.1400.0",
"multer": "^1.4.5-lts.1"

// Create services/patient-api/src/utils/storage.js
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  accessKeyId: process.env.MINIO_ACCESS_KEY,
  secretAccessKey: process.env.MINIO_SECRET_KEY,
  s3ForcePathStyle: true,
  signatureVersion: 'v4'
});

// Upload file function
const uploadFile = async (file, patientId) => {
  const params = {
    Bucket: 'medimesh-documents',
    Key: `patients/${patientId}/${Date.now()}-${file.originalname}`,
    Body: file.buffer,
    ContentType: file.mimetype
  };
  return await s3.upload(params).promise();
};
```

#### 2. Frontend Integration
```javascript
// Add file upload component to web-app/src/components/
// Update patient and record forms to handle file uploads
// Add document viewer for uploaded files
```

#### 3. Database Schema Updates
```sql
-- Add to init-scripts/init.sql
CREATE TABLE patient_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id),
  filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  uploaded_by UUID
);
```

### Required Environment Variables
```bash
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
MINIO_BUCKET_NAME=medimesh-documents
```

---

## 📊 **Dashboard Implementation (Metabase & Superset)**

### Current Configuration
- **Metabase**: Port 3002 (Ad-hoc reporting)
- **Superset**: Port 8088 (Advanced dashboards)
- **Status**: Services configured, dashboards not created

### Implementation Steps

#### 1. Metabase Setup
```bash
# Access Metabase at http://localhost:3002
# Initial setup required:
# 1. Create admin account
# 2. Connect to PostgreSQL database
# 3. Create questions and dashboards
```

**Database Connection Settings:**
- Host: `postgres`
- Port: `5432`
- Database: `medimesh`
- Username: `medimesh_user`
- Password: Use value from `secrets/db_password.txt`

**Recommended Dashboards:**
- Patient Demographics Overview
- Medical Records by Type
- Monthly Patient Registration Trends
- Provider Activity Summary
- System Usage Analytics

#### 2. Superset Setup
```bash
# Access Superset at http://localhost:8088
# Initial setup required:
# 1. Create admin user: docker exec -it medimesh-superset superset fab create-admin
# 2. Initialize database: docker exec -it medimesh-superset superset db upgrade
# 3. Load examples: docker exec -it medimesh-superset superset load_examples
# 4. Initialize: docker exec -it medimesh-superset superset init
```

**Advanced Dashboard Ideas:**
- Real-time patient flow monitoring
- Clinical outcome analytics
- Resource utilization heatmaps
- Predictive analytics for patient care
- Compliance and audit reporting

#### 3. Integration with Core App
```javascript
// Add dashboard links to web-app/src/pages/DashboardPage.js
const dashboardLinks = [
  { name: 'Patient Analytics', url: 'http://localhost:3002/dashboard/1' },
  { name: 'Clinical Reports', url: 'http://localhost:8088/dashboard/1' }
];
```

---

## 🔄 **ETL Implementation (Apache Airflow)**

### Current Configuration
- **Service**: Apache Airflow 2.7.0
- **Port**: 8082 (Web UI)
- **Status**: Service configured, no DAGs implemented

### Implementation Steps

#### 1. Create DAG Directory Structure
```bash
airflow/
├── dags/
│   ├── patient_data_pipeline.py
│   ├── medical_records_etl.py
│   └── data_quality_checks.py
├── plugins/
│   └── custom_operators/
└── logs/
```

#### 2. Sample ETL DAGs

**Patient Data Pipeline (`airflow/dags/patient_data_pipeline.py`):**
```python
from airflow import DAG
from airflow.operators.python_operator import PythonOperator
from datetime import datetime, timedelta

def extract_patient_data():
    # Extract patient data from external sources
    pass

def transform_patient_data():
    # Clean and transform patient data
    pass

def load_patient_data():
    # Load data into MediMesh database
    pass

dag = DAG(
    'patient_data_pipeline',
    default_args={
        'owner': 'medimesh',
        'depends_on_past': False,
        'start_date': datetime(2024, 1, 1),
        'email_on_failure': False,
        'email_on_retry': False,
        'retries': 1,
        'retry_delay': timedelta(minutes=5)
    },
    description='Daily patient data ETL pipeline',
    schedule_interval=timedelta(days=1),
    catchup=False
)

extract_task = PythonOperator(
    task_id='extract_patient_data',
    python_callable=extract_patient_data,
    dag=dag
)

transform_task = PythonOperator(
    task_id='transform_patient_data',
    python_callable=transform_patient_data,
    dag=dag
)

load_task = PythonOperator(
    task_id='load_patient_data',
    python_callable=load_patient_data,
    dag=dag
)

extract_task >> transform_task >> load_task
```

#### 3. Common ETL Use Cases
- **Data Integration**: Import from external EMR systems
- **Data Quality**: Validate and clean patient records
- **Backup & Archive**: Automated data backup procedures
- **Compliance Reporting**: Generate regulatory reports
- **Data Synchronization**: Sync with external healthcare systems

### Airflow Setup Commands
```bash
# Initialize Airflow database
docker exec -it medimesh-airflow-webserver airflow db init

# Create admin user
docker exec -it medimesh-airflow-webserver airflow users create \
    --username admin \
    --firstname Admin \
    --lastname User \
    --role Admin \
    --email admin@medimesh.com \
    --password admin123
```

---

## 🔐 **Production Authentication (Keycloak)**

### Current Configuration
- **Service**: Keycloak (latest)
- **Port**: 8080
- **Status**: Configured for production use

### Implementation Steps

#### 1. Keycloak Setup
```bash
# Access Keycloak at http://localhost:8080
# Login with admin credentials from secrets/keycloak_password.txt
```

#### 2. Realm Configuration
1. Create `medimesh` realm
2. Configure client for React app
3. Set up user roles (Doctor, Nurse, Admin, Viewer)
4. Configure authentication flows

#### 3. Frontend Integration
```javascript
// Update web-app/src/contexts/AuthContext.js
// Switch from development mode to production Keycloak
const keycloakConfig = {
  url: process.env.REACT_APP_KEYCLOAK_URL,
  realm: process.env.REACT_APP_KEYCLOAK_REALM,
  clientId: process.env.REACT_APP_KEYCLOAK_CLIENT_ID
};
```

#### 4. Backend Integration
```javascript
// Update services/patient-api/src/middleware/auth.js
// Add Keycloak token validation
```

---

## 🌐 **API Gateway (Traefik)**

### Current Configuration
- **Service**: Traefik v3.0
- **Port**: 80 (HTTP), 443 (HTTPS), 8081 (Dashboard)
- **Status**: Basic routing configured

### Implementation Benefits
- **Load Balancing**: Distribute traffic across multiple API instances
- **SSL Termination**: Automatic HTTPS certificates
- **Rate Limiting**: Advanced traffic control
- **Service Discovery**: Automatic service routing

### Setup Steps
1. Configure SSL certificates
2. Set up custom domains
3. Implement advanced routing rules
4. Add monitoring and metrics

---

## 🔒 **Production Secrets (HashiCorp Vault)**

### Current Configuration
- **Service**: HashiCorp Vault (latest)
- **Port**: 8200
- **Status**: Development mode (not production-ready)

### Production Implementation
1. **Initialize Vault**: Set up production vault with proper unsealing
2. **Secret Migration**: Move from file-based to Vault-based secrets
3. **API Integration**: Update services to fetch secrets from Vault
4. **Rotation Policies**: Implement automatic secret rotation

---

## 🚀 **Development Workflow**

### Phase 1: File Uploads (Recommended First)
1. Implement MinIO integration
2. Add file upload to patient forms
3. Create document management UI
4. Test with medical images/documents

### Phase 2: Basic Analytics
1. Set up Metabase dashboards
2. Create basic patient analytics
3. Add dashboard links to main app

### Phase 3: Advanced Features
1. Implement Airflow ETL pipelines
2. Set up Superset for advanced analytics
3. Configure production authentication

### Phase 4: Production Hardening
1. Implement Traefik for load balancing
2. Set up Vault for secrets management
3. Configure SSL and security hardening

---

## 📚 **Additional Resources**

### Documentation Links
- [MinIO Documentation](https://docs.min.io/)
- [Metabase Documentation](https://www.metabase.com/docs/)
- [Apache Superset Documentation](https://superset.apache.org/docs/intro)
- [Apache Airflow Documentation](https://airflow.apache.org/docs/)
- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [HashiCorp Vault Documentation](https://www.vaultproject.io/docs)

### Environment Variables Reference
See `env.production.example` for complete list of required environment variables for each service.

---

**Next Steps**: Choose which service to implement first based on your immediate needs. File uploads (MinIO) is recommended as the starting point since it directly enhances the core patient management functionality.