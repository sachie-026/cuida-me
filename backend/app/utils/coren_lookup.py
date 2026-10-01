"""
COREN Website Lookup — Query Brazilian state nursing council websites
to verify professional registration details.

Returns: full name of owner, state (UF), category (ENF/TE/AE), status (active/inactive).

SECURITY: Never log COREN numbers linked to names in plain text.
Audit log stores hashed identifiers only.
"""

import hashlib
import re
import unicodedata
from datetime import datetime, timezone
from typing import Optional

import httpx
from bs4 import BeautifulSoup

# ── COREN state website URLs ─────────────────────────────────────────────────

COREN_URLS = {
    "AC": "https://coren-ac.gov.br",
    "AL": "https://coren-al.gov.br",
    "AM": "https://coren-am.gov.br",
    "AP": "https://coren-ap.gov.br",
    "BA": "https://www.coren-ba.gov.br",
    "CE": "https://www.coren-ce.org.br",
    "DF": "https://www.coren-df.gov.br",
    "ES": "https://www.coren-es.org.br",
    "GO": "https://www.coren-go.org.br",
    "MA": "https://coren-ma.gov.br",
    "MG": "https://www.corenmg.gov.br",
    "MS": "https://www.coren-ms.gov.br",
    "MT": "https://www.coren-mt.gov.br",
    "PA": "https://www.corenpa.org.br",
    "PB": "https://coren-pb.gov.br",
    "PE": "https://www.coren-pe.gov.br",
    "PI": "https://coren-pi.gov.br",
    "PR": "https://www.corenpr.gov.br",
    "RJ": "https://www.coren-rj.org.br",
    "RN": "https://www.coren-rn.org.br",
    "RO": "https://www.coren-ro.org.br",
    "RR": "https://corenrr.gov.br",
    "RS": "https://www.portalcoren-rs.gov.br",
    "SC": "https://www.corensc.gov.br",
    "SE": "https://coren-se.gov.br",
    "SP": "https://portal.coren-sp.gov.br",
    "TO": "https://www.corentocantins.org.br",
}

# Category code mappings
CATEGORY_MAP = {
    "ENF": "nurse",
    "ENFERMEIRO": "nurse",
    "ENFERMEIRA": "nurse",
    "TE": "technician",
    "TEC": "technician",
    "TECNICO": "technician",
    "TÉCNICO": "technician",
    "TECNICA": "technician",
    "TÉCNICA": "technician",
    "AE": "nursing_assistant",
    "AUX": "nursing_assistant",
    "AUXILIAR": "nursing_assistant",
}

# Reverse map for display
CATEGORY_DISPLAY = {
    "nurse": "ENF",
    "technician": "TE",
    "nursing_assistant": "AE",
}

# ── Audit log (in-memory; production should use DB) ──────────────────────────

_lookup_log = []

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
}


def _hash_for_log(state: str, number: str) -> str:
    """Hash state+number for audit log without storing PII in plain text."""
    return hashlib.sha256(f"{state}:{number}".encode()).hexdigest()[:16]


def _normalize(text: str) -> str:
    """Strip accents and uppercase for comparison."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFD", text)
    return "".join(c for c in nfkd if unicodedata.category(c) != "Mn").upper().strip()


def _extract_category(text: str) -> Optional[str]:
    """Extract professional category from text."""
    text_upper = _normalize(text)
    for code, cat in CATEGORY_MAP.items():
        if code in text_upper:
            return cat
    return None


def _extract_status(text: str) -> Optional[str]:
    """Extract registration status from text."""
    text_upper = text.upper() if text else ""
    if re.search(r'\bATIV[OA]\b|\bREGULAR\b|\bACTIVE\b', text_upper):
        return "active"
    if re.search(r'\bINATIV|\bSUSPENS|\bCANCEL|\bINACTIVE\b', text_upper):
        return "inactive"
    return None


# ── State-specific lookup strategies ─────────────────────────────────────────
# Many COREN sites share common CMS patterns. We try multiple strategies
# per state, from most specific to most generic.

def _try_consultation_pages(client: httpx.Client, base_url: str,
                            state: str, coren_number: str) -> dict:
    """
    Try common COREN consultation page patterns.
    Many states use similar CMS with consultation endpoints.
    """
    result = {
        "name": None, "state": state, "category": None,
        "status": None, "source_url": None, "method": None,
    }

    # Common consultation URL patterns across COREN state sites
    consultation_paths = [
        f"/consulta-inscricao?numero={coren_number}",
        f"/consulta?inscricao={coren_number}",
        f"/pesquisar?numero={coren_number}",
        f"/consulta-publica?coren={coren_number}",
        f"/consulta/{coren_number}",
        f"/pesquisa-profissional?numero={coren_number}",
        f"/api/consulta/{coren_number}",
        f"/transparencia/consulta-inscricao?numero={coren_number}",
    ]

    for path in consultation_paths:
        url = f"{base_url}{path}"
        try:
            resp = client.get(url, headers=_HEADERS, timeout=12, follow_redirects=True)
            if resp.status_code != 200:
                continue

            content_type = resp.headers.get("content-type", "")

            # Try JSON response first (some sites have REST APIs)
            if "json" in content_type:
                try:
                    data = resp.json()
                    result["method"] = "api_json"
                    result["source_url"] = url
                    _parse_json_result(data, result)
                    if result["name"]:
                        return result
                except Exception:
                    pass

            # Parse HTML
            if "html" in content_type or not result["name"]:
                html = resp.text
                if len(html) < 200:
                    continue

                # Skip if it looks like a generic page (no COREN number in content)
                if coren_number not in html and len(html) < 5000:
                    continue

                result["method"] = "html_consultation"
                result["source_url"] = url
                _parse_html_result(html, coren_number, result)
                if result["name"]:
                    return result

        except (httpx.TimeoutException, httpx.ConnectError, httpx.HTTPError):
            continue

    return result


def _try_search_form(client: httpx.Client, base_url: str,
                     state: str, coren_number: str) -> dict:
    """
    Try POST-based search forms (some COREN sites require form submission).
    """
    result = {
        "name": None, "state": state, "category": None,
        "status": None, "source_url": None, "method": None,
    }

    search_endpoints = [
        "/consulta-inscricao",
        "/consulta",
        "/pesquisar",
        "/consulta-publica",
        "/pesquisa-profissional",
    ]

    form_data_variants = [
        {"numero": coren_number},
        {"inscricao": coren_number},
        {"coren": coren_number},
        {"numero_inscricao": coren_number},
        {"registro": coren_number},
    ]

    for endpoint in search_endpoints:
        for form_data in form_data_variants:
            url = f"{base_url}{endpoint}"
            try:
                resp = client.post(
                    url, data=form_data, headers=_HEADERS,
                    timeout=12, follow_redirects=True,
                )
                if resp.status_code != 200:
                    continue

                html = resp.text
                if len(html) < 200 or coren_number not in html:
                    continue

                result["method"] = "form_post"
                result["source_url"] = url
                _parse_html_result(html, coren_number, result)
                if result["name"]:
                    return result

            except (httpx.TimeoutException, httpx.ConnectError, httpx.HTTPError):
                continue

    return result


def _try_homepage_search(client: httpx.Client, base_url: str,
                         state: str, coren_number: str) -> dict:
    """
    Fetch homepage and look for embedded search/consultation links,
    then follow them.
    """
    result = {
        "name": None, "state": state, "category": None,
        "status": None, "source_url": None, "method": None,
    }

    try:
        resp = client.get(base_url, headers=_HEADERS, timeout=12, follow_redirects=True)
        if resp.status_code != 200:
            return result

        soup = BeautifulSoup(resp.text, "html.parser")

        # Find links with consultation-related text
        keywords = ["consult", "pesquis", "verific", "inscri", "profission"]
        for link in soup.find_all("a", href=True):
            text = (link.get_text() + " " + link.get("href", "")).lower()
            if any(kw in text for kw in keywords):
                href = link["href"]
                if not href.startswith("http"):
                    href = f"{base_url.rstrip('/')}/{href.lstrip('/')}"

                try:
                    # Try GET with number as parameter
                    sep = "&" if "?" in href else "?"
                    search_url = f"{href}{sep}numero={coren_number}"
                    sr = client.get(search_url, headers=_HEADERS,
                                    timeout=12, follow_redirects=True)
                    if sr.status_code == 200 and coren_number in sr.text:
                        result["method"] = "followed_link"
                        result["source_url"] = search_url
                        _parse_html_result(sr.text, coren_number, result)
                        if result["name"]:
                            return result
                except Exception:
                    continue

    except (httpx.TimeoutException, httpx.ConnectError, httpx.HTTPError):
        pass

    return result


# ── HTML/JSON parsing helpers ────────────────────────────────────────────────

def _parse_json_result(data: dict, result: dict):
    """Extract fields from JSON API response."""
    if isinstance(data, list) and data:
        data = data[0]
    if not isinstance(data, dict):
        return

    # Common JSON field names
    name_fields = ["nome", "name", "nome_completo", "nomeCompleto",
                   "nomeProfissional", "full_name"]
    cat_fields = ["categoria", "category", "tipo", "tipoInscricao",
                  "categoriaProfissional"]
    status_fields = ["situacao", "status", "situacaoInscricao",
                     "statusInscricao"]

    for f in name_fields:
        if data.get(f):
            result["name"] = str(data[f]).strip().title()
            break

    for f in cat_fields:
        if data.get(f):
            result["category"] = _extract_category(str(data[f]))
            break

    for f in status_fields:
        if data.get(f):
            result["status"] = _extract_status(str(data[f]))
            break


def _parse_html_result(html: str, coren_number: str, result: dict):
    """Extract professional details from HTML page."""
    soup = BeautifulSoup(html, "html.parser")

    # Strategy 1: Look for table rows with label/value pairs
    _parse_table_rows(soup, result)

    # Strategy 2: Look for labeled spans/divs
    if not result["name"]:
        _parse_labeled_elements(soup, html, result)

    # Strategy 3: Regex patterns on raw HTML
    if not result["name"]:
        _parse_with_regex(html, coren_number, result)


def _parse_table_rows(soup: BeautifulSoup, result: dict):
    """Parse table-based layouts (common in COREN sites)."""
    for row in soup.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue

        label = _normalize(cells[0].get_text())
        value = cells[1].get_text().strip()

        if not value:
            continue

        if any(kw in label for kw in ["NOME", "PROFISSIONAL", "INSCRITO"]):
            if len(value) > 3 and not value.isdigit():
                result["name"] = value.strip().title()

        elif any(kw in label for kw in ["CATEGORIA", "TIPO", "CLASSE"]):
            cat = _extract_category(value)
            if cat:
                result["category"] = cat

        elif any(kw in label for kw in ["SITUACAO", "STATUS", "SITUAÇÃO"]):
            status = _extract_status(value)
            if status:
                result["status"] = status


def _parse_labeled_elements(soup: BeautifulSoup, html: str, result: dict):
    """Parse label-value patterns in divs/spans."""
    # Look for elements with class patterns like "label", "campo", "field"
    for el in soup.find_all(["label", "span", "strong", "b", "dt"]):
        text = _normalize(el.get_text())
        if not text:
            continue

        # Get the next sibling or parent's next element as value
        value_el = el.find_next_sibling() or el.find_next()
        if not value_el:
            continue
        value = value_el.get_text().strip()

        if any(kw in text for kw in ["NOME", "PROFISSIONAL"]):
            if len(value) > 3 and not value.isdigit():
                result["name"] = value.strip().title()

        elif "CATEGORIA" in text or "TIPO" in text:
            cat = _extract_category(value)
            if cat:
                result["category"] = cat

        elif "SITUACAO" in text or "STATUS" in text or "SITUAÇÃO" in text:
            status = _extract_status(value)
            if status:
                result["status"] = status

    # Also check definition lists
    for dt in soup.find_all("dt"):
        dd = dt.find_next_sibling("dd")
        if not dd:
            continue
        label = _normalize(dt.get_text())
        value = dd.get_text().strip()

        if "NOME" in label and len(value) > 3:
            result["name"] = value.strip().title()
        elif "CATEGORIA" in label:
            cat = _extract_category(value)
            if cat:
                result["category"] = cat
        elif "SITUACAO" in label or "SITUAÇÃO" in label:
            status = _extract_status(value)
            if status:
                result["status"] = status


def _parse_with_regex(html: str, coren_number: str, result: dict):
    """Fallback: regex patterns for common COREN page formats."""

    # Pattern: "Nome: FULANO DE TAL" or "Nome Completo: ..."
    name_match = re.search(
        r'(?:Nome|Profissional|Inscrito)\s*(?:Completo)?\s*[:：]\s*'
        r'([A-ZÀ-Ú][A-ZÀ-Ú\s]{4,80})',
        html, re.IGNORECASE
    )
    if name_match:
        result["name"] = name_match.group(1).strip().title()

    # Pattern: "Categoria: ENF" or "Tipo Inscrição: Enfermeiro"
    cat_match = re.search(
        r'(?:Categoria|Tipo|Classe)\s*(?:de\s+Inscri[çc][aã]o)?\s*[:：]\s*'
        r'([A-ZÀ-Ú][a-zà-ú]*(?:\s+[a-zà-ú]+)?)',
        html, re.IGNORECASE
    )
    if cat_match:
        cat = _extract_category(cat_match.group(1))
        if cat:
            result["category"] = cat

    # Pattern: "Situação: Ativo" or "Status: Regular"
    status_match = re.search(
        r'(?:Situa[çc][aã]o|Status)\s*[:：]\s*([A-ZÀ-Úa-zà-ú]+)',
        html, re.IGNORECASE
    )
    if status_match:
        status = _extract_status(status_match.group(1))
        if status:
            result["status"] = status

    # Certificate-style pattern: "que NOME COMPLETO, inscri(ção/cao) n.º NNNN"
    cert_match = re.search(
        r'que\s+([A-ZÀ-Ú][A-ZÀ-Ú\s]{4,80}?),?\s*'
        r'(?:inscri[çc][aã]o|CPF|portador)',
        html, re.IGNORECASE
    )
    if cert_match and not result["name"]:
        result["name"] = cert_match.group(1).strip().title()


# ── Main lookup function ─────────────────────────────────────────────────────

def lookup_coren(state: str, coren_number: str) -> dict:
    """
    Look up a COREN registration on the official state website.

    Returns:
        {
            "success": bool,
            "name": str or None,      # Full name of registration owner
            "state": str,             # UF
            "category": str or None,  # "nurse", "technician", "nursing_assistant"
            "category_code": str,     # "ENF", "TE", "AE"
            "status": str or None,    # "active", "inactive"
            "source_url": str or None,
            "method": str or None,    # How the data was obtained
            "error": str or None,
            "requires_manual_check": bool,
        }
    """
    state = state.upper().strip()
    coren_number = coren_number.strip()

    # Validate inputs
    if state not in COREN_URLS:
        return {
            "success": False,
            "error": f"Estado '{state}' não suportado. Estados disponíveis: {', '.join(sorted(COREN_URLS.keys()))}",
            "requires_manual_check": True,
        }

    if not re.match(r'^\d{4,7}$', coren_number):
        return {
            "success": False,
            "error": "Número COREN deve ter entre 4 e 7 dígitos.",
            "requires_manual_check": True,
        }

    base_url = COREN_URLS[state]
    lookup_hash = _hash_for_log(state, coren_number)

    # Try multiple strategies in order of likelihood
    final_result = None

    try:
        with httpx.Client(verify=True) as client:
            # Strategy 1: Try common consultation URL patterns
            result = _try_consultation_pages(client, base_url, state, coren_number)
            if result.get("name"):
                final_result = result
            else:
                # Strategy 2: Try POST form submissions
                result = _try_search_form(client, base_url, state, coren_number)
                if result.get("name"):
                    final_result = result
                else:
                    # Strategy 3: Follow links from homepage
                    result = _try_homepage_search(client, base_url, state, coren_number)
                    if result.get("name"):
                        final_result = result

    except Exception as e:
        _log_lookup(lookup_hash, state, False, f"exception: {type(e).__name__}")
        return {
            "success": False,
            "state": state,
            "error": f"Erro ao consultar site do COREN-{state}: {str(e)}",
            "coren_site": base_url,
            "requires_manual_check": True,
            "hint": f"Verifique manualmente em {base_url}",
        }

    if final_result and final_result.get("name"):
        category_code = CATEGORY_DISPLAY.get(final_result.get("category"), "N/A")
        _log_lookup(lookup_hash, state, True, final_result.get("method"))

        return {
            "success": True,
            "name": final_result["name"],
            "state": state,
            "category": final_result.get("category"),
            "category_code": category_code,
            "status": final_result.get("status"),
            "source_url": final_result.get("source_url"),
            "method": final_result.get("method"),
            "error": None,
            "requires_manual_check": final_result.get("status") is None,
        }
    else:
        _log_lookup(lookup_hash, state, False, "no_data_found")
        return {
            "success": False,
            "state": state,
            "name": None,
            "category": None,
            "status": None,
            "error": (
                f"Não foi possível obter dados do COREN-{state} automaticamente. "
                f"O site pode estar fora do ar ou usar um formato não suportado."
            ),
            "coren_site": base_url,
            "requires_manual_check": True,
            "hint": f"Verifique manualmente em {base_url}",
        }


def _log_lookup(lookup_hash: str, state: str, success: bool, method: Optional[str]):
    """Audit log entry — no PII, only hashed identifier."""
    _lookup_log.append({
        "lookup_hash": lookup_hash,
        "state": state,
        "success": success,
        "method": method,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    # Keep log bounded
    if len(_lookup_log) > 500:
        _lookup_log[:] = _lookup_log[-500:]


def get_lookup_log() -> list:
    """Return audit log for compliance review."""
    return _lookup_log[-100:]