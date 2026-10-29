"""The shared Supabase client must use one thread-safe HTTP/1.1 client; nothing here touches the network."""

import support  # noqa: F401  (sets test env vars and sys.path)

from db import get_supabase


def test_services_share_one_http1_client():
    db = get_supabase()
    http_client = db.options.httpx_client
    assert http_client is not None
    assert db.postgrest.session is http_client
    assert db.auth._http_client is http_client
    assert db.storage.session is http_client
    assert http_client._transport._pool._http2 is False
