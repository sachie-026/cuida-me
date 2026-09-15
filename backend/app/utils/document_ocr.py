"""
49a: Document Text Extraction + OCR
====================================
Extracts text from PDF documents (COREN cards, negative certificates).
Uses pdfplumber for digital PDFs. Falls back to regex patterns for structured data.
For scanned PDFs, Tesseract OCR can be added later as enhancement.
"""
import re
from typing import Optional

def extract_text_from_pdf_url(file_url: str) -> Optional[str]:
    """Download PDF from URL and extract text."""
    try:
        import httpx
        resp = httpx.get(file_url, timeout=15, follow_redirects=True)
        if resp.status_code != 200:
            return None
        return extract_text_from_bytes(resp.content)
    except Exception as e:
        print(f"[49a] PDF download failed: {e}")
        return None

def extract_text_from_bytes(pdf_bytes: bytes) -> Optional[str]:
    """Extract text from PDF bytes using pdfplumber."""
    try:
        import pdfplumber
        import io
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text_parts = []
            for page in pdf.pages[:5]:  # Max 5 pages
                text = page.extract_text()
                if text:
                    text_parts.append(text)
            return "\n".join(text_parts) if text_parts else None
    except Exception as e:
        print(f"[49a] pdfplumber extraction failed: {e}")
        return None

def extract_coren_data(text: str) -> dict:
    """Parse COREN document text to extract structured fields."""
    if not text:
        return {"name": None, "cpf": None, "coren_number": None, "category": None, "state": None, "status": None}

    result = {
        "name": None, "cpf": None, "coren_number": None,
        "category": None, "state": None, "status": None,
        "raw_text_length": len(text),
    }

    upper = text.upper()

    # Extract COREN registration number — must distinguish from certificate document number
    # Real format: "inscrição n.º 528594 - ENF" or "COREN-SP 123456"
    # NOT: "Número da Certidão: 18082.02611..." (that's the certificate ID)
    coren_patterns = [
        # "inscrição n.º 528594 - ENF" (most reliable — from COREN certificates)
        r'INSCRI[CÇ][AÃ]O\s+N\.?\s*[ºo°]?\s*(\d{4,})',
        # "COREN-SP 123456" or "COREN-SP: 123456"
        r'COREN[- ]?([A-Z]{2})\s*[:\-]?\s*(\d{4,})',
        # "Registro: 123456" or "Registro nº 123456"
        r'REGISTRO\s*N?\.?\s*[ºo°]?\s*[:\-]?\s*(\d{4,})',
        # Bare "Nº 123456" (less reliable, use last)
        r'(?<!CERTID[AÃ]O[:\s])N[ºo°]\s*(\d{4,})',
    ]
    for pattern in coren_patterns:
        m = re.search(pattern, upper)
        if m:
            groups = m.groups()
            if len(groups) == 2:
                result["state"] = groups[0]
                result["coren_number"] = groups[1]
            else:
                result["coren_number"] = groups[0]
            break

    # Extract category from "528594 - ENF" or "Enfermeiro" near the registration
    if result["coren_number"]:
        cat_after = re.search(result["coren_number"] + r'\s*[-–]\s*(ENF|TEC|AUX)', upper)
        if cat_after:
            cat_map_short = {"ENF": "nurse", "TEC": "technician", "AUX": "nursing_assistant"}
            result["category"] = cat_map_short.get(cat_after.group(1), None)

    # Extract state from "COREN-PR" header
    if not result["state"]:
        state_m = re.search(r'COREN[- ]?([A-Z]{2})', upper)
        if state_m:
            result["state"] = state_m.group(1)
        else:
            state_m2 = re.search(r'ESTADO\s*[:\-]?\s*([A-Z]{2})', upper)
            if state_m2:
                result["state"] = state_m2.group(1)

    # Extract validity: "Ativa" or "Ativo"
    if "ATIVA" in upper or "ATIVO" in upper:
        result["status"] = "active"
    elif "INATIVA" in upper or "INATIVO" in upper or "SUSPENSO" in upper or "CANCELADO" in upper:
        result["status"] = "inactive"

    # Extract CPF: "123.456.789-00"
    cpf_m = re.search(r'(\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2})', text)
    if cpf_m:
        result["cpf"] = cpf_m.group(1).replace(".", "").replace("-", "")

    # Extract name: line after "Nome:" or before CPF
    name_patterns = [
        r'NOME\s*[:\-]?\s*([A-ZÀ-Ú\s]{5,50})',
        r'PROFISSIONAL\s*[:\-]?\s*([A-ZÀ-Ú\s]{5,50})',
    ]
    for pattern in name_patterns:
        m = re.search(pattern, upper)
        if m:
            result["name"] = m.group(1).strip().title()
            break

    # Extract category
    cat_map = {
        "ENFERMEIRO": "nurse", "ENFERMEIRA": "nurse",
        "TÉCNICO": "technician", "TECNICO": "technician",
        "AUXILIAR": "nursing_assistant",
        "CUIDADOR": "caregiver", "CUIDADORA": "caregiver",
    }
    for keyword, role in cat_map.items():
        if keyword in upper:
            result["category"] = role
            break

    # Extract status
    if "ATIVO" in upper or "ACTIVE" in upper or "REGULAR" in upper:
        result["status"] = "active"
    elif "INATIVO" in upper or "SUSPENSO" in upper or "CANCELADO" in upper:
        result["status"] = "inactive"

    return result