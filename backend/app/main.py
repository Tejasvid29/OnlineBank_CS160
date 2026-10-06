from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from supabase import Client

from .config import settings
from .db import get_supabase

app = FastAPI(title="OnlineBank API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/db")
def health_db(db: Client = Depends(get_supabase)):
    # Lightweight connectivity check against Supabase Auth admin API.
    db.auth.admin.list_users(page=1, per_page=1)
    return {"status": "ok", "supabase": "connected"}
