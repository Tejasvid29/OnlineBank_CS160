from functools import lru_cache

import httpx
from supabase import Client, ClientOptions, create_client

from config import settings

# Matches postgrest's default request timeout; auth and storage share this client.
HTTP_TIMEOUT_SECONDS = 120
# Keep an idle connection for each of FastAPI's 40 worker threads (anyio's default), so busy moments don't close
# connections another thread is about to reuse.
HTTP_LIMITS = httpx.Limits(max_connections=100, max_keepalive_connections=40)


@lru_cache
def get_supabase() -> Client:
    # FastAPI runs sync routes on several threads that share this client. supabase-py defaults to HTTP/2, and
    # concurrent requests on one shared HTTP/2 connection break it ("RemoteProtocolError: Server disconnected").
    # An HTTP/1.1 pool is thread-safe: each in-flight request gets its own connection.
    http_client = httpx.Client(http2=False, timeout=HTTP_TIMEOUT_SECONDS, limits=HTTP_LIMITS, follow_redirects=True)
    return create_client(
        settings.supabase_url,
        settings.supabase_secret_key,
        options=ClientOptions(httpx_client=http_client),
    )
