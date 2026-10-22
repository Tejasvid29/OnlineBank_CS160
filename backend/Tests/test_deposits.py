"""Check intake tests use a fake private bucket and database; no live banking service is touched."""

import io
import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from auth import get_current_user
from db import get_supabase
from main import app

USER_ID = "11111111-1111-1111-1111-111111111111"
OTHER_ID = "22222222-2222-2222-2222-222222222222"
ACCOUNT_ID = "33333333-3333-3333-3333-333333333333"


def photo(color, size=(1200, 650)):
    data = io.BytesIO()
    Image.new("RGB", size, color).save(data, format="JPEG")
    return data.getvalue()


FRONT = photo((244, 238, 220))
BACK = photo((225, 235, 245))


class Query:
    def __init__(self, db, table):
        self.db, self.table, self.filters = db, table, []

    def select(self, *_): return self
    def eq(self, key, value): self.filters.append((key, value)); return self
    def order(self, *_args, **_kwargs): return self
    def limit(self, *_): return self

    def execute(self):
        rows = self.db.accounts if self.table == "accounts" else self.db.deposits
        rows = [row for row in rows if all(row.get(key) == value for key, value in self.filters)]
        return SimpleNamespace(data=rows)


class Bucket:
    def __init__(self):
        self.uploaded = []
        self.removed = []
        self.fail_on_upload = 0

    def upload(self, *, path, file, file_options):
        if self.fail_on_upload == len(self.uploaded) + 1:
            raise RuntimeError("storage unavailable")
        assert isinstance(file, bytes)
        assert file_options["content-type"] == "image/jpeg"
        self.uploaded.append(path)

    def remove(self, paths):
        self.removed.extend(paths)


class Database:
    def __init__(self):
        self.accounts = [{"id": ACCOUNT_ID, "user_id": USER_ID, "status": "activated", "balance": 100}]
        self.deposits = []
        self.bucket = Bucket()
        self.storage = SimpleNamespace(from_=lambda name: self.bucket)
        self.rpc_calls = []
        self.rpc_failure = None
        self.race_row = None

    def table(self, name): return Query(self, name)

    def rpc(self, name, params):
        self.rpc_calls.append((name, params))

        def execute():
            if self.rpc_failure:
                raise self.rpc_failure
            if self.race_row:
                return SimpleNamespace(data=self.race_row)
            row = {
                "id": params["p_deposit_id"], "account_id": params["p_account_id"],
                "customer_id": params["p_user_id"], "amount": params["p_amount"],
                "status": "pending", "transaction_id": str(uuid.uuid4()),
                "created_at": "2026-10-22T12:00:00+00:00",
                "front_sha256": params["p_front_sha256"], "back_sha256": params["p_back_sha256"],
            }
            self.deposits.append(row)
            return SimpleNamespace(data=row)

        return SimpleNamespace(execute=execute)


@pytest.fixture
def db(): return Database()


@pytest.fixture
def client(db):
    app.dependency_overrides[get_supabase] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: {"id": USER_ID, "role": "customer"}
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


def submit(client, *, account_id=ACCOUNT_ID, amount="25.50", front=FRONT, back=BACK):
    return client.post("/deposits", data={"account_id": account_id, "amount": amount}, files={
        "front_image": ("front.jpg", front, "image/jpeg"),
        "back_image": ("back.jpg", back, "image/jpeg"),
    })


def test_submission_is_pending_and_does_not_change_balance(client, db):
    response = submit(client)
    assert response.status_code == 201
    assert response.json()["deposit"]["status"] == "pending"
    assert response.json()["deposit"]["amount"] == 25.5
    assert "front_image_path" not in response.json()["deposit"]
    assert db.accounts[0]["balance"] == 100
    assert len(db.bucket.uploaded) == 2
    assert db.rpc_calls[0][0] == "submit_check_deposit"


def test_retry_returns_existing_deposit_without_uploading_again(client, db):
    first = submit(client)
    second = submit(client)
    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["deposit"]["id"] == first.json()["deposit"]["id"]
    assert len(db.bucket.uploaded) == 2
    assert len(db.deposits) == 1
    assert second.json()["already_submitted"] is True


def test_reusing_photos_for_another_amount_is_rejected(client, db):
    assert submit(client).status_code == 201
    assert submit(client, amount="30.00").status_code == 409
    assert len(db.deposits) == 1


@pytest.mark.parametrize("amount", ["0", "-1", "1.234", "1e3", "10000000000"])
def test_invalid_amount_rejected(client, db, amount):
    assert submit(client, amount=amount).status_code == 422
    assert db.bucket.uploaded == []


def test_other_users_account_is_not_accepted(client, db):
    db.accounts[0]["user_id"] = OTHER_ID
    assert submit(client).status_code == 404
    assert db.bucket.uploaded == []


def test_closed_account_is_not_accepted(client, db):
    db.accounts[0]["status"] = "deactivated"
    assert submit(client).status_code == 409
    assert db.bucket.uploaded == []


def test_unreadable_and_identical_photos_are_rejected(client, db):
    assert submit(client, front=b"not an image").status_code == 422
    assert submit(client, back=FRONT).status_code == 422
    assert submit(client, front=photo((250, 250, 250), (300, 200))).status_code == 422
    assert db.bucket.uploaded == []


def test_oversized_photo_rejected_before_storage(client, db):
    assert submit(client, front=b"x" * (10 * 1024 * 1024 + 1)).status_code == 413
    assert db.bucket.uploaded == []


def test_upload_failure_removes_first_photo_and_records_nothing(client, db):
    db.bucket.fail_on_upload = 2
    assert submit(client).status_code == 503
    assert db.bucket.removed == db.bucket.uploaded
    assert db.deposits == []


def test_database_failure_removes_both_photos(client, db):
    db.rpc_failure = RuntimeError("database unavailable")
    assert submit(client).status_code == 503
    assert db.bucket.removed == db.bucket.uploaded
    assert db.deposits == []


def test_racing_duplicate_removes_new_uploads(client, db):
    db.race_row = {
        "id": str(uuid.uuid4()), "account_id": ACCOUNT_ID, "customer_id": USER_ID,
        "amount": "25.50", "status": "pending", "transaction_id": str(uuid.uuid4()),
        "created_at": "2026-10-22T12:00:00+00:00",
    }
    response = submit(client)
    assert response.status_code == 200
    assert response.json()["already_submitted"] is True
    assert db.bucket.removed == db.bucket.uploaded


def test_list_only_returns_callers_deposits(client, db):
    assert submit(client).status_code == 201
    db.deposits.append({**db.deposits[0], "id": str(uuid.uuid4()), "customer_id": OTHER_ID})
    response = client.get("/deposits")
    assert response.status_code == 200
    assert len(response.json()["deposits"]) == 1
    assert "front_sha256" not in response.json()["deposits"][0]
