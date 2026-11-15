"""ViaCEP wrapper — free Brazilian postal-code lookup.
Returns a dict with street / neighborhood / city / state, or None on any failure.
Never raises — callers treat an empty return as 'CEP unknown, user fills manually'."""
import re
from typing import Optional, Dict

import httpx


def lookup_cep(cep: str, timeout: float = 4.0) -> Optional[Dict[str, str]]:
    if not cep:
        return None
    digits = re.sub(r"\D", "", cep)
    if len(digits) != 8:
        return None
    url = f"https://viacep.com.br/ws/{digits}/json/"
    try:
        r = httpx.get(url, timeout=timeout)
        if r.status_code != 200:
            return None
        data = r.json()
        if not isinstance(data, dict) or data.get("erro"):
            return None
        return {
            "cep":          data.get("cep") or digits,
            "street":       data.get("logradouro") or "",
            "neighborhood": data.get("bairro") or "",
            "city":         data.get("localidade") or "",
            "state":        (data.get("uf") or "").upper(),
            "complement":   data.get("complemento") or "",
        }
    except Exception:
        return None