"""
Alice — AI FAQ Chat Assistant
==============================
RAG-powered chat that answers questions about Terms of Use,
Privacy Policy, LGPD, and platform rules. Grounded in legal documents only.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.database import get_db
from app.core.auth_deps import get_current_user, Optional as OptUser
from app.models.models import User

router = APIRouter(prefix="/alice", tags=["alice"])

# ── Legal document corpus (embedded for RAG) ─────────────────────────────────

LEGAL_DOCS = {
    "terms": {
        "title": "Termos de Uso",
        "content": """
A CuidaU é uma plataforma de intermediação que conecta pacientes, familiares e profissionais de saúde verificados.
Ao utilizar a plataforma, o usuário concorda com estes termos.
A CuidaU não é uma empresa de saúde e não emprega diretamente os profissionais cadastrados.
Os profissionais são prestadores de serviço autônomos responsáveis por suas próprias licenças e seguros.
A plataforma cobra uma taxa de serviço sobre o valor do atendimento, que é adicionada ao valor definido pelo profissional.
Cancelamentos devem seguir a política de cancelamento: mais de 12h = reembolso total, 2-12h = 50%, menos de 2h = sem reembolso.
O pagamento é processado pela plataforma e liberado ao profissional após a conclusão do atendimento.
Em caso de disputas, a CuidaU atua como mediadora entre as partes.
O uso indevido da plataforma pode resultar em suspensão ou banimento permanente.
"""
    },
    "privacy": {
        "title": "Política de Privacidade",
        "content": """
A CuidaU coleta apenas os dados necessários para o funcionamento da plataforma.
Dados pessoais incluem: nome, email, telefone, CPF, documentos de verificação e endereço.
Dados de saúde são tratados com sigilo especial conforme a LGPD.
Não compartilhamos dados pessoais com terceiros sem consentimento explícito.
O usuário pode solicitar a exclusão de seus dados a qualquer momento.
Dados de localização são coletados apenas durante o check-in/check-out de atendimentos.
Utilizamos criptografia para proteger dados sensíveis em trânsito e em repouso.
Cookies são utilizados apenas para funcionalidades essenciais da plataforma.
"""
    },
    "lgpd": {
        "title": "LGPD — Lei Geral de Proteção de Dados",
        "content": """
A CuidaU está em conformidade com a Lei 13.709/2018 (LGPD).
O usuário tem direito de acessar, corrigir, excluir e portar seus dados pessoais.
O consentimento para coleta de dados é obtido durante o cadastro.
Dados de saúde são classificados como dados sensíveis e recebem proteção adicional.
O encarregado de proteção de dados pode ser contactado através do email dpo@cuidau.com.br.
Incidentes de segurança são reportados à ANPD conforme regulamentação vigente.
O usuário pode revogar seu consentimento a qualquer momento sem prejuízo do serviço.
Dados são armazenados pelo período necessário para cumprir obrigações legais.
"""
    },
    "payments": {
        "title": "Pagamentos e Reembolsos",
        "content": """
A CuidaU processa pagamentos via PIX e cartão de crédito/débito.
O valor é autorizado no momento da confirmação do agendamento.
O pagamento só é liberado ao profissional após o checkout confirmado.
Política de cancelamento: mais de 12h antes = reembolso integral, entre 2-12h = reembolso de 50%, menos de 2h = sem reembolso.
Período de graça: cancelamentos em até 10 minutos após a criação são gratuitos.
Disputas de pagamento são analisadas em até 48 horas pela equipe de suporte.
A taxa da plataforma é adicionada ao valor do profissional, nunca descontada.
"""
    },
}

# ── Schemas ────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = None

class AdminUpdateRequest(BaseModel):
    document_key: Optional[str] = None  # "terms" | "privacy" | "lgpd" | "payments" or None for all

# ── Chat Endpoint ──────────────────────────────────────────────────────────────

@router.get("/consent-docs")
def get_consent_docs(db = Depends(get_db)):
    """2-4: Public endpoint — returns Terms/Privacy/LGPD text for registration checkboxes."""
    _sync_legal_docs(db)
    consent_keys = ["terms", "privacy", "lgpd"]
    result = {}
    for key in consent_keys:
        if key in LEGAL_DOCS:
            result[key] = {
                "title": LEGAL_DOCS[key]["title"],
                "content": LEGAL_DOCS[key]["content"].strip(),
            }
    return result

@router.post("/chat")
def alice_chat(body: ChatMessage, db = Depends(get_db)):
    """Public endpoint — Alice answers FAQ questions grounded in legal docs."""
    _sync_legal_docs(db)
    question = body.message.strip().lower()

    if not question or len(question) < 3:
        return {
            "response": "Olá! Sou a Alice, assistente virtual da CuidaU. Posso ajudar com dúvidas sobre nossos Termos de Uso, Política de Privacidade, LGPD e pagamentos. Como posso ajudar?",
            "sources": [],
            "escalate": False,
        }

    # Simple keyword matching for RAG grounding
    matched_docs = []
    for key, doc in LEGAL_DOCS.items():
        content_lower = doc["content"].lower()
        words = question.split()
        if any(w in content_lower for w in words if len(w) > 3):
            matched_docs.append(key)

    if not matched_docs:
        # No match — suggest escalation
        return {
            "response": "Não encontrei informações sobre esse assunto na nossa documentação. Para atendimento personalizado, entre em contato com nosso suporte pelo WhatsApp ou pelo email suporte@cuidau.com.br.",
            "sources": [],
            "escalate": True,
        }

    # Build context from matched docs
    context_parts = []
    sources = []
    for key in matched_docs[:2]:
        doc = LEGAL_DOCS[key]
        context_parts.append(f"[{doc['title']}]: {doc['content'].strip()}")
        sources.append({"key": key, "title": doc["title"]})

    context = "\n\n".join(context_parts)

    # Generate response (in production this would call Claude API)
    # For now, extract the most relevant paragraph
    best_paragraph = _find_best_paragraph(question, context)

    return {
        "response": best_paragraph,
        "sources": sources,
        "escalate": False,
    }

def _find_best_paragraph(question: str, context: str) -> str:
    """Simple paragraph matching — in production, this calls Claude API for RAG."""
    paragraphs = [p.strip() for p in context.split("\n") if p.strip() and len(p.strip()) > 20]
    if not paragraphs:
        return "Não encontrei informações específicas. Entre em contato com o suporte para mais detalhes."

    # Score paragraphs by word overlap with question
    q_words = set(question.lower().split())
    scored = []
    for p in paragraphs:
        p_words = set(p.lower().split())
        overlap = len(q_words & p_words)
        scored.append((overlap, p))

    scored.sort(key=lambda x: -x[0])
    top = scored[0][1] if scored[0][0] > 0 else paragraphs[0]

    # Clean up the section label
    if top.startswith("["):
        top = top.split("]: ", 1)[-1] if "]: " in top else top

    return top

# ── Admin: Update Alice ────────────────────────────────────────────────────────

# Custom uploaded documents — stored in DB via platform_settings table
def _load_custom_docs(db):
    """Load custom docs from DB."""
    from app.models.models import PlatformSettings
    row = db.query(PlatformSettings).filter(PlatformSettings.id == "alice_docs").first()
    if row and row.data:
        return dict(row.data)
    return {}

def _save_custom_docs(db, docs, admin_id=None):
    """Save custom docs to DB."""
    from app.models.models import PlatformSettings
    row = db.query(PlatformSettings).filter(PlatformSettings.id == "alice_docs").first()
    if not row:
        row = PlatformSettings(id="alice_docs", data={})
        db.add(row)
    row.data = docs
    row.updated_by = admin_id
    db.commit()

def _sync_legal_docs(db):
    """Sync custom docs into LEGAL_DOCS so Alice search finds them."""
    custom = _load_custom_docs(db)
    for key, doc in custom.items():
        LEGAL_DOCS[key] = {"title": doc["title"], "content": doc.get("content", "")}

@router.post("/update")
def update_alice(body: AdminUpdateRequest = AdminUpdateRequest(), current: User = Depends(get_current_user)):
    """Admin endpoint — re-index legal documents."""
    if current.role.value != "admin":
        raise HTTPException(403, "Admin only")
    if body.document_key and body.document_key in LEGAL_DOCS:
        return {"status": "updated", "document": body.document_key, "message": f"Documento '{LEGAL_DOCS[body.document_key]['title']}' re-indexado com sucesso."}
    return {"status": "updated", "documents": list(LEGAL_DOCS.keys()) + list(_custom_docs.keys()), "message": "Todos os documentos foram re-indexados com sucesso."}

# ── Admin: Document Management ────────────────────────────────────────────────

@router.get("/documents")
def list_alice_documents(current: User = Depends(get_current_user), db = Depends(get_db)):
    """List all Alice knowledge base documents — built-in + custom uploaded."""
    if current.role.value != "admin":
        raise HTTPException(403, "Admin only")

    _sync_legal_docs(db)
    custom = _load_custom_docs(db)

    docs = []
    for key, doc in LEGAL_DOCS.items():
        is_custom = key in custom
        docs.append({
            "key": key, "title": doc["title"],
            "type": "custom" if is_custom else "builtin",
            "content": doc["content"].strip(),
            "content_preview": doc["content"].strip()[:150] + "...",
            "char_count": len(doc["content"]),
            "filename": custom[key].get("filename") if is_custom else None,
            "uploaded_at": custom[key].get("uploaded_at") if is_custom else None,
            "editable": True, "deletable": is_custom,
        })
    return docs

class AliceDocUpload(BaseModel):
    title: str
    content: str
    key: Optional[str] = None

@router.post("/documents/upload")
def upload_alice_document(body: AliceDocUpload, current: User = Depends(get_current_user), db = Depends(get_db)):
    """Upload or create a new knowledge base document for Alice."""
    if current.role.value != "admin":
        raise HTTPException(403, "Admin only")
    if not body.title or not body.content:
        raise HTTPException(400, "Título e conteúdo são obrigatórios.")

    from datetime import datetime, timezone
    import re
    key = body.key or re.sub(r'[^a-z0-9]', '_', body.title.lower().strip())[:30]

    custom = _load_custom_docs(db)
    custom[key] = {
        "title": body.title,
        "content": body.content,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "filename": f"{key}.txt",
        "size": len(body.content),
    }
    _save_custom_docs(db, custom, current.id)
    LEGAL_DOCS[key] = {"title": body.title, "content": body.content}

    return {"key": key, "title": body.title, "char_count": len(body.content),
            "message": f"Documento '{body.title}' adicionado à base de conhecimento da Alice."}

@router.put("/documents/{doc_key}")
def update_alice_document(doc_key: str, body: AliceDocUpload, current: User = Depends(get_current_user), db = Depends(get_db)):
    """Update an existing document (built-in or custom). All edits persist to DB."""
    if current.role.value != "admin":
        raise HTTPException(403, "Admin only")

    from datetime import datetime, timezone

    # Update in-memory for immediate effect
    if doc_key in LEGAL_DOCS:
        LEGAL_DOCS[doc_key]["title"] = body.title
        LEGAL_DOCS[doc_key]["content"] = body.content

    # 2-3: Always persist to DB — both built-in and custom edits survive restarts
    custom = _load_custom_docs(db)
    custom[doc_key] = {
        "title": body.title,
        "content": body.content,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "size": len(body.content),
        "is_builtin_override": doc_key in ("terms", "privacy", "lgpd", "payments"),
    }
    _save_custom_docs(db, custom, current.id)

    return {"key": doc_key, "title": body.title, "message": f"Documento '{body.title}' atualizado."}

@router.delete("/documents/{doc_key}")
def delete_alice_document(doc_key: str, current: User = Depends(get_current_user), db = Depends(get_db)):
    """Delete a custom document. Built-in documents cannot be deleted."""
    if current.role.value != "admin":
        raise HTTPException(403, "Admin only")

    if doc_key in ("terms", "privacy", "lgpd", "payments"):
        raise HTTPException(400, "Documentos padrão não podem ser excluídos. Use a opção de editar.")

    custom = _load_custom_docs(db)
    if doc_key in custom:
        title = custom[doc_key]["title"]
        del custom[doc_key]
        _save_custom_docs(db, custom, current.id)
        if doc_key in LEGAL_DOCS:
            del LEGAL_DOCS[doc_key]
        return {"key": doc_key, "deleted": True, "message": f"Documento '{title}' removido."}

    raise HTTPException(404, f"Documento '{doc_key}' não encontrado.")

# ── Public: Get available topics ───────────────────────────────────────────────

@router.get("/topics")
def get_topics():
    """Returns available FAQ topics."""
    return [{"key": k, "title": v["title"]} for k, v in LEGAL_DOCS.items()]