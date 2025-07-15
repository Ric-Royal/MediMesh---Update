# Superset Configuration for MediMesh
# This file configures Apache Superset for the MediMesh healthcare platform

import os
from datetime import timedelta

# Database Configuration
SQLALCHEMY_DATABASE_URI = 'postgresql://superset_user:SupersetDB2024!@postgres:5432/superset'

# Security Configuration
SECRET_KEY = 'medimesh-superset-secret-key-2024-very-long-and-secure'

# Cache Configuration
CACHE_CONFIG = {
    'CACHE_TYPE': 'RedisCache',
    'CACHE_DEFAULT_TIMEOUT': 300,
    'CACHE_KEY_PREFIX': 'superset_',
    'CACHE_REDIS_HOST': 'redis',
    'CACHE_REDIS_PORT': 6379,
    'CACHE_REDIS_PASSWORD': 'redis_password',
    'CACHE_REDIS_DB': 1,
}

# Feature Flags
FEATURE_FLAGS = {
    'ENABLE_TEMPLATE_PROCESSING': True,
    'DASHBOARD_NATIVE_FILTERS': True,
    'DASHBOARD_CROSS_FILTERS': True,
    'GLOBAL_ASYNC_QUERIES': True,
    'VERSIONED_EXPORT': True,
}

# Security Settings
TALISMAN_ENABLED = True
TALISMAN_CONFIG = {
    'content_security_policy': None,
}

# Session Configuration
PERMANENT_SESSION_LIFETIME = timedelta(hours=24)

# Email Configuration (for alerts)
SMTP_HOST = 'localhost'
SMTP_STARTTLS = True
SMTP_SSL = False
SMTP_USER = 'superset'
SMTP_PORT = 25
SMTP_PASSWORD = ''
SMTP_MAIL_FROM = 'superset@medimesh.com'

# Logging Configuration
ENABLE_TIME_ROTATE = True
TIME_ROTATE_LOG_LEVEL = 'DEBUG'
DATA_DIR = '/app/superset_home'
FILENAME = os.path.join(DATA_DIR, 'superset.log')

# Custom CSS
CUSTOM_CSS = """
.navbar-brand {
    color: #2E86AB !important;
}
"""

# Dashboard Configuration
DASHBOARD_AUTO_REFRESH_MODE = "fetch"
DASHBOARD_AUTO_REFRESH_INTERVALS = [
    [0, "Don't refresh"],
    [10, "10 seconds"],
    [30, "30 seconds"],
    [60, "1 minute"],
    [300, "5 minutes"],
    [1800, "30 minutes"],
    [3600, "1 hour"],
]

# SQL Lab Configuration
SQLLAB_CTAS_NO_LIMIT = True
SQLLAB_TIMEOUT = 300
SQLLAB_DEFAULT_DBID = None

# Healthcare-specific configurations
CUSTOM_SECURITY_MANAGER = None
AUTH_TYPE = 1  # Database authentication
AUTH_ROLE_ADMIN = 'Admin'
AUTH_ROLE_PUBLIC = 'Public'

# Data source configurations for MediMesh
DATABASES_CONFIG = {
    'medimesh_main': {
        'database_name': 'MediMesh Main Database',
        'sqlalchemy_uri': 'postgresql://medimesh_user:MediMeshDB2024!@postgres:5432/medimesh',
        'expose_in_sqllab': True,
        'allow_ctas': True,
        'allow_cvas': True,
        'allow_dml': False,  # Prevent data modification from Superset
    }
}

# Row Level Security
ROW_LEVEL_SECURITY_FILTERS = {}

# Async Query Configuration
RESULTS_BACKEND = {
    'CACHE_TYPE': 'RedisCache',
    'CACHE_DEFAULT_TIMEOUT': 86400,
    'CACHE_KEY_PREFIX': 'superset_results_',
    'CACHE_REDIS_HOST': 'redis',
    'CACHE_REDIS_PORT': 6379,
    'CACHE_REDIS_PASSWORD': 'redis_password',
    'CACHE_REDIS_DB': 2,
}

# WebDriver Configuration for reports
WEBDRIVER_BASEURL = "http://superset:8088/"
WEBDRIVER_BASEURL_USER_FRIENDLY = "http://localhost:8088/"

# Thumbnail Configuration
THUMBNAIL_CACHE_CONFIG = CACHE_CONFIG

# Alert and Report Configuration
ALERT_REPORTS_NOTIFICATION_DRY_RUN = False
WEBDRIVER_TYPE = "chrome"
WEBDRIVER_OPTION_ARGS = [
    "--force-device-scale-factor=1",
    "--high-dpi-support=1",
    "--headless",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-extensions",
]

# Custom roles for healthcare
CUSTOM_ROLES = {
    'Healthcare_Admin': [
        'can_read',
        'can_write',
        'can_delete',
        'menu_access',
        'datasource_access',
    ],
    'Healthcare_Analyst': [
        'can_read',
        'menu_access',
        'datasource_access',
    ],
    'Healthcare_Viewer': [
        'can_read',
        'menu_access',
    ]
}

# Disable unnecessary features for healthcare compliance
ENABLE_PROXY_FIX = True
PROXY_FIX_CONFIG = {"x_for": 1, "x_proto": 1, "x_host": 1, "x_prefix": 1}

# Healthcare data retention policies
DATA_CACHE_CONFIG = {
    'CACHE_TYPE': 'RedisCache',
    'CACHE_DEFAULT_TIMEOUT': 3600,  # 1 hour for healthcare data
    'CACHE_KEY_PREFIX': 'superset_data_',
    'CACHE_REDIS_HOST': 'redis',
    'CACHE_REDIS_PORT': 6379,
    'CACHE_REDIS_PASSWORD': 'redis_password',
    'CACHE_REDIS_DB': 3,
} 