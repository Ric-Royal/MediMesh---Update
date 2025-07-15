"""
MediMesh Patient Data ETL Pipeline
This DAG demonstrates healthcare data processing workflows for patient information.
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.postgres_operator import PostgresOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook
from airflow.providers.redis.hooks.redis_hook import RedisHook
import pandas as pd
import logging

# Default arguments for the DAG
default_args = {
    'owner': 'medimesh-team',
    'depends_on_past': False,
    'start_date': datetime(2024, 6, 13),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
    'catchup': False,
}

# Define the DAG
dag = DAG(
    'medimesh_patient_etl',
    default_args=default_args,
    description='MediMesh Patient Data ETL Pipeline',
    schedule_interval=timedelta(hours=6),  # Run every 6 hours
    tags=['healthcare', 'etl', 'patients'],
    max_active_runs=1,
)

def extract_patient_data(**context):
    """
    Extract patient data from the main database
    """
    logging.info("Starting patient data extraction...")
    
    # Connect to PostgreSQL
    postgres_hook = PostgresHook(postgres_conn_id='postgres_default')
    
    # Extract patient data
    sql_query = """
    SELECT 
        id,
        patient_id,
        first_name,
        last_name,
        date_of_birth,
        gender,
        phone,
        email,
        created_at,
        updated_at
    FROM patients 
    WHERE updated_at >= NOW() - INTERVAL '6 hours'
    """
    
    df = postgres_hook.get_pandas_df(sql_query)
    logging.info(f"Extracted {len(df)} patient records")
    
    # Store in XCom for next task
    return df.to_json(orient='records')

def transform_patient_data(**context):
    """
    Transform and clean patient data
    """
    logging.info("Starting patient data transformation...")
    
    # Get data from previous task
    patient_data_json = context['task_instance'].xcom_pull(task_ids='extract_patient_data')
    df = pd.read_json(patient_data_json, orient='records')
    
    # Data transformations
    # 1. Standardize phone numbers
    df['phone'] = df['phone'].str.replace(r'[^\d]', '', regex=True)
    
    # 2. Calculate age
    df['date_of_birth'] = pd.to_datetime(df['date_of_birth'])
    df['age'] = (datetime.now() - df['date_of_birth']).dt.days // 365
    
    # 3. Standardize gender
    df['gender'] = df['gender'].str.upper()
    
    # 4. Create patient summary
    df['full_name'] = df['first_name'] + ' ' + df['last_name']
    
    # 5. Data quality checks
    df = df.dropna(subset=['patient_id', 'first_name', 'last_name'])
    
    logging.info(f"Transformed {len(df)} patient records")
    
    return df.to_json(orient='records')

def load_patient_analytics(**context):
    """
    Load transformed data into analytics tables
    """
    logging.info("Starting patient analytics data load...")
    
    # Get transformed data
    transformed_data_json = context['task_instance'].xcom_pull(task_ids='transform_patient_data')
    df = pd.read_json(transformed_data_json, orient='records')
    
    # Connect to PostgreSQL
    postgres_hook = PostgresHook(postgres_conn_id='postgres_default')
    
    # Create analytics summary
    analytics_summary = {
        'total_patients': len(df),
        'avg_age': df['age'].mean() if len(df) > 0 else 0,
        'gender_distribution': df['gender'].value_counts().to_dict() if len(df) > 0 else {},
        'processed_at': datetime.now().isoformat(),
    }
    
    # Store in Redis cache for quick access
    try:
        redis_hook = RedisHook(redis_conn_id='redis_default')
        redis_hook.get_conn().set(
            'patient_analytics_summary', 
            str(analytics_summary),
            ex=21600  # Expire in 6 hours
        )
        logging.info("Analytics summary cached in Redis")
    except Exception as e:
        logging.warning(f"Could not cache in Redis: {e}")
    
    logging.info(f"Processed analytics for {len(df)} patients")
    
    return analytics_summary

def validate_data_quality(**context):
    """
    Validate data quality and send alerts if needed
    """
    logging.info("Starting data quality validation...")
    
    # Get analytics summary
    analytics = context['task_instance'].xcom_pull(task_ids='load_patient_analytics')
    
    # Data quality checks
    quality_issues = []
    
    if analytics['total_patients'] == 0:
        quality_issues.append("No patient data processed")
    
    if analytics['avg_age'] < 0 or analytics['avg_age'] > 120:
        quality_issues.append(f"Suspicious average age: {analytics['avg_age']}")
    
    # Log results
    if quality_issues:
        logging.warning(f"Data quality issues found: {quality_issues}")
        # In production, this would send alerts
    else:
        logging.info("Data quality validation passed")
    
    return {
        'quality_status': 'PASS' if not quality_issues else 'FAIL',
        'issues': quality_issues,
        'checked_at': datetime.now().isoformat()
    }

# Define tasks
extract_task = PythonOperator(
    task_id='extract_patient_data',
    python_callable=extract_patient_data,
    dag=dag,
)

transform_task = PythonOperator(
    task_id='transform_patient_data',
    python_callable=transform_patient_data,
    dag=dag,
)

load_task = PythonOperator(
    task_id='load_patient_analytics',
    python_callable=load_patient_analytics,
    dag=dag,
)

validate_task = PythonOperator(
    task_id='validate_data_quality',
    python_callable=validate_data_quality,
    dag=dag,
)

# Create analytics table if not exists
create_analytics_table = PostgresOperator(
    task_id='create_analytics_table',
    postgres_conn_id='postgres_default',
    sql="""
    CREATE TABLE IF NOT EXISTS patient_analytics (
        id SERIAL PRIMARY KEY,
        total_patients INTEGER,
        avg_age DECIMAL(5,2),
        gender_distribution JSONB,
        processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        quality_status VARCHAR(10),
        quality_issues JSONB
    );
    """,
    dag=dag,
)

# Set task dependencies
create_analytics_table >> extract_task >> transform_task >> load_task >> validate_task

# Task documentation
extract_task.doc_md = """
## Extract Patient Data Task
This task extracts patient data that has been updated in the last 6 hours.
It connects to the main PostgreSQL database and retrieves patient information.
"""

transform_task.doc_md = """
## Transform Patient Data Task
This task cleans and transforms the extracted patient data:
- Standardizes phone numbers
- Calculates patient age
- Standardizes gender values
- Performs data quality checks
"""

load_task.doc_md = """
## Load Patient Analytics Task
This task loads the transformed data into analytics systems:
- Creates summary statistics
- Caches results in Redis
- Prepares data for reporting
"""

validate_task.doc_md = """
## Data Quality Validation Task
This task validates the processed data quality:
- Checks for data completeness
- Validates data ranges
- Logs quality issues
- In production, would trigger alerts
""" 