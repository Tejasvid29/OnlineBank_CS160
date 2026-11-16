import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from supabase import Client

import api_docs
from accounts import router as accounts_router
from api_docs import ADMIN, errors
from atm import router as atm_router
from atms import router as atms_router
from auth import require_role, router as auth_router
from bill_payments import router as bill_payments_router
from deposits import review_router as deposit_review_router, router as deposits_router
from notifications import router as notifications_router
from config import settings
from db import get_supabase
from reports import router as reports_router
from statements import router as statements_router, send_pending_statement_emails
from transactions import router as transactions_router

logger = logging.getLogger(__name__)


async def _email_statements_forever():
    """Month-end statements are written by a database cron job; this emails them once the backend is running."""
    while True:
        await asyncio.sleep(settings.statement_email_interval_seconds)
        try:
            sent = await asyncio.to_thread(lambda: send_pending_statement_emails(get_supabase()))
            if sent:
                logger.info("Emailed %d statement(s)", sent)
        except Exception:
            logger.exception("Statement email check failed")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(_email_statements_forever()) if settings.statement_email_interval_seconds > 0 else None
    try:
        yield
    finally:
        if task:
            task.cancel()


app = FastAPI(
    title=api_docs.TITLE,
    description=api_docs.DESCRIPTION,
    version=api_docs.VERSION,
    openapi_tags=api_docs.TAGS,
    lifespan=lifespan,
)
app.include_router(auth_router)
app.include_router(accounts_router)
app.include_router(transactions_router)
app.include_router(bill_payments_router)
app.include_router(deposits_router)
app.include_router(deposit_review_router)
app.include_router(atm_router)
app.include_router(atms_router)
app.include_router(reports_router)
app.include_router(statements_router)
app.include_router(notifications_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"], summary="Check the API is running")
def health():
    return {"status": "ok"}


@app.get("/manager/customers", dependencies=[Depends(require_role("admin"))], tags=["manager"], summary="List all customers (admin)", responses=errors(*ADMIN))
def manager_customers(db: Client = Depends(get_supabase)):
    rows = db.table("users").select("id, first_name, last_name, email, zip_code, role, status, created_at").execute().data
    return {"customers": rows}


@app.get("/health/db", tags=["health"], summary="Check the database connection")
def health_db(db: Client = Depends(get_supabase)):
    # Lightweight connectivity check against Supabase Auth admin API.
    db.auth.admin.list_users(page=1, per_page=1)
    return {"status": "ok", "supabase": "connected"}
