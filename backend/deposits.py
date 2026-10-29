"""Mobile check intake. Uploaded checks stay pending; this route never credits an account."""

import hashlib
import io
import re
import uuid
import warnings
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from supabase import Client

from accounts import _get_own_account
from auth import get_current_user
from config import settings
from db import get_supabase

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


@router.get("")
def list_deposits(user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    rows = (db.table("check_deposits").select(DEPOSIT_COLUMNS)
            .eq("customer_id", user["id"]).order("created_at", desc=True).limit(50).execute().data)
    return {"deposits": [_out(row) for row in rows]}


@router.post("", status_code=status.HTTP_201_CREATED)
def submit_deposit(
    account_id: uuid.UUID = Form(...),
    amount: str = Form(...),
    front_image: UploadFile = File(...),
    back_image: UploadFile = File(...),
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
    return {"deposit": _out(row)}
