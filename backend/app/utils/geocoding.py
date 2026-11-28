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


def geocode_structured(
    street:       Optional[str],
    number:       Optional[str],
    neighborhood: Optional[str],
    city:         Optional[str],
    state:        Optional[str],
    cep:          Optional[str],
    timeout:      float = 5.0,
) -> Optional[Tuple[float, float]]:
    """Geocode a structured Brazilian address safely.

    Differences from geocode_address:
      • Omits the unit complement entirely. Strings like "apto 103/2" confuse
        Google's parser and can push it to a same-named street in a different
        city — see the Londrina (PR) → São Paulo (SP) 460 km bug where
        "Rua Paes Leme" exists in both and Google returned the SP match.
      • Validates the returned address_components against the requested city
        and state. On a mismatch, returns None rather than silently saving the
        wrong point. The caller then stores NULL lat/lng — the GPS check-in
        feature skips the radius check for that booking (safe fallback) rather
        than hard-blocking a legitimate pro at the wrong distance.
      • Logs mismatches to stdout so we see them in Render logs and can tune
        the matcher if a real Brazilian city comes back in an unexpected shape.

    Returns (lat, lng) on a validated match, None on any failure. Never raises.
    """
    api_key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    if not api_key:
        return None

    # Build the query WITHOUT the complement.
    parts = []
    if street:
        parts.append(f"{street}, {number}" if number else street)
    # complement intentionally omitted — see docstring
    if neighborhood:
        parts.append(neighborhood)
    if city:
        parts.append(city)
    if state:
        parts.append(state)
    if cep:
        parts.append(f"CEP {cep}")
    address = ", ".join(parts).strip()
    if not address:
        return None

    url = "https://maps.googleapis.com/maps/api/geocode/json"
    try:
        r = httpx.get(
            url,
            params={"address": address, "key": api_key, "region": "br"},
            timeout=timeout,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        if data.get("status") != "OK" or not data.get("results"):
            return None
        result = data["results"][0]

        # ── Validate returned address_components against requested city/state
        # Google returns the city under "locality" in most cases but under
        # "administrative_area_level_2" for some smaller Brazilian cities; we
        # accept either. State comes back as "administrative_area_level_1"
        # (long_name = "Paraná", short_name = "PR"). We check long_name and
        # short_name, case-insensitive, substring either direction so minor
        # punctuation differences ("São Paulo" vs "Sao Paulo") still match.
        components = result.get("address_components") or []

        def _comp_blob(*wanted_types):
            vals = []
            for c in components:
                c_types = c.get("types") or []
                if any(t in c_types for t in wanted_types):
                    long_name = (c.get("long_name") or "").strip().lower()
                    short_name = (c.get("short_name") or "").strip().lower()
                    if long_name:
                        vals.append(long_name)
                    if short_name and short_name != long_name:
                        vals.append(short_name)
            return vals

        def _matches(requested: Optional[str], blob_vals) -> bool:
            if not requested:
                return True
            req = requested.strip().lower()
            if not req:
                return True
            if not blob_vals:
                return False
            for v in blob_vals:
                if not v:
                    continue
                if req in v or v in req:
                    return True
            return False

        city_blob = _comp_blob("locality", "administrative_area_level_2")
        state_blob = _comp_blob("administrative_area_level_1")

        if not _matches(city, city_blob):
            print(
                f"[GEOCODE] city mismatch — requested city={city!r} state={state!r} | "
                f"got city_blob={city_blob} state_blob={state_blob} — refusing coords"
            )
            return None
        if not _matches(state, state_blob):
            print(
                f"[GEOCODE] state mismatch — requested city={city!r} state={state!r} | "
                f"got city_blob={city_blob} state_blob={state_blob} — refusing coords"
            )
            return None

        loc = result["geometry"]["location"]
        return float(loc["lat"]), float(loc["lng"])
    except Exception:
        return None