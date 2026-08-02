# Superset Configuration for MediMesh
# This file configures Apache Superset for the MediMesh healthcare platform

print(">>> Loading MediMesh superset_config.py")

import os
from datetime import timedelta

# Database Configuration
SQLALCHEMY_DATABASE_URI = os.environ['SUPERSET_DATABASE_URI']

# Security Configuration
SECRET_KEY = os.environ['SUPERSET_SECRET_KEY']

# JWT Configuration for async queries (using correct env var name for Superset 3.x)
JWT_SECRET_KEY = os.environ['SUPERSET_JWT_SECRET']
JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=15)

# Async Query Configuration - DISABLED for now to avoid JWT issues
GLOBAL_ASYNC_QUERIES = False
# ASYNC_QUERY_MANAGER_CLASS = 'superset.utils.async_query_manager.AsyncQueryManager'

# Redis Cache Configuration - RESTORED for Healthcare Performance
CACHE_CONFIG = {
    'CACHE_TYPE': 'RedisCache',
    'CACHE_DEFAULT_TIMEOUT': 300,
    'CACHE_KEY_PREFIX': 'superset_',
    'CACHE_REDIS_HOST': os.environ.get('REDIS_HOST', 'redis'),
    'CACHE_REDIS_PORT': int(os.environ.get('REDIS_PORT', '6379')),
    'CACHE_REDIS_PASSWORD': os.environ['REDIS_PASSWORD'],
    'CACHE_REDIS_DB': 1,
}

# Healthcare Feature Flags
FEATURE_FLAGS = {
    'ENABLE_TEMPLATE_PROCESSING': False,
    'DASHBOARD_NATIVE_FILTERS': True,
    'DASHBOARD_CROSS_FILTERS': True,
    'VERSIONED_EXPORT': True,
}

# Healthcare-Appropriate Security Settings
TALISMAN_ENABLED = True
TALISMAN_CONFIG = {
    'content_security_policy': {
        'default-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'object-src': ["'none'"],
        'frame-ancestors': ["'self'"],
    },
}
WTF_CSRF_ENABLED = True

# Session Configuration
PERMANENT_SESSION_LIFETIME = timedelta(minutes=15)

# Logging Configuration
ENABLE_TIME_ROTATE = True
TIME_ROTATE_LOG_LEVEL = 'INFO'
DATA_DIR = '/app/superset_home'
FILENAME = os.path.join(DATA_DIR, 'superset.log')

# Healthcare Custom CSS
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
SQLLAB_CTAS_NO_LIMIT = False
SQLLAB_TIMEOUT = 300
SQLLAB_DEFAULT_DBID = None

# Healthcare Authentication
AUTH_TYPE = 1  # Database authentication
AUTH_ROLE_ADMIN = 'Admin'
AUTH_ROLE_PUBLIC = None

# MediMesh Database Connection Configuration - RESTORED
DATABASES_CONFIG = {
    'medimesh_analytics': {
        'database_name': 'Approved de-identified analytics views',
        'sqlalchemy_uri': os.environ['MEDIMESH_READONLY_DATABASE_URI'],
        'expose_in_sqllab': False,
        'allow_ctas': False,
        'allow_cvas': False,
        'allow_dml': False,
    }
}

# Healthcare Custom Roles - RESTORED
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

# Redis Results Backend - RESTORED for Healthcare Performance
RESULTS_BACKEND = {
    'CACHE_TYPE': 'RedisCache',
    'CACHE_DEFAULT_TIMEOUT': 86400,
    'CACHE_KEY_PREFIX': 'superset_results_',
    'CACHE_REDIS_HOST': os.environ.get('REDIS_HOST', 'redis'),
    'CACHE_REDIS_PORT': int(os.environ.get('REDIS_PORT', '6379')),
    'CACHE_REDIS_PASSWORD': os.environ['REDIS_PASSWORD'],
    'CACHE_REDIS_DB': 2,
}

# Healthcare Data Retention Policies - RESTORED
DATA_CACHE_CONFIG = {
    'CACHE_TYPE': 'RedisCache',
    'CACHE_DEFAULT_TIMEOUT': 3600,  # 1 hour for healthcare data
    'CACHE_KEY_PREFIX': 'superset_data_',
    'CACHE_REDIS_HOST': os.environ.get('REDIS_HOST', 'redis'),
    'CACHE_REDIS_PORT': int(os.environ.get('REDIS_PORT', '6379')),
    'CACHE_REDIS_PASSWORD': os.environ['REDIS_PASSWORD'],
    'CACHE_REDIS_DB': 3,
}

# Healthcare Thumbnail Cache
THUMBNAIL_CACHE_CONFIG = CACHE_CONFIG

# Healthcare Email Configuration for Alerts
SMTP_HOST = os.environ.get('SMTP_HOST', 'localhost')
SMTP_STARTTLS = True
SMTP_SSL = False
SMTP_USER = os.environ['SMTP_USER']
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
SMTP_PASSWORD = os.environ['SMTP_PASSWORD']
SMTP_MAIL_FROM = os.environ['SMTP_MAIL_FROM']

# Alert and Report Configuration for Healthcare
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

# WebDriver Configuration for Healthcare Reports
WEBDRIVER_BASEURL = "http://superset:8088/"
WEBDRIVER_BASEURL_USER_FRIENDLY = "http://localhost:8088/"

# Healthcare Security Features
ENABLE_PROXY_FIX = True
PROXY_FIX_CONFIG = {"x_for": 1, "x_proto": 1, "x_host": 1, "x_prefix": 1}

print(">>> MediMesh superset_config.py loaded successfully with Healthcare features")
