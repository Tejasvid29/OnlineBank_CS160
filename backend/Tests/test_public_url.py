"""Signed check-image links are rewritten to SUPABASE_PUBLIC_URL when the backend talks to Supabase on an internal address."""

import support  # noqa: F401  (sets the test environment before the backend modules import)

import deposits
from config import settings


def test_signed_link_is_unchanged_without_a_public_url(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "http://kong:8000")
    monkeypatch.setattr(settings, "supabase_public_url", "")
    link = "http://kong:8000/storage/v1/object/sign/check-deposits/a/front.jpg?token=t"
    assert deposits._public_origin(link) == link


def test_signed_link_uses_the_public_origin(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "http://kong:8000")
    monkeypatch.setattr(settings, "supabase_public_url", "http://localhost:54321/")
    link = "http://kong:8000/storage/v1/object/sign/check-deposits/a/front.jpg?token=t"
    assert deposits._public_origin(link) == "http://localhost:54321/storage/v1/object/sign/check-deposits/a/front.jpg?token=t"


def test_links_for_other_hosts_are_left_alone(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "http://kong:8000")
    monkeypatch.setattr(settings, "supabase_public_url", "http://localhost:54321")
    link = "https://elsewhere.test/object/sign/x.jpg?token=t"
    assert deposits._public_origin(link) == link
