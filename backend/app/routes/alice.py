"""
Alice — AI FAQ Chat Assistant
==============================
RAG-powered chat that answers questions about Terms of Use,
Privacy Policy, LGPD, and platform rules. Grounded in legal documents only.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
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

@router.post("/chat")
def alice_chat(body: ChatMessage):
    """Public endpoint — Alice answers FAQ questions grounded in legal docs."""
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

@router.post("/update")
def update_alice(body: AdminUpdateRequest = AdminUpdateRequest(), current: User = Depends(get_current_user)):
    """Admin endpoint — re-index legal documents (placeholder for real RAG pipeline)."""
    if current.role.value != "admin":
        raise HTTPException(403, "Admin only")

    if body.document_key and body.document_key in LEGAL_DOCS:
        return {"status": "updated", "document": body.document_key, "message": f"Documento '{LEGAL_DOCS[body.document_key]['title']}' re-indexado com sucesso."}

    return {"status": "updated", "documents": list(LEGAL_DOCS.keys()), "message": "Todos os documentos foram re-indexados com sucesso."}

# ── Public: Get available topics ───────────────────────────────────────────────

@router.get("/topics")
def get_topics():
    """Returns available FAQ topics."""
    return [{"key": k, "title": v["title"]} for k, v in LEGAL_DOCS.items()]