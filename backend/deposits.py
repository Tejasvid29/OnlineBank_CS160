"""Mobile check intake and manager review. Submitting never credits an account; only a manager's approval does."""

import hashlib
import io
import re
import uuid
import warnings
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field, field_validator
from supabase import Client

import audit
import notifications
from accounts import _get_own_account
from api_docs import ADMIN, SIGNED_IN, errors
from audit import record_event
from auth import get_current_user, require_role
from config import settings
from db import get_supabase
from notifications import account_label, money, notify

router = APIRouter(prefix="/deposits", tags=["check-deposits"])

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MIN_SHORT_SIDE = 400
MIN_LONG_SIDE = 800
Image.MAX_IMAGE_PIXELS = 24_000_000
DEPOSIT_COLUMNS = "id, account_id, customer_id, amount, status, transaction_id, created_at"


def _amount(value: str) -> Decimal:
    if not re.fullmatch(r"\d{1,10}(?:\.\d{1,2})?", value.strip()):
        raise HTTPException(422, "Enter a valid check amount with up to two decimal places.")
    parsed = Decimal(value)
    if parsed <= 0:
        raise HTTPException(422, "Check amount must be greater than $0.")
    return parsed


def _photo(upload: UploadFile, side: str) -> tuple[bytes, str]:
    if upload.content_type not in {"image/jpeg", "image/png"}:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, f"The {side} photo must be a JPEG or PNG image.")
    raw = upload.file.read(MAX_IMAGE_BYTES + 1)
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(413, f"The {side} photo is too large. Use an image under 10 MB.")
    if not raw:
        raise HTTPException(422, f"The {side} photo is empty.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as opened:
                if opened.format not in {"JPEG", "PNG"}:
                    raise ValueError("Unsupported image format")
                opened.load()
                image = ImageOps.exif_transpose(opened).convert("RGB")
                if min(image.size) < MIN_SHORT_SIDE or max(image.size) < MIN_LONG_SIDE:
                    raise HTTPException(422, f"The {side} photo is too small to review. Retake it with the full check visible.")
                output = io.BytesIO()
                # Normalize orientation and strip EXIF (including any location tags) before storage.
                image.save(output, format="JPEG", quality=88, optimize=True)
    except HTTPException:
        raise
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, f"The {side} photo could not be read. Retake it in good light.")
    data = output.getvalue()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, f"The {side} photo is too large after processing. Retake it under 10 MB.")
    return data, hashlib.sha256(data).hexdigest()


def _out(row: dict) -> dict:
    # Never return private Storage paths or image hashes to the client.
    return {key: (float(row[key]) if key == "amount" else row[key]) for key in DEPOSIT_COLUMNS.split(", ")}


def _existing(db: Client, user_id: str, front_hash: str, back_hash: str) -> dict | None:
    rows = (db.table("check_deposits").select(DEPOSIT_COLUMNS)
            .eq("customer_id", user_id).eq("front_sha256", front_hash)
            .eq("back_sha256", back_hash).limit(1).execute().data)
    return rows[0] if rows else None


def _repeat_result(row: dict, account_id: str, amount: Decimal):
    if row["account_id"] != account_id or Decimal(str(row["amount"])) != amount or row["status"] != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This check has already been submitted.")
    return JSONResponse({"deposit": _out(row), "already_submitted": True}, status_code=status.HTTP_200_OK)


def _remove_uploaded(bucket, paths: list[str]) -> None:
    if paths:
        try:
            bucket.remove(paths)
        except Exception:
            # Keep the original request error. An operator can clean orphaned private objects.
            pass


@router.get("", summary="List your check deposits", responses=errors(*SIGNED_IN))
def list_deposits(user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    rows = (db.table("check_deposits").select(DEPOSIT_COLUMNS)
            .eq("customer_id", user["id"]).order("created_at", desc=True).limit(50).execute().data)
    return {"deposits": [_out(row) for row in rows]}


@router.post(
    "", status_code=status.HTTP_201_CREATED, summary="Submit a check deposit for review",
    responses={
        200: {"description": "This exact check was already submitted and is still pending; that deposit is returned with `already_submitted: true`."},
        **errors(*SIGNED_IN, 404, (409, "The account is closed, or this check was already submitted with different details."),
                 (413, "A photo is over 10 MB."), (415, "A photo isn't JPEG or PNG."), 503),
    },
)
def submit_deposit(
    account_id: uuid.UUID = Form(..., description="One of your open accounts."),
    amount: str = Form(..., description="Check amount, up to two decimal places.", examples=["125.50"]),
    front_image: UploadFile = File(..., description="Front of the check, JPEG or PNG, at least 800×400, under 10 MB."),
    back_image: UploadFile = File(..., description="Back of the check, signed, same limits."),
    user: dict = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    account_id = str(account_id)
    parsed_amount = _amount(amount)
    account = _get_own_account(db, user["id"], account_id)
    if account["status"] != "activated":
        raise HTTPException(status.HTTP_409_CONFLICT, "This account is closed.")

    front, front_hash = _photo(front_image, "front")
    back, back_hash = _photo(back_image, "back")
    if front_hash == back_hash:
        raise HTTPException(422, "Use different photos for the front and back of the check.")

    try:
        existing = _existing(db, user["id"], front_hash, back_hash)
    except Exception:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Check deposit service is not ready.")
    if existing:
        return _repeat_result(existing, account_id, parsed_amount)

    deposit_id = str(uuid.uuid4())
    prefix = f"{user['id']}/{deposit_id}"
    paths = [f"{prefix}/front.jpg", f"{prefix}/back.jpg"]
    bucket = db.storage.from_(settings.check_deposit_bucket)
    uploaded = []
    try:
        for path, image in zip(paths, (front, back)):
            bucket.upload(path=path, file=image, file_options={"content-type": "image/jpeg", "upsert": "false"})
            uploaded.append(path)
    except Exception:
        _remove_uploaded(bucket, uploaded)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Check photos could not be stored. Please try again.")

    try:
        row = db.rpc("submit_check_deposit", {
            "p_deposit_id": deposit_id,
            "p_user_id": user["id"],
            "p_account_id": account_id,
            "p_amount": str(parsed_amount),
            "p_front_path": paths[0],
            "p_back_path": paths[1],
            "p_front_sha256": front_hash,
            "p_back_sha256": back_hash,
        }).execute().data
    except Exception as exc:
        _remove_uploaded(bucket, uploaded)
        if "duplicate_check" in str(exc):
            raise HTTPException(status.HTTP_409_CONFLICT, "This check has already been submitted.")
        if "account_not_found" in str(exc):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found.")
        if "account_closed" in str(exc):
            raise HTTPException(status.HTTP_409_CONFLICT, "This account is closed.")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Check deposit could not be recorded. Please try again.")

    if isinstance(row, list):
        row = row[0] if row else None
    if not row:
        _remove_uploaded(bucket, uploaded)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Check deposit could not be recorded. Please try again.")
    if row["id"] != deposit_id:
        # An identical request won a race while the images were uploading.
        _remove_uploaded(bucket, uploaded)
        return _repeat_result(row, account_id, parsed_amount)
    notify(db, user["id"], notifications.CHECK_DEPOSIT, "Check deposit received",
           f"Your check deposit of {money(parsed_amount)} to your {account_label(account)} is pending review.",
           transaction_id=row.get("transaction_id"), deposit_id=row["id"])
    return {"deposit": _out(row)}


# Manager review. Approval is the only path that credits a check, through review_check_deposit() in
# sql/check_deposit_review.sql, which locks the deposit so it can be decided (and credited) only once.
admin_only = require_role("admin")
review_router = APIRouter(prefix="/manager/check-deposits", tags=["check-deposits"], dependencies=[Depends(admin_only)], responses=errors(*ADMIN))

REVIEW_FIELDS = "id, account_id, customer_id, amount, status, transaction_id, created_at, review_notes, reviewed_at, reviewed_by"
# Two columns reference users (customer_id, reviewed_by), so the customer join names its column.
REVIEW_COLUMNS = (
    f"{REVIEW_FIELDS}, customer:users!customer_id(first_name, last_name, email), "
    "account:accounts(account_type, account_number, status)"
)
IMAGE_URL_SECONDS = 300

# Raised by review_check_deposit().
REVIEW_ERRORS = {
    "deposit_not_found": (status.HTTP_404_NOT_FOUND, "Check deposit not found."),
    "own_deposit": (status.HTTP_403_FORBIDDEN, "You can't review your own check deposit. Ask another manager."),
    "already_reviewed": (status.HTTP_409_CONFLICT, "This check deposit has already been reviewed."),
    "account_closed": (status.HTTP_409_CONFLICT, "The account for this deposit is closed, so it can't be approved. Reject it instead."),
    "account_not_found": (status.HTTP_404_NOT_FOUND, "The account for this deposit no longer exists."),
    "notes_required": (422, "Enter a reason for rejecting this check."),
    "transaction_not_pending": (status.HTTP_409_CONFLICT, "This deposit's transaction is no longer pending."),
}


class RejectRequest(BaseModel):
    notes: str = Field(max_length=500, description="Why the check was rejected. The customer sees it.")

    model_config = ConfigDict(json_schema_extra={"examples": [{"notes": "The back of the check isn't signed."}]})

    @field_validator("notes")
    @classmethod
    def _required(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError("Enter a reason for rejecting this check.")
        return value


def _review_out(row: dict) -> dict:
    # Same rule as _out: no Storage paths or image hashes.
    return {
        **{key: (float(row[key]) if key == "amount" else row.get(key)) for key in REVIEW_FIELDS.split(", ")},
        "customer": row.get("customer") or {},
        "account": row.get("account") or {},
    }


def _get_review_row(db: Client, deposit_id: str, columns: str = REVIEW_COLUMNS) -> dict:
    rows = db.table("check_deposits").select(columns).eq("id", deposit_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Check deposit not found.")
    return rows[0]


def _signed_url(bucket, path: str) -> str | None:
    try:
        return bucket.create_signed_url(path, IMAGE_URL_SECONDS)["signedURL"]
    except Exception:
        return None  # The details still load; the reviewer sees the image is unavailable.


def _decide(db: Client, deposit_id: uuid.UUID, admin: dict, decision: str, notes: str | None):
    try:
        row = db.rpc("review_check_deposit", {
            "p_deposit_id": str(deposit_id), "p_reviewer_id": admin["id"], "p_decision": decision, "p_notes": notes,
        }).execute().data
    except Exception as exc:
        for code, (http_status, message) in REVIEW_ERRORS.items():
            if code in str(exc):
                raise HTTPException(http_status, message)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The check deposit could not be reviewed. Please try again.")
    if isinstance(row, list):
        row = row[0] if row else None
    if not row:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The check deposit could not be reviewed. Please try again.")
    reviewed = _get_review_row(db, row["id"])
    account = reviewed["account"] or {}
    record_event(
        db, reviewed["customer_id"], audit.CHECK_DEPOSIT_APPROVED if decision == "approve" else audit.CHECK_DEPOSIT_REJECTED,
        {"deposit_id": reviewed["id"], "amount": float(reviewed["amount"]), "account_number": account.get("account_number"),
         "account_type": account.get("account_type"), **({"notes": notes} if notes else {})},
        actor_id=admin["id"],
    )
    approved = decision == "approve"
    notify(
        db, reviewed["customer_id"], notifications.CHECK_DEPOSIT, "Check deposit approved" if approved else "Check deposit rejected",
        f"Your check deposit of {money(reviewed['amount'])} to your {account_label(account)} "
        + ("was approved and is now available." if approved else f"was rejected: {notes}"),
        transaction_id=reviewed.get("transaction_id"), deposit_id=reviewed["id"],
    )
    return {"deposit": _review_out(reviewed)}


@review_router.get("", summary="List check deposits for review (admin)")
def list_for_review(
    status_filter: Literal["pending", "approved", "rejected", "all"] = Query("pending", alias="status"),
    limit: int = Query(100, ge=1, le=500),
    db: Client = Depends(get_supabase),
):
    """Pending checks oldest first (the queue); other statuses newest first."""
    query = db.table("check_deposits").select(REVIEW_COLUMNS)
    if status_filter != "all":
        query = query.eq("status", status_filter)
    # Oldest pending check first, so the queue is worked in order; history newest first.
    rows = query.order("created_at", desc=status_filter != "pending").limit(limit).execute().data
    return {"deposits": [_review_out(row) for row in rows]}


@review_router.get("/{deposit_id}", summary="Get a check deposit with image links (admin)", responses=errors(404))
def get_for_review(deposit_id: uuid.UUID, db: Client = Depends(get_supabase)):
    """Image links are signed and expire after `image_url_expires_in` seconds; fetch again for new ones."""
    row = _get_review_row(db, str(deposit_id), f"{REVIEW_COLUMNS}, front_image_path, back_image_path")
    bucket = db.storage.from_(settings.check_deposit_bucket)
    return {"deposit": {
        **_review_out(row),
        "front_image_url": _signed_url(bucket, row["front_image_path"]),
        "back_image_url": _signed_url(bucket, row["back_image_path"]),
        "image_url_expires_in": IMAGE_URL_SECONDS,
    }}


@review_router.post(
    "/{deposit_id}/approve", summary="Approve a check deposit and credit it (admin)",
    responses=errors((403, "Not an admin, or this is your own deposit."), 404, (409, "Already reviewed, or the account is closed."), 503),
)
def approve_deposit(deposit_id: uuid.UUID, admin: dict = Depends(admin_only), db: Client = Depends(get_supabase)):
    return _decide(db, deposit_id, admin, "approve", None)


@review_router.post(
    "/{deposit_id}/reject", summary="Reject a check deposit (admin)",
    responses=errors((403, "Not an admin, or this is your own deposit."), 404, (409, "Already reviewed."), 503),
)
def reject_deposit(deposit_id: uuid.UUID, body: RejectRequest, admin: dict = Depends(admin_only), db: Client = Depends(get_supabase)):
    return _decide(db, deposit_id, admin, "reject", body.notes)
