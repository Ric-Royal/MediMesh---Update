"""Governed, aggregate-only patient analytics.

This DAG must remain disabled until the controller has approved the purpose,
lawful basis, DPIA, transfer assessment, retention, and recipient access. The
database connection must be a read-only account restricted to approved
de-identified views.
"""

import json
import logging
import os
from datetime import datetime, timedelta, timezone

from airflow import DAG
from airflow.exceptions import AirflowSkipException
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook
from airflow.providers.redis.hooks.redis_hook import RedisHook


DEFAULT_ARGS = {
    "owner": "data-governance",
    "depends_on_past": False,
    "start_date": datetime(2026, 1, 1, tzinfo=timezone.utc),
    "email_on_failure": True,
    "email_on_retry": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

dag = DAG(
    "medimesh_approved_aggregate_analytics",
    default_args=DEFAULT_ARGS,
    description="Purpose-approved, thresholded aggregate metrics",
    schedule_interval=timedelta(hours=6),
    catchup=False,
    tags=["governed-analytics", "aggregate-only"],
    max_active_runs=1,
)


def require_governance_approval():
    if os.environ.get("ANALYTICS_APPROVED", "").lower() != "true":
        raise AirflowSkipException("Analytics processing has not been approved")
    minimum_group_size = int(os.environ.get("ANALYTICS_MIN_GROUP_SIZE", "10"))
    if minimum_group_size < 10:
        raise ValueError("ANALYTICS_MIN_GROUP_SIZE must be at least 10")
    return minimum_group_size


def extract_aggregate_metrics(**_context):
    """Return thresholded aggregates; never return identifiable rows."""
    minimum_group_size = require_governance_approval()
    hook = PostgresHook(postgres_conn_id="medimesh_analytics_readonly")
    rows = hook.get_records(
        """
        SELECT
          COALESCE(gender, 'not-recorded') AS group_name,
          COUNT(*)::int AS patient_count,
          ROUND(AVG(EXTRACT(YEAR FROM AGE(CURRENT_DATE, date_of_birth)))::numeric, 1)
            AS average_age
        FROM analytics.approved_patient_demographics
        GROUP BY COALESCE(gender, 'not-recorded')
        HAVING COUNT(*) >= %s
        ORDER BY group_name
        """,
        parameters=(minimum_group_size,),
    )
    metrics = {
        "groups": [
            {
                "group_name": group_name,
                "patient_count": patient_count,
                "average_age": float(average_age) if average_age is not None else None,
            }
            for group_name, patient_count, average_age in rows
        ],
        "minimum_group_size": minimum_group_size,
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }
    logging.info("Produced %d thresholded aggregate groups", len(metrics["groups"]))
    return metrics


def publish_aggregate_metrics(**context):
    """Publish only the approved aggregate object with a six-hour expiry."""
    metrics = context["task_instance"].xcom_pull(task_ids="extract_aggregate_metrics")
    if not isinstance(metrics, dict):
        raise ValueError("Aggregate metrics are unavailable")
    redis = RedisHook(redis_conn_id="medimesh_analytics_cache").get_conn()
    redis.set("approved_patient_aggregate_metrics", json.dumps(metrics), ex=21600)
    logging.info("Published approved aggregate metrics")
    return {
        "group_count": len(metrics.get("groups", [])),
        "processed_at": metrics.get("processed_at"),
    }


extract_task = PythonOperator(
    task_id="extract_aggregate_metrics",
    python_callable=extract_aggregate_metrics,
    dag=dag,
)

publish_task = PythonOperator(
    task_id="publish_aggregate_metrics",
    python_callable=publish_aggregate_metrics,
    dag=dag,
)

extract_task >> publish_task

extract_task.doc_md = """
Reads only an approved, de-identified database view through a read-only
connection. Groups below the configured threshold are suppressed. Identifiers,
names, contact details, dates of birth, and row-level records never enter XCom.
"""

publish_task.doc_md = """
Writes only thresholded aggregate metrics to a separately governed cache with
a six-hour expiry.
"""
