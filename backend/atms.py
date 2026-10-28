import logging
import math
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth import get_current_user
from config import settings

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/atm", tags=["atm"])

GEOCODE_URL = "https://api.geoapify.com/v1/geocode/search"
PLACES_URL = "https://api.geoapify.com/v2/places"
RADII_METERS = (16_000, 40_000)  # ~10 mi, then widen once
MAX_RESULTS = 10
PLACES_LIMIT = 100
CACHE_TTL_SECONDS = 60 * 60
UPSTREAM_TIMEOUT = 10.0

# Geoapify's free plan is metered per day, so remember answers instead of re-asking.
_cache: dict[tuple, tuple[float, object]] = {}


def _cached(key: tuple, fetch):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_TTL_SECONDS:
        return hit[1]
    value = fetch()
    _cache[key] = (time.monotonic(), value)
    return value


def _upstream_error() -> HTTPException:
    return HTTPException(status.HTTP_502_BAD_GATEWAY, "The map service is unavailable right now. Please try again shortly.")


def _call(url: str, params: dict) -> dict:
    if not settings.geoapify_api_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "ATM search is not configured on the server.")
    try:
        with httpx.Client(timeout=UPSTREAM_TIMEOUT) as client:
            response = client.get(url, params={**params, "apiKey": settings.geoapify_api_key})
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, ValueError) as error:
        # Never log the request URL: it carries the API key.
        logger.warning("Geoapify %s failed: %s", url, type(error).__name__ if not isinstance(error, httpx.HTTPStatusError) else error.response.status_code)
        raise _upstream_error()


def _geocode(location: str) -> tuple[float, float] | None:
    def fetch():
        data = _call(GEOCODE_URL, {"text": location, "format": "json", "limit": 1, "filter": "countrycode:us"})
        rows = data.get("results") or []
        return (float(rows[0]["lat"]), float(rows[0]["lon"])) if rows else None

    return _cached(("geo", " ".join(location.lower().split())), fetch)


def _is_chase(properties: dict) -> bool:
    raw = (properties.get("datasource") or {}).get("raw") or {}
    haystack = " ".join(str(v) for v in (properties.get("name"), properties.get("brand"), properties.get("operator"), raw.get("brand"), raw.get("operator"), raw.get("name")) if v)
    return "chase" in haystack.lower()


def _places(lat: float, lng: float, radius: int, name: str | None) -> list[dict]:
    params = {"categories": "service.financial.atm", "filter": f"circle:{lng},{lat},{radius}", "bias": f"proximity:{lng},{lat}", "limit": PLACES_LIMIT}
    if name:
        params["name"] = name
    features = _call(PLACES_URL, params).get("features", [])
    return [f["properties"] for f in features if _is_chase(f.get("properties", {}))]


def _find_atms(lat: float, lng: float) -> list[dict]:
    def fetch():
        for radius in RADII_METERS:
            # The name filter keeps the 100-result page for Chase; if it matches nothing (e.g. "JPMorgan Chase Bank"), scan the area's ATMs.
            found = _places(lat, lng, radius, "Chase") or _places(lat, lng, radius, None)
            if found:
                return found
        return []

    return _cached(("atm", round(lat, 3), round(lng, 3)), fetch)


def _miles_between(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(a))


def _hours(properties: dict) -> str:
    raw = (properties.get("datasource") or {}).get("raw") or {}
    hours = properties.get("opening_hours") or raw.get("opening_hours")
    if not hours:
        return "Hours not listed"
    return "Open 24 hours" if str(hours).strip() == "24/7" else str(hours)


def _out(properties: dict, origin: tuple[float, float]) -> dict | None:
    if properties.get("lat") is None or properties.get("lon") is None:
        return None
    miles = _miles_between(origin[0], origin[1], properties["lat"], properties["lon"])
    return {
        "id": properties.get("place_id") or f"{properties['lat']},{properties['lon']}",
        "name": properties.get("name") or "Chase ATM",
        "address": properties.get("formatted") or properties.get("address_line2") or "Address unavailable",
        "distance": f"{miles:.1f} mi" if miles < 10 else f"{round(miles):,} mi",
        "hours": _hours(properties),
        "latitude": properties["lat"],
        "longitude": properties["lon"],
        "_miles": miles,
    }


@router.get("/search")
def search_atms(
    location: str | None = Query(default=None, min_length=1, max_length=200),
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
    _user: dict = Depends(get_current_user),
):
    if location and location.strip():
        origin = _geocode(location.strip())
        if origin is None:
            return {"atms": []}
    elif lat is not None and lng is not None:
        origin = (lat, lng)
    else:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Provide a location, or both lat and lng.")

    results = [item for item in (_out(p, origin) for p in _find_atms(*origin)) if item]
    # Geoapify can return the same ATM twice (node and building); keep one per spot.
    unique = {(round(i["latitude"], 5), round(i["longitude"], 5)): i for i in sorted(results, key=lambda i: -i["_miles"])}
    ordered = sorted(unique.values(), key=lambda i: i["_miles"])
    return {"atms": [{k: v for k, v in item.items() if k != "_miles"} for item in ordered[:MAX_RESULTS]]}
