"""Geocoding — takes a free-form address string and returns (lat, lng) or None.
Uses Google Maps if GOOGLE_MAPS_API_KEY is set; otherwise returns None (no-op).
Never raises. A None return is safe — callers store NULL lat/lng and the GPS
check-in feature can still work later if geocoding is enabled or coordinates
are added manually."""
import os
from typing import Optional, Tuple

import httpx


def geocode_address(address: str, timeout: float = 5.0) -> Optional[Tuple[float, float]]:
    api_key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    if not api_key or not address or not address.strip():
        return None
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    try:
        r = httpx.get(url, params={"address": address, "key": api_key, "region": "br"}, timeout=timeout)
        if r.status_code != 200:
            return None
        data = r.json()
        if data.get("status") != "OK" or not data.get("results"):
            return None
        loc = data["results"][0]["geometry"]["location"]
        return float(loc["lat"]), float(loc["lng"])
    except Exception:
        return None