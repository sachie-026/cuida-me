import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, CalendarDays, DollarSign, ShieldCheck, Menu, LogOut, CheckCircle, XCircle, Ban, FileText, ExternalLink, CalendarRange, Trash2, Plus, Bot, Settings } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const useAdmin = () => {
  const token = localStorage.getItem("token");
  return { headers: { Authorization: `Bearer ${token}` } };
};

const DOC_LABELS = {
  photo_id:    "Documento com foto",
  diploma:     "Diploma/Certificado",
  criminal:    "Antecedentes criminais",
  selfie:      "Selfie com documento",
  vaccination: "Carteira de vacinação",
};

const DOC_STATUS_COLOR = {
  approved: "text-green-600",
  pending:  "text-amber-600",
  rejected: "text-red-600",
  replacement_requested: "text-orange-600",
};

const DOC_STATUS_PT = {
  approved: "Aprovado",
  pending: "Em análise",
  rejected: "Rejeitado",
  replacement_requested: "Reenvio solicitado",
};

const CATEGORY_PT = {
  nurse: "Enfermeiro(a)",
  technician: "Técnico(a) de Enfermagem",
  nursing_assistant: "Auxiliar de Enfermagem",
  caregiver: "Cuidador(a)",
};

/* ── Holidays Panel ── */
const SCOPE_LABELS = { national: "Nacional", state: "Estadual", municipal: "Municipal" };
const SCOPE_COLORS = { national: "bg-blue-100 text-blue-700", state: "bg-purple-100 text-purple-700", municipal: "bg-amber-100 text-amber-700" };

const HolidaysPanel = () => {
  const { headers } = useAdmin();
  const [holidays, setHolidays] = useState([]);
  const [yearView, setYearView] = useState(new Date().getFullYear());
  const [loading,  setLoading]  = useState(true);
  const [form, setForm] = useState({ date: "", name: "", scope: "national", state: "", city: "" });
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const loadHolidays = () => {
    setLoading(true);
    Promise.all([
      axios.get(`${API}/api/holidays/year/${yearView}`),
      axios.get(`${API}/api/holidays/admin/custom`, { headers }),
    ]).then(([yearRes, customRes]) => {
      const all = yearRes.data.map(h => ({
        ...h,
        deletable_id: customRes.data.find(c => c.date === h.date && c.name === h.name)?.id || null,
      }));
      setHolidays(all);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadHolidays(); }, [yearView]);

  const handleAdd = async () => {
    if (!form.date || !form.name) { toast.error("Data e nome são obrigatórios."); return; }
    if (form.scope === "state" && !form.state) { toast.error("Informe o estado."); return; }
    if (form.scope === "municipal" && (!form.state || !form.city)) { toast.error("Informe estado e cidade."); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/api/holidays/admin/custom`, form, { headers });
      toast.success("Feriado adicionado!");
      setForm({ date: "", name: "", scope: "national", state: "", city: "" });
      setShowForm(false);
      loadHolidays();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao adicionar feriado.");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/api/holidays/admin/custom/${id}`, { headers });
      toast.success("Feriado removido.");
      loadHolidays();
    } catch { toast.error("Erro ao remover."); }
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-navy text-lg">Feriados</h2>
          <p className="text-xs text-slate-500 mt-0.5">Feriados nacionais são automáticos. Adicione feriados estaduais ou municipais abaixo.</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={15} /> Adicionar feriado
        </button>
      </div>
      {showForm && (
        <div className="card p-5 mb-6 border border-blue-200 bg-blue-50/40">
          <p className="font-semibold text-navy text-sm mb-4">Novo feriado personalizado</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div><label className="form-label">Data</label><input type="date" className="form-input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div><label className="form-label">Nome</label><input type="text" className="form-input" placeholder="Ex: Aniversário da cidade" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label className="form-label">Abrangência</label>
              <select className="form-input" value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value, state: "", city: "" }))}>
                <option value="national">Nacional</option><option value="state">Estadual</option><option value="municipal">Municipal</option>
              </select>
            </div>
            {(form.scope === "state" || form.scope === "municipal") && (
              <div><label className="form-label">Estado (sigla)</label><input type="text" className="form-input" placeholder="Ex: SP" maxLength={2} value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))} /></div>
            )}
            {form.scope === "municipal" && (
              <div className="sm:col-span-2"><label className="form-label">Cidade</label><input type="text" className="form-input" placeholder="Ex: São Paulo" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving} className="btn-primary text-sm flex items-center gap-2"><Plus size={14} /> {saving ? "Salvando..." : "Salvar feriado"}</button>
            <button onClick={() => setShowForm(false)} className="btn-outline text-sm">Cancelar</button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => setYearView(y => y - 1)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><CalendarDays size={16} className="text-slate-500" /></button>
        <span className="font-bold text-navy">{yearView}</span>
        <button onClick={() => setYearView(y => y + 1)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><CalendarDays size={16} className="text-slate-500" /></button>
        <span className="text-xs text-slate-400 ml-1">{holidays.length} feriados</span>
      </div>
      {loading ? (
        <p className="text-slate-400 text-sm text-center py-8">Carregando...</p>
      ) : holidays.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-8">Nenhum feriado encontrado para {yearView}.</p>
      ) : (
        <div className="space-y-2">
          {holidays.map((h, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 hover:border-slate-200 transition-colors">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 w-20 flex-shrink-0">{new Date(h.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
                <div>
                  <p className="text-sm font-semibold text-navy">{h.name}</p>
                  {(h.state || h.city) && <p className="text-xs text-slate-400">{[h.city, h.state].filter(Boolean).join(" · ")}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SCOPE_COLORS[h.scope] || "bg-slate-100 text-slate-500"}`}>{SCOPE_LABELS[h.scope] || h.scope}</span>
                {h.deletable_id ? (
                  <button onClick={() => handleDelete(h.deletable_id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                ) : (
                  <span className="text-xs text-slate-300 px-2">automático</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Sidebar ── */
const Sidebar = ({ active, onNav, mobileOpen, setMobileOpen }) => {
  const navigate = useNavigate();
  const links = [
    { key: "overview",      label: "Visão geral",   icon: <DollarSign size={18} /> },
    { key: "professionals", label: "Verificação de Perfil", icon: <ShieldCheck size={18} /> },
    { key: "users",         label: "Usuários",      icon: <Users size={18} /> },
    { key: "bookings",      label: "Agendamentos",  icon: <CalendarDays size={18} /> },
    { key: "holidays",      label: "Feriados",      icon: <CalendarRange size={18} /> },
    { key: "reports",       label: "Denúncias",     icon: <FileText size={18} /> },
    { key: "alice",          label: "Alice IA",       icon: <Bot size={18} /> },
    { key: "validation",     label: "Validação COREN", icon: <ShieldCheck size={18} /> },
    { key: "legal_docs",     label: "Docs Legais",     icon: <FileText size={18} /> },
    { key: "settings",       label: "Configurações",   icon: <Settings size={18} /> },
  ];

  const content = (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-slate-100">
        <Logo size="sm" />
        <span className="text-xs font-semibold text-slate-400 mt-1 block">Admin Panel</span>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {links.map(l => (
          <button key={l.key} onClick={() => {
            if (l.key === "settings") { window.location.href = "/admin/settings"; return; }
            onNav(l.key); setMobileOpen(false);
          }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
              ${active === l.key ? "bg-blue-500 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            {l.icon} {l.label}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-100">
        <button onClick={() => { localStorage.clear(); navigate("/login"); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
          <LogOut size={18} /> Sair
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:flex w-56 flex-col bg-white border-r border-slate-100 h-screen sticky top-0">
        {content}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-56 bg-white shadow-xl">{content}</aside>
        </div>
      )}
    </>
  );
};

/* ── Overview ── */
const Overview = () => {
  const { headers } = useAdmin();
  const [stats, setStats] = useState(null);
  useEffect(() => {
    axios.get(`${API}/api/admin/stats`, { headers }).then(r => setStats(r.data)).catch(() => {});
  }, []);
  if (!stats) return <p className="text-slate-400 text-sm">Carregando...</p>;
  const cards = [
    { label: "Total usuários",      value: stats.total_users,         bg: "bg-blue-100",  icon: <Users size={20} className="text-blue-500" /> },
    { label: "Clientes",            value: stats.total_clients,       bg: "bg-green-100", icon: <Users size={20} className="text-green-500" /> },
    { label: "Profissionais",       value: stats.total_professionals, bg: "bg-blue-100",  icon: <ShieldCheck size={20} className="text-blue-500" /> },
    { label: "Enfermeiros",          value: stats.total_nurses || 0,   bg: "bg-blue-50",   icon: <ShieldCheck size={18} className="text-blue-400" /> },
    { label: "Técnicos",            value: stats.total_technicians || 0, bg: "bg-blue-50", icon: <ShieldCheck size={18} className="text-blue-400" /> },
    { label: "Auxiliares",           value: stats.total_nursing_assistants || 0, bg: "bg-blue-50", icon: <ShieldCheck size={18} className="text-blue-400" /> },
    { label: "Cuidadores",          value: stats.total_caregivers || 0, bg: "bg-blue-50",  icon: <ShieldCheck size={18} className="text-blue-400" /> },
    { label: "Aguardando aprovação",value: stats.pending_approvals,   bg: "bg-amber-100", icon: <ShieldCheck size={20} className="text-amber-500" /> },
    { label: "Agendamentos",        value: stats.total_bookings,      bg: "bg-blue-100",  icon: <CalendarDays size={20} className="text-blue-500" /> },
    { label: "Receita (comissão)",  value: `R$${Number(stats.total_revenue).toFixed(2)}`, bg: "bg-green-100", icon: <DollarSign size={20} className="text-green-500" /> },
  ];
  return (
    <div>
      <h2 className="font-display text-xl font-bold text-navy mb-6">Visão geral</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c, i) => (
          <div key={i} className="card p-5">
            <div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center mb-3`}>{c.icon}</div>
            <p className="text-xs text-slate-500 mb-1">{c.label}</p>
            <p className="font-display text-2xl font-bold text-navy">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── COREN Links ── */
const COREN_URLS = {
  AC:"https://coren-ac.gov.br",AL:"https://coren-al.gov.br",AP:"https://coren-ap.gov.br",
  AM:"https://coren-am.gov.br",BA:"https://www.coren-ba.gov.br",CE:"https://www.coren-ce.org.br",
  DF:"https://www.coren-df.gov.br",ES:"https://www.coren-es.org.br",GO:"https://www.coren-go.org.br",
  MA:"https://coren-ma.gov.br",MT:"https://www.coren-mt.gov.br",MS:"https://www.coren-ms.gov.br",
  MG:"https://www.corenmg.gov.br",PA:"https://www.corenpa.org.br",PB:"https://coren-pb.gov.br",
  PR:"https://www.corenpr.gov.br",PE:"https://www.coren-pe.gov.br",PI:"https://coren-pi.gov.br",
  RJ:"https://www.coren-rj.org.br",RN:"https://www.coren-rn.org.br",RS:"https://www.portalcoren-rs.gov.br",
  RO:"https://www.coren-ro.org.br",RR:"https://corenrr.gov.br",SC:"https://www.corensc.gov.br",
  SP:"https://portal.coren-sp.gov.br",SE:"https://coren-se.gov.br",TO:"https://www.corentocantins.org.br",
};
/* ── Doc Image Preview with Zoom/Rotate ── */
const DocImagePreview = ({ url }) => {
  const [rotation, setRotation] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  return (
    <div className="mt-2 relative">
      <div className={`overflow-hidden rounded-lg border border-slate-200 bg-slate-100 ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
        onClick={() => setZoomed(!zoomed)}>
        <img src={url} alt="Documento" className={`w-full transition-all duration-300 ${zoomed ? "max-h-[500px] object-contain" : "max-h-[120px] object-cover"}`}
          style={{ transform: `rotate(${rotation}deg)` }} />
      </div>
      <div className="flex gap-1 mt-1">
        <button onClick={() => setRotation(r => r - 90)} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-500">↺ Girar</button>
        <button onClick={() => setRotation(r => r + 90)} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-500">↻ Girar</button>
        <button onClick={() => setZoomed(!zoomed)} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-500">{zoomed ? "🔍− Reduzir" : "🔍+ Ampliar"}</button>
      </div>
    </div>
  );
};

/* ── Document Viewer Modal ── */
const DocModal = ({ prof, onClose, onDocUpdate }) => {
  const { headers } = useAdmin();
  const [rejectingId, setRejectingId] = useState(null);
  const [resendingId, setResendingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [adminFeedback, setAdminFeedback] = useState("");
  const [resendFeedback, setResendFeedback] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [rejectTemplates, setRejectTemplates] = useState([]);
  const [resendTemplates, setResendTemplates] = useState([]);

  useEffect(() => {
    axios.get(`${API}/api/settings/verification-templates`, { headers })
      .then(r => {
        setRejectTemplates(r.data.reject_templates || []);
        setResendTemplates(r.data.resend_templates || []);
      }).catch(() => {
        setRejectTemplates(["Documento ilegível","Documento expirado","Nome não corresponde","CPF não corresponde","Número COREN não corresponde","Documento obrigatório ausente","Informação adicional necessária"]);
        setResendTemplates(["Envie uma foto mais legível","O documento enviado pertence a outra pessoa","Documento expirado, envie versão atualizada"]);
      });
  }, []);
  const [qrInput, setQrInput] = useState("");
  const [qrResult, setQrResult] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [auditHistory, setAuditHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [generalMsg, setGeneralMsg] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  const loadAuditHistory = async (userId) => {
    try {
      const { data } = await axios.get(`${API}/api/admin/users/${userId}/document-audit-history`, { headers });
      setAuditHistory(data);
      setShowHistory(true);
    } catch { toast.error("Erro ao carregar histórico."); }
  };

  const handleQrVerify = async () => {
    if (!qrInput.trim()) return;
    setQrLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/admin/coren-verify`, {
        qr_data: qrInput,
        state: corenState || null,
      }, { headers });
      setQrResult(data);
      if (data.auto_verify) toast.success("COREN ativo verificado!");
      else if (data.name_warning) toast.error("⚠️ Nome divergente! Verifique antes de aprovar.");
      else toast(data.message, { icon: "ℹ️" });
    } catch { toast.error("Erro na verificação."); }
    finally { setQrLoading(false); }
  };

  const handleApprove = async (docId) => {
    // #27: Check if QR verification returned inactive COREN
    if (qrResult && !qrResult.auto_verify && qrResult.extracted?.status && qrResult.extracted.status !== "active") {
      toast.error("Não é possível aprovar: registro COREN não está Ativo.");
      return;
    }
    // Block approval on COREN name mismatch
    if (qrResult && qrResult.name_match === false) {
      toast.error("⚠️ Não é possível aprovar: nome no COREN não corresponde ao cadastro.");
      return;
    }
    setActionLoading(docId);
    try {
      await axios.patch(`${API}/api/admin/documents/${docId}/approve`, {}, { headers });
      toast.success("Documento aprovado!");
      onDocUpdate();
    } catch { toast.error("Erro ao aprovar."); }
    finally { setActionLoading(null); }
  };

  const handleReject = async (docId) => {
    if (!rejectReason.trim()) { toast.error("Selecione o motivo da rejeição."); return; }
    if (!adminFeedback.trim()) { toast.error("A mensagem para o profissional é obrigatória."); return; }
    setActionLoading(docId);
    try {
      const fb = adminFeedback.trim() || rejectReason;
      await axios.patch(`${API}/api/admin/documents/${docId}/reject?reason=${encodeURIComponent(rejectReason)}&feedback=${encodeURIComponent(fb)}`, {}, { headers });
      toast.success("Documento rejeitado.");
      setRejectingId(null); setRejectReason(""); setAdminFeedback("");
      onDocUpdate();
    } catch { toast.error("Erro ao rejeitar."); }
    finally { setActionLoading(null); }
  };

  const corenState = prof.council_state?.toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-hover w-full max-w-lg max-h-[85vh] overflow-y-auto z-10 p-6">
        <h3 className="font-display text-lg font-bold text-navy mb-1">{prof.full_name}</h3>
        <p className="text-xs text-slate-500 mb-3">{prof.email} · {prof.council_type} {prof.council_number}-{corenState}</p>

        {/* COREN verification links */}
        <div className="flex flex-wrap gap-2 mb-4">
          {corenState && COREN_URLS[corenState] && (
            <a href={COREN_URLS[corenState]} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold text-green-600 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors">
              <ExternalLink size={12} /> Verificar no COREN-{corenState}
            </a>
          )}
        </div>

        {(!prof.documents || prof.documents.length === 0) ? (
          <div className="text-center py-8 text-slate-400">
            <FileText size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhum documento enviado ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {prof.documents.map((doc, i) => (
              <div key={i} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-navy">{DOC_LABELS[doc.doc_type] || doc.doc_type}</p>
                    <p className={`text-xs font-medium mt-0.5 ${DOC_STATUS_COLOR[doc.status] || "text-slate-500"}`}>
                      {doc.status === "approved" ? "✓ Aprovado" : doc.status === "pending" ? "⏳ Em análise" : doc.status === "replacement_requested" ? "↻ Reenvio solicitado" : "✕ Rejeitado"}
                    </p>
                    {doc.rejection_reason && doc.status === "rejected" && (
                      <p className="text-xs text-red-500 mt-0.5">Motivo: {doc.rejection_reason}</p>
                    )}
                  </div>
                  {doc.file_url && !doc.file_url.includes("placeholder.com") && (
                    <div className="flex items-center gap-1.5">
                      {/* 10.1-11: Download button */}
                      <button onClick={async()=>{
                        try{
                          const{data}=await axios.get(`${API}/api/admin/documents/${doc.id}/download`,{headers});
                          if(data.file_exists===false){
                            toast.error(data.error||"Arquivo não encontrado no Cloudinary. Solicite reenvio.");
                          } else {
                            window.open(data.file_url,"_blank");
                          }
                        }catch{toast.error("Erro ao baixar documento.");}
                      }}
                        className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors">
                        <ExternalLink size={11} /> Abrir/Baixar
                      </button>
                    </div>
                  )}
                </div>
                {/* Inline image preview */}
                {doc.file_url && !doc.file_url.includes("placeholder.com") && /\.(jpg|jpeg|png|webp)/i.test(doc.file_url) && (
                  <DocImagePreview url={doc.file_url} />
                )}
                {/* Approve/Reject/Replace actions */}
                {doc.status !== "approved" && doc.file_url && !doc.file_url.includes("placeholder.com") && (
                  <div className="mt-2 pt-2 border-t border-slate-200">
                    {rejectingId === doc.id ? (
                      <div className="space-y-2">
                        {/* 10.1-18: Rejection reasons dropdown */}
                        <select className="form-input text-sm w-full" value={rejectReason} onChange={e => setRejectReason(e.target.value)}>
                          <option value="">Selecione o motivo...</option>
                          {rejectTemplates.map(r=>(
                            <option key={r} value={r}>{r}</option>
                          ))}
                          <option value="Outro">Outro</option>
                        </select>
                        {/* 2-1: Free-text feedback for the user */}
                        <textarea className="form-input text-xs w-full min-h-[60px]" placeholder="Mensagem para o profissional (ex: 'Envie foto mais legível do COREN')"
                          value={adminFeedback} onChange={e => setAdminFeedback(e.target.value)} />
                        <div className="flex gap-2">
                          <button onClick={() => handleReject(doc.id)} disabled={actionLoading === doc.id}
                            className="text-xs px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 font-semibold disabled:opacity-50">
                            {actionLoading === doc.id ? "..." : "Confirmar rejeição"}
                          </button>
                          <button onClick={() => { setRejectingId(null); setRejectReason(""); setAdminFeedback(""); }}
                            className="text-xs px-3 py-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 font-semibold">Cancelar</button>
                        </div>
                      </div>
                    ) : resendingId === doc.id ? (
                      /* 2-2: Request resend with custom feedback */
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1 mb-1">
                          {resendTemplates.map(t => (
                            <button key={t} type="button" onClick={() => setResendFeedback(t)}
                              className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full hover:bg-amber-100 border border-amber-200">{t}</button>
                          ))}
                        </div>
                        <textarea className="form-input text-xs w-full min-h-[60px]" placeholder="Mensagem obrigatória para o profissional"
                          value={resendFeedback} onChange={e => setResendFeedback(e.target.value)} />
                        <div className="flex gap-2">
                          <button onClick={async () => {
                            if (!resendFeedback.trim()) { toast.error("A mensagem para o profissional é obrigatória."); return; }
                            const fb = resendFeedback.trim();
                            try {
                              await axios.patch(`${API}/api/admin/documents/${doc.id}/status?status=replacement_requested&reason=${encodeURIComponent(fb)}&feedback=${encodeURIComponent(fb)}`, {}, { headers });
                              toast.success("Reenvio solicitado!");
                              setResendingId(null); setResendFeedback("");
                              onDocUpdate();
                            } catch { toast.error("Erro."); }
                          }} className="text-xs px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-semibold">
                            Confirmar pedido de reenvio
                          </button>
                          <button onClick={() => { setResendingId(null); setResendFeedback(""); }}
                            className="text-xs px-3 py-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 font-semibold">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleApprove(doc.id)} disabled={actionLoading === doc.id}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 font-semibold disabled:opacity-50">
                          <CheckCircle size={12} /> Aprovar
                        </button>
                        <button onClick={() => setRejectingId(doc.id)}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-semibold">
                          <XCircle size={12} /> Rejeitar
                        </button>
                        {/* 10.1-15: Request replacement — opens feedback form */}
                        <button onClick={() => { setResendingId(doc.id); setRejectingId(null); }}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 font-semibold">
                          ⟳ Solicitar reenvio
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {doc.status === "approved" && (
                  <div className="mt-2 pt-2 border-t border-slate-200 flex gap-2">
                    <button onClick={() => setRejectingId(doc.id)}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-semibold">
                      <XCircle size={12} /> Revogar aprovação
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* COREN Verification — QR, URL, or direct number */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Verificação COREN</p>
          <div className="flex gap-2 mb-2">
            <input type="text" className="form-input text-xs flex-1" placeholder="Número COREN, URL do QR code, ou texto do certificado..."
              value={qrInput} onChange={e => setQrInput(e.target.value)} />
            {/* State selector — shown when input looks like a bare number */}
            {/^\d{4,7}$/.test(qrInput.trim()) && (
              <select className="form-input text-xs w-20" value={corenState || ""}
                onChange={e => {/* state comes from prof, no setter needed */}}>
                <option value={corenState || ""}>{corenState || "UF"}</option>
              </select>
            )}
            <button onClick={handleQrVerify} disabled={qrLoading || !qrInput.trim()}
              className="btn-primary text-xs px-3 disabled:opacity-50">
              {qrLoading ? "..." : "Verificar"}
            </button>
          </div>
          {qrResult && (
            <div className={`p-3 rounded-lg text-xs space-y-2 ${qrResult.auto_verify ? "bg-green-50 border border-green-200" : qrResult.name_warning ? "bg-red-50 border border-red-200" : qrResult.matched ? "bg-blue-50 border border-blue-200" : "bg-amber-50 border border-amber-200"}`}>
              <p className={qrResult.name_warning ? "text-red-700 font-semibold" : qrResult.auto_verify ? "text-green-700" : "text-slate-700"}>
                {qrResult.message}
              </p>
              {qrResult.extracted?.coren_number && (
                <span className="block font-mono text-slate-600">
                  COREN: {qrResult.extracted.coren_number}{qrResult.extracted.state ? `-${qrResult.extracted.state}` : ""}
                  {qrResult.extracted.category && ` · ${CATEGORY_PT[qrResult.extracted.category] || qrResult.extracted.category}`}
                  {qrResult.extracted.status && ` · ${qrResult.extracted.status === "active" ? "✓ Ativo" : "✕ Inativo"}`}
                </span>
              )}
              {/* Side-by-side name comparison — the critical fraud prevention feature */}
              {qrResult.matched && (qrResult.extracted_name || qrResult.extracted?.name) && (
                <div className="mt-2 p-2 rounded-lg bg-white border border-slate-200">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Comparação de nomes</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-slate-400">Nome no COREN</p>
                      <p className={`text-xs font-semibold ${qrResult.name_match ? "text-green-700" : "text-red-700"}`}>
                        {qrResult.extracted_name || qrResult.extracted?.name || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">Nome no cadastro</p>
                      <p className={`text-xs font-semibold ${qrResult.name_match ? "text-green-700" : "text-red-700"}`}>
                        {qrResult.profile_name || "—"}
                      </p>
                    </div>
                  </div>
                  {qrResult.name_match === false && (
                    <p className="mt-1 text-[11px] text-red-600 font-semibold">⚠️ NOMES NÃO CORRESPONDEM — Verifique antes de aprovar!</p>
                  )}
                  {qrResult.name_match === true && (
                    <p className="mt-1 text-[11px] text-green-600">✓ Nomes correspondem</p>
                  )}
                </div>
              )}
              {/* Show when COREN lookup failed — manual check needed */}
              {qrResult.extracted?.fetch_error && (
                <p className="text-amber-600 text-[11px]">⚠️ {qrResult.extracted.fetch_error}</p>
              )}
              {qrResult.extracted?.coren_source && (
                <a href={qrResult.extracted.coren_source} target="_blank" rel="noreferrer"
                  className="text-blue-600 hover:underline text-[11px]">
                  🔗 Fonte: {qrResult.extracted.coren_source}
                </a>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {prof.documents?.filter(d => d.status === "approved").length || 0} de 4 documentos aprovados
            {prof.documents?.filter(d => d.status === "approved").length >= 4 && " ✓ Profissional auto-aprovado"}
          </span>
          <div className="flex gap-2">
            <button onClick={() => loadAuditHistory(prof.user_id)} className="btn-outline text-xs px-3">📋 Histórico</button>
            <button onClick={onClose} className="btn-outline text-xs px-4">Fechar</button>
          </div>
        </div>

        {/* 2-5: Verification complete button — shown when all docs approved */}
        {prof.documents?.filter(d => d.status === "approved").length >= 4 && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-sm font-semibold text-green-700 mb-2">✅ Todos os documentos aprovados</p>
            <p className="text-xs text-green-600 mb-3">Clique abaixo para concluir a verificação. O profissional receberá uma notificação e poderá usar o app.</p>
            <button onClick={async () => {
              try {
                const { data } = await axios.post(`${API}/api/admin/professionals/${prof.id}/complete-verification`, {}, { headers });
                toast.success(data.message || "Verificação concluída!");
                onDocUpdate();
              } catch (err) { toast.error(err.response?.data?.detail || "Erro ao concluir verificação."); }
            }} className="btn-primary w-full text-sm">
              🎉 Concluir verificação e notificar profissional
            </button>
          </div>
        )}

        {/* C4: General message box — not tied to a specific document */}
        <div className="mt-4 card p-4 border-2 border-blue-100">
          <p className="font-semibold text-navy text-sm mb-2">💬 Enviar mensagem ao profissional</p>
          <div className="flex flex-wrap gap-1 mb-2">
            {resendTemplates.map(t => (
              <button key={t} type="button" onClick={() => setGeneralMsg(t)}
                className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 border border-blue-200">{t}</button>
            ))}
          </div>
          <textarea className="form-input text-xs w-full min-h-[60px] mb-2" placeholder="Escreva uma mensagem..."
            value={generalMsg} onChange={e => setGeneralMsg(e.target.value)} />
          {generalMsg.trim() && (
            <div className="p-2 bg-slate-50 rounded-lg mb-2">
              <p className="text-[10px] text-slate-400 mb-0.5">Pré-visualização:</p>
              <p className="text-xs text-slate-600">Olá {prof.full_name?.split(" ")[0] || "Profissional"}, {generalMsg}</p>
            </div>
          )}
          <button onClick={async () => {
            if (!generalMsg.trim()) { toast.error("Escreva uma mensagem."); return; }
            setSendingMsg(true);
            try {
              const fullMsg = `Olá ${prof.full_name?.split(" ")[0] || "Profissional"}, ${generalMsg}`;
              await axios.post(`${API}/api/admin/send-message`, {
                user_id: prof.user_id, message: fullMsg, title: "Mensagem da equipe CuidaU",
              }, { headers });
              toast.success("Mensagem enviada!");
              setGeneralMsg("");
            } catch (err) { toast.error(err.response?.data?.detail || "Erro ao enviar."); }
            finally { setSendingMsg(false); }
          }} disabled={sendingMsg || !generalMsg.trim()} className="btn-primary w-full text-sm disabled:opacity-50">
            {sendingMsg ? "Enviando..." : "Enviar mensagem"}
          </button>
        </div>

        {/* Audit history */}
        {showHistory && (
          <div className="mt-3 max-h-[200px] overflow-y-auto border-t border-slate-200 pt-3">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Histórico de verificação</p>
            {auditHistory.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhuma ação registrada.</p>
            ) : (
              <div className="space-y-1">
                {auditHistory.map(h => (
                  <div key={h.id} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg text-xs">
                    <span className={`font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
                      h.action === "approved" ? "bg-green-100 text-green-700" :
                      h.action === "rejected" ? "bg-red-100 text-red-600" :
                      "bg-amber-100 text-amber-700"}`}>{h.action}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-600">{h.doc_type} — por {h.admin_name}</p>
                      {h.feedback && <p className="text-slate-500 italic truncate">"{h.feedback}"</p>}
                      {/* Delivery channel status */}
                      {h.reason && h.reason.includes("email:") && (
                        <div className="flex gap-2 mt-0.5">
                          {h.reason.split(" ").map((ch, ci) => {
                            const [name, status] = ch.split(":");
                            const color = status === "sent" ? "text-green-600" : status === "failed" ? "text-red-500" : "text-slate-400";
                            const label = name === "email" ? "📧" : name === "whatsapp" ? "📱" : name === "in_app" ? "🔔" : "";
                            return label ? <span key={ci} className={`text-[10px] ${color}`}>{label} {status}</span> : null;
                          })}
                        </div>
                      )}
                      <p className="text-slate-400 text-[10px]">{h.created_at ? new Date(h.created_at).toLocaleString("pt-BR") : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Professionals Panel ── */
const ProfessionalsPanel = () => {
  const { headers } = useAdmin();
  const [list,       setList]       = useState([]);
  const [filter,     setFilter]     = useState("pending");
  const [viewMode,   setViewMode]   = useState("professionals"); // professionals | clients
  const [clientList,  setClientList] = useState([]);
  const [clientFilter, setClientFilter] = useState("pending");
  const [viewingDoc, setViewingDoc] = useState(null);
  const [checklist,  setChecklist]  = useState(null);
  const [unifiedProfile, setUnifiedProfile] = useState(null);
  const [verifyAction, setVerifyAction] = useState(null);
  const [pendingProCount, setPendingProCount] = useState(0);
  const [pendingClientCount, setPendingClientCount] = useState(0);

  const loadProfessionals = () => {
    axios.get(`${API}/api/admin/professionals?status=${filter}`, { headers })
      .then(r => setList(r.data)).catch(() => {});
  };

  const loadClients = () => {
    axios.get(`${API}/api/admin/clients?status=${clientFilter}`, { headers })
      .then(r => setClientList(r.data)).catch(() => {});
  };

  // Load pending counts for tab badges (independent of current filter)
  const loadPendingCounts = () => {
    axios.get(`${API}/api/admin/professionals?status=pending`, { headers })
      .then(r => setPendingProCount(r.data.length)).catch(() => {});
    axios.get(`${API}/api/admin/clients?status=pending`, { headers })
      .then(r => setPendingClientCount(r.data.length)).catch(() => {});
  };

  useEffect(() => { loadProfessionals(); }, [filter]);
  useEffect(() => { if (viewMode === "clients") loadClients(); }, [clientFilter, viewMode]);
  useEffect(() => { loadPendingCounts(); }, []);

  const approve = async (id) => {
    await axios.patch(`${API}/api/admin/professionals/${id}/approve`, {}, { headers });
    loadProfessionals();
    toast.success("Profissional aprovado!");
  };

  const reject = async (id) => {
    await axios.patch(`${API}/api/admin/professionals/${id}/reject`, {}, { headers });
    loadProfessionals();
    toast("Profissional rejeitado.", { icon: "❌" });
  };

  // 10.1-17: Load approval checklist
  const loadChecklist = async (profId) => {
    try {
      const { data } = await axios.get(`${API}/api/admin/professionals/${profId}/approval-checklist`, { headers });
      setChecklist(data);
    } catch { toast.error("Erro ao carregar checklist."); }
  };

  // 10.3-28: Load unified profile
  const loadUnifiedProfile = async (userId) => {
    try {
      const { data } = await axios.get(`${API}/api/admin/users/${userId}/unified-profile`, { headers });
      setUnifiedProfile(data);
    } catch { toast.error("Erro ao carregar perfil."); }
  };

  // 10.1-16: Professional verification action
  const handleVerificationAction = async (profId, action, reason = "") => {
    try {
      const { data } = await axios.patch(`${API}/api/admin/professionals/${profId}/verification-action?action=${action}&reason=${encodeURIComponent(reason)}`, {}, { headers });
      toast.success(data.message || `Ação '${action}' aplicada.`);
      setVerifyAction(null);
      loadProfessionals();
    } catch (err) { toast.error(err.response?.data?.detail || "Erro."); }
  };

  // 10.3-30: Set account status
  const setAccountStatus = async (userId, status) => {
    try {
      await axios.patch(`${API}/api/admin/users/${userId}/account-status?status=${status}`, {}, { headers });
      toast.success(`Status da conta alterado para '${status}'.`);
      if (unifiedProfile) loadUnifiedProfile(userId);
    } catch (err) { toast.error(err.response?.data?.detail || "Erro."); }
  };

  return (
    <div>
      {viewingDoc && <DocModal prof={viewingDoc} onClose={() => setViewingDoc(null)} onDocUpdate={() => { loadProfessionals(); setViewingDoc(null); }} />}

      {/* 10.1-17: Approval Checklist Modal */}
      {checklist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setChecklist(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10 max-h-[80vh] overflow-y-auto">
            <h3 className="font-bold text-navy mb-3">Checklist de Aprovação</h3>
            <div className="space-y-2 mb-4">
              {checklist.checklist.map((item, i) => (
                <div key={i} className={`flex items-center gap-2 p-2 rounded-lg ${item.passed ? "bg-green-50" : "bg-red-50"}`}>
                  <span className={`text-sm ${item.passed ? "text-green-600" : "text-red-500"}`}>{item.passed ? "✓" : "✗"}</span>
                  <span className="text-sm text-slate-700">{item.item}</span>
                </div>
              ))}
            </div>
            {checklist.can_approve ? (
              <button onClick={() => { approve(checklist.professional_id); setChecklist(null); }}
                className="btn-primary w-full text-sm">✓ Aprovar profissional</button>
            ) : (
              <p className="text-xs text-red-500 text-center">Todos os itens devem estar ✓ para aprovar.</p>
            )}
            <button onClick={() => setChecklist(null)} className="btn-outline w-full mt-2 text-sm">Fechar</button>
          </div>
        </div>
      )}

      {/* 10.3-28: Unified Profile Modal */}
      {unifiedProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setUnifiedProfile(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10 max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-navy mb-1">{unifiedProfile.full_name}</h3>
            <p className="text-xs text-slate-500 mb-3">{unifiedProfile.email} · CPF: {unifiedProfile.cpf || "N/A"} · Tel: {unifiedProfile.phone || "N/A"}</p>

            <div className="flex flex-wrap gap-2 mb-4">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${unifiedProfile.account_status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                Conta: {unifiedProfile.account_status}
              </span>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${unifiedProfile.phone_verified ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                Tel: {unifiedProfile.phone_verified ? "✓" : "✗"}
              </span>
              {unifiedProfile.roles?.map(r => (
                <span key={r} className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700">{r}</span>
              ))}
            </div>

            {/* 10.3-30: Account status actions */}
            <div className="flex gap-2 mb-4">
              {["active","suspended","banned"].map(s => (
                <button key={s} onClick={() => setAccountStatus(unifiedProfile.user_id, s)} disabled={unifiedProfile.account_status === s}
                  className={`text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-30 ${
                    s === "active" ? "bg-green-100 text-green-700" : s === "suspended" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"}`}>
                  {s === "active" ? "Ativar" : s === "suspended" ? "Suspender" : "Banir"}
                </button>
              ))}
            </div>

            {unifiedProfile.professional && (
              <div className="p-3 bg-slate-50 rounded-xl mb-3">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Perfil Profissional</p>
                <p className="text-sm text-navy">COREN: {unifiedProfile.professional.council_number}-{unifiedProfile.professional.council_state}</p>
                <p className="text-xs text-slate-500">Status: {unifiedProfile.professional.verification_status} · Ativo: {unifiedProfile.professional.active_category}</p>
                {(unifiedProfile.professional.categories || []).map((cat, i) => (
                  <div key={i} className="mt-1 text-xs text-slate-600">• {cat.role}: {cat.is_active ? "Ativo" : "Inativo"} ({cat.verification_status || "pendente"})</div>
                ))}
              </div>
            )}

            {/* 10.3-29: Future bookings by category */}
            {unifiedProfile.total_future_bookings > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-3">
                <p className="text-xs font-semibold text-amber-700">{unifiedProfile.total_future_bookings} agendamento(s) futuro(s)</p>
              </div>
            )}

            {/* 10.3-37: Documents grouped by category */}
            {unifiedProfile.professional && (
              <button onClick={async()=>{
                try{
                  const{data}=await axios.get(`${API}/api/admin/professionals/${unifiedProfile.professional.id}/documents-by-category`,{headers});
                  toast((t)=>(
                    <div className="text-xs"><p className="font-bold mb-1">Docs por categoria:</p>
                    <p>Identidade: {data.identity?.length||0} doc(s)</p>
                    {Object.entries(data.categories||{}).map(([cat,v])=>(
                      <p key={cat}>{cat}: {v.submitted?.length||0}/{v.required?.length||0}</p>
                    ))}
                    <button onClick={()=>toast.dismiss(t.id)} className="mt-1 text-blue-500 underline">Fechar</button></div>
                  ),{duration:10000});
                }catch{toast.error("Erro ao carregar docs.");}
              }} className="btn-outline w-full text-sm mb-2">📄 Ver documentos por categoria</button>
            )}

            <button onClick={() => setUnifiedProfile(null)} className="btn-outline w-full text-sm">Fechar</button>
          </div>
        </div>
      )}

      {/* 2.4: Professionals / Clients toggle with pending counts */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setViewMode("professionals")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold ${viewMode === "professionals" ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
          👩‍⚕️ Profissionais {pendingProCount > 0 && <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded-full">{pendingProCount}</span>}
        </button>
        <button onClick={() => setViewMode("clients")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold ${viewMode === "clients" ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
          👤 Clientes {pendingClientCount > 0 && <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded-full">{pendingClientCount}</span>}
        </button>
      </div>

      {viewMode === "clients" ? (
        <div>
          <h2 className="font-display text-xl font-bold text-navy mb-4">Clientes</h2>
          <div className="flex gap-2 mb-5">
            {[["","Todos"],["pending","Pendentes"],["under_review","Em análise"],["verified","Verificados"],["rejected","Rejeitados"]].map(([s,label]) => (
              <button key={s} onClick={() => setClientFilter(s)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors
                  ${clientFilter === s ? "bg-blue-500 text-white border-blue-500" : "border-slate-200 text-slate-600 hover:border-blue-400"}`}>
                {label}
              </button>
            ))}
          </div>
          {clientList.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">Nenhum cliente nesta categoria.</p>
          ) : (
            <div className="space-y-3">
              {clientList.map(c => (
                <div key={c.id} className="card p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-navy text-sm">{c.full_name}</p>
                      <p className="text-xs text-slate-500">{c.email} · {c.phone || "sem telefone"}</p>
                      <p className="text-xs text-slate-400 mt-0.5">CPF: {c.cpf || "N/A"}</p>
                      {/* Document status tags for client */}
                      {c.documents && c.documents.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {c.documents.map(doc => {
                            const statusIcon = doc.status === "approved" ? "✓" : doc.status === "rejected" ? "✕" : doc.status === "replacement_requested" ? "↻" : "⏳";
                            const statusColor = doc.status === "approved" ? "bg-green-100 text-green-700" : doc.status === "rejected" ? "bg-red-100 text-red-600" : doc.status === "replacement_requested" ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700";
                            const tooltip = DOC_STATUS_PT[doc.status] || doc.status;
                            return (
                              <span key={doc.id} title={tooltip} className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-default ${statusColor}`}>
                                {DOC_LABELS[doc.doc_type]?.split(" ")[0] || doc.doc_type} {statusIcon}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <p className="text-[11px] text-slate-400 mt-1">
                        {c.documents?.filter(d => d.status === "approved").length || 0} de {c.documents?.length || 0} documentos aprovados
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                      <button onClick={() => setViewingDoc({...c, council_number: null, council_state: null})}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50">
                        <FileText size={13} /> Docs ({c.documents?.length || 0})
                      </button>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${c.is_verified ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {c.is_verified ? "✓ Verificado" : "Pendente"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
      <div>
      <h2 className="font-display text-xl font-bold text-navy mb-4">Profissionais</h2>
      <div className="flex gap-2 mb-5">
        {[["","Todos"],["pending","Pendentes"],["under_review","Em análise"],["approved","Verificados"],["rejected","Rejeitados"]].map(([s,label]) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors
              ${filter === s ? "bg-blue-500 text-white border-blue-500" : "border-slate-200 text-slate-600 hover:border-blue-400"}`}>
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">Nenhum profissional nesta categoria.</p>
      ) : (
        <div className="space-y-3">
          {list.map(p => (
            <div key={p.id} className="card p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-navy text-sm">{p.full_name}</p>
                    {p.professional_category && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                        {CATEGORY_PT[p.professional_category] || p.professional_category}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{p.email} · {p.phone}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {p.council_type} {p.council_number ? `${p.council_number}-${p.council_state}` : "sem COREN"} · {p.city}
                  </p>
                  {/* Document status summary */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {["photo_id","diploma","criminal","selfie"].map(type => {
                      const doc = p.documents?.find(d => d.doc_type === type);
                      const statusIcon = !doc ? "—" : doc.status === "approved" ? "✓" : doc.status === "rejected" ? "✕" : doc.status === "replacement_requested" ? "↻" : "⏳";
                      const statusColor = !doc ? "bg-slate-100 text-slate-400" : doc.status === "approved" ? "bg-green-100 text-green-700" : doc.status === "rejected" ? "bg-red-100 text-red-600" : doc.status === "replacement_requested" ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700";
                      const tooltip = !doc ? "Não enviado" : DOC_STATUS_PT[doc.status] || doc.status;
                      return (
                        <span key={type} title={tooltip} className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-default ${statusColor}`}>
                          {DOC_LABELS[type]?.split(" ")[0]} {statusIcon}
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {p.documents?.filter(d => d.status === "approved").length || 0} de 4 documentos aprovados
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                  {/* View documents */}
                  <button onClick={() => setViewingDoc(p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50">
                    <FileText size={13} /> Docs ({p.documents?.length || 0})
                  </button>
                  {/* 10.1-17: Checklist */}
                  <button onClick={() => loadChecklist(p.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-50">
                    ☑ Checklist
                  </button>
                  {/* 10.3-28: Unified profile */}
                  <button onClick={() => loadUnifiedProfile(p.user_id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-purple-200 text-purple-600 rounded-lg text-xs font-semibold hover:bg-purple-50">
                    👤 Perfil
                  </button>

                  {filter === "pending" && (
                    <>
                      <button onClick={() => approve(p.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-200">
                        <CheckCircle size={14} /> Aprovar
                      </button>
                      <button onClick={() => reject(p.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-200">
                        <XCircle size={14} /> Rejeitar
                      </button>
                    </>
                  )}
                  {/* 10.1-16: Verification actions for non-pending */}
                  {filter !== "pending" && (
                    <div className="flex gap-1">
                      <button onClick={() => handleVerificationAction(p.id, "keep_under_review")}
                        className="text-[10px] px-2 py-1 bg-amber-50 text-amber-600 rounded font-semibold hover:bg-amber-100">Revisão</button>
                      <button onClick={() => handleVerificationAction(p.id, "request_info", "Documentação adicional necessária")}
                        className="text-[10px] px-2 py-1 bg-blue-50 text-blue-600 rounded font-semibold hover:bg-blue-100">Pedir info</button>
                      <button onClick={() => handleVerificationAction(p.id, "trigger_reverification")}
                        className="text-[10px] px-2 py-1 bg-purple-50 text-purple-600 rounded font-semibold hover:bg-purple-100">Re-verificar</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
      )}
    </div>
  );
};

/* ── Users Panel ── */
const UsersPanel = () => {
  const { headers } = useAdmin();
  const [users, setUsers] = useState([]);
  useEffect(() => {
    axios.get(`${API}/api/admin/users`, { headers }).then(r => setUsers(r.data)).catch(() => {});
  }, []);

  const toggleBlock = async (userId, isActive) => {
    await axios.patch(`${API}/api/admin/users/${userId}/block`, {}, { headers });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !isActive } : u));
    toast(isActive ? "Usuário bloqueado." : "Usuário desbloqueado.", { icon: isActive ? "🔒" : "🔓" });
  };

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-navy mb-4">Usuários</h2>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["Nome","E-mail","Papel","Cidade/UF","Status","Ação"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-navy text-sm">{u.full_name}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                      ${u.role === "client" ? "bg-blue-100 text-blue-700" : u.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{[u.city, u.state].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                      ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      {u.is_active ? "Ativo" : "Bloqueado"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.role !== "admin" && (
                      <button onClick={() => toggleBlock(u.id, u.is_active)}
                        className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors
                          ${u.is_active ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-green-50 text-green-600 hover:bg-green-100"}`}>
                        <Ban size={12} /> {u.is_active ? "Bloquear" : "Desbloquear"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ── Bookings Panel ── */
const BookingsPanel = () => {
  const { headers } = useAdmin();
  const [bookings, setBookings] = useState([]);
  const [filter,   setFilter]   = useState("");
  useEffect(() => {
    const url = filter ? `${API}/api/admin/bookings?status=${filter}` : `${API}/api/admin/bookings`;
    axios.get(url, { headers }).then(r => setBookings(r.data)).catch(() => {});
  }, [filter]);

  const STATUS_COLOR = { accepted:"bg-green-100 text-green-700", completed:"bg-slate-100 text-slate-600", pending:"bg-amber-100 text-amber-700", cancelled:"bg-red-100 text-red-600", checked_in:"bg-blue-100 text-blue-700" };

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-navy mb-4">Agendamentos</h2>
      <div className="flex flex-wrap gap-2 mb-5">
        {[["","Todos"],["pending","Pendentes"],["accepted","Confirmados"],["completed","Concluídos"],["cancelled","Cancelados"]].map(([v,l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors
              ${filter === v ? "bg-blue-500 text-white border-blue-500" : "border-slate-200 text-slate-600 hover:border-blue-400"}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["Serviço","Data","Total","Comissão","Status"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.map(b => (
                <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-navy text-sm">{b.service_type}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{new Date(b.scheduled_start).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3 font-semibold text-navy text-sm">R${b.total_price?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-green-600 font-semibold text-sm">R${b.platform_fee?.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[b.status]}`}>{b.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ── Commission Panel ── */
const CommissionPanel = () => {
  const { headers } = useAdmin();
  const [rate,  setRate]  = useState(12);
  const [input, setInput] = useState("12");
  useEffect(() => {
    axios.get(`${API}/api/admin/commission`, { headers })
      .then(r => { setRate(r.data.rate); setInput(String(r.data.rate)); }).catch(() => {});
  }, []);

  const save = async () => {
    const val = parseFloat(input);
    if (isNaN(val) || val <= 0 || val >= 100) { toast.error("Taxa inválida (entre 0 e 100)."); return; }
    await axios.put(`${API}/api/admin/commission?rate=${val}`, {}, { headers });
    setRate(val);
    toast.success(`Taxa atualizada para ${val}%`);
  };

  return (
    <div className="max-w-md">
      <h2 className="font-display text-xl font-bold text-navy mb-6">Configuração de comissão</h2>
      <div className="card p-6">
        <p className="text-sm text-slate-500 mb-5">A comissão é descontada automaticamente de cada pagamento.</p>
        <div className="mb-5">
          <label className="form-label">Taxa da plataforma (%)</label>
          <div className="flex gap-3">
            <input className="form-input" type="number" min="1" max="99" value={input} onChange={e => setInput(e.target.value)} />
            <button onClick={save} className="btn-primary flex-shrink-0">Salvar</button>
          </div>
        </div>
        <div className="bg-slate-50 rounded-xl p-4 text-sm">
          <p className="font-semibold text-navy mb-2">Exemplo com taxa atual de {rate}%:</p>
          <p className="text-slate-600">Serviço de <strong>R$200</strong></p>
          <p className="text-green-600">→ Cuida.me recebe: <strong>R${(200 * rate / 100).toFixed(2)}</strong></p>
          <p className="text-blue-600">→ Profissional recebe: <strong>R${(200 * (1 - rate / 100)).toFixed(2)}</strong></p>
        </div>
      </div>
    </div>
  );
};

/* ── Main Admin Dashboard ── */
/* ── Reports Panel ── */
const STATUS_LABELS_R = { pending: "Pendente", under_review: "Em análise", resolved: "Resolvido" };
const STATUS_COLORS_R = { pending: "bg-amber-100 text-amber-700", under_review: "bg-blue-100 text-blue-700", resolved: "bg-green-100 text-green-700" };
const REASON_LABELS = { no_show: "Não compareceu", unprofessional_behavior: "Comportamento inadequado", poor_quality: "Qualidade insatisfatória", safety_concern: "Preocupação com segurança", other: "Outro" };

const ReportsPanel = () => {
  const { headers } = useAdmin();
  const [reports, setReports] = useState([]);
  const [filterStatus, setFilterStatus] = useState("");
  useEffect(() => {
    const url = filterStatus ? `${API}/api/reports?status=${filterStatus}` : `${API}/api/reports`;
    axios.get(url, { headers }).then(r => setReports(r.data)).catch(() => {});
  }, [filterStatus]);

  const updateStatus = async (id, newStatus) => {
    await axios.patch(`${API}/api/reports/${id}/status?new_status=${newStatus}`, {}, { headers });
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    toast.success("Status atualizado.");
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="font-bold text-navy text-lg">Denúncias e Relatórios</h2>
        <div className="flex gap-2">
          {["", "pending", "under_review", "resolved"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${filterStatus === s ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {s ? STATUS_LABELS_R[s] : "Todos"}
            </button>
          ))}
        </div>
      </div>
      {reports.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-8">Nenhuma denúncia encontrada.</p>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS_R[r.status] || "bg-slate-100"}`}>{STATUS_LABELS_R[r.status]}</span>
                    <span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                  <p className="text-sm font-semibold text-navy">{REASON_LABELS[r.reason] || r.reason}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Denunciante: {r.reporter_name} → Denunciado: {r.reported_name}</p>
                  {r.booking_id && <p className="text-xs text-slate-400 mt-0.5">Agendamento: {r.booking_id.slice(0,8)}...</p>}
                  {r.description && <p className="text-xs text-slate-600 mt-1 p-2 bg-slate-50 rounded-lg">{r.description}</p>}
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  {r.status === "pending" && <button onClick={() => updateStatus(r.id, "under_review")} className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-semibold">Analisar</button>}
                  {r.status !== "resolved" && <button onClick={() => updateStatus(r.id, "resolved")} className="text-xs px-2.5 py-1 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 font-semibold">Resolver</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Legal Documents Panel ── */
const LegalDocsPanel = () => {
  const { headers } = useAdmin();
  const [docs, setDocs] = useState({});
  const [loading, setLoading] = useState(true);
  const [editKey, setEditKey] = useState(null);
  const [form, setForm] = useState({ title: "", content: "" });
  const [saving, setSaving] = useState(false);

  const loadDocs = () => {
    axios.get(`${API}/api/alice/consent-docs`, { headers })
      .then(r => setDocs(r.data))
      .catch(() => toast.error("Erro ao carregar documentos legais."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadDocs(); }, []);

  const startEdit = (key) => {
    setEditKey(key);
    setForm({ title: docs[key]?.title || key, content: docs[key]?.content || "" });
  };

  const handleSave = async () => {
    if (!form.content.trim()) { toast.error("Conteúdo não pode ser vazio."); return; }
    setSaving(true);
    try {
      await axios.put(`${API}/api/alice/documents/${editKey}`, form, { headers });
      toast.success("Documento atualizado! As alterações já estão ativas.");
      setEditKey(null);
      loadDocs();
    } catch (err) { toast.error(err.response?.data?.detail || "Erro ao salvar."); }
    finally { setSaving(false); }
  };

  const DOC_LABELS = { terms: "Termos de Uso", privacy: "Política de Privacidade", lgpd: "LGPD — Proteção de Dados" };

  return (
    <div>
      <h2 className="font-bold text-navy text-lg">Documentos Legais</h2>
      <p className="text-xs text-slate-500 mt-0.5 mb-6">Termos de Uso, Política de Privacidade e LGPD exibidos no cadastro e no app</p>
      {loading ? <p className="text-sm text-slate-400 text-center py-8">Carregando...</p> : (
        <div className="space-y-3">
          {["terms", "privacy", "lgpd"].map(key => (
            <div key={key} className="card p-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-semibold text-navy">{DOC_LABELS[key] || key}</p>
                  <p className="text-xs text-slate-400">{docs[key]?.content?.length || 0} caracteres</p>
                </div>
                <button onClick={() => startEdit(key)} className="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg font-semibold hover:bg-blue-200">Editar</button>
              </div>
              <p className="text-xs text-slate-500 line-clamp-3">{docs[key]?.content?.substring(0, 200) || "Nenhum conteúdo definido."}...</p>
            </div>
          ))}
        </div>
      )}
      {editKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditKey(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10 max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-navy mb-3">Editar: {DOC_LABELS[editKey]}</h3>
            <div className="space-y-3 mb-4">
              <div><label className="form-label">Título</label>
                <input className="form-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
              <div><label className="form-label">Conteúdo completo</label>
                <textarea className="form-input min-h-[500px] text-sm" value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} />
                <p className="text-[10px] text-slate-400 mt-1">{form.content.length} caracteres · sem limite de tamanho</p></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditKey(null)} className="btn-outline flex-1 text-sm">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 text-sm disabled:opacity-50">{saving ? "Salvando..." : "Salvar alterações"}</button>
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-2">Alterações salvas no banco — sobrevivem reinicializações.</p>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── 49b-g: COREN Validation Panel ── */
const ValidationPanel = () => {
  const { headers } = useAdmin();
  const [docId, setDocId] = useState("");
  const [corenInput, setCorenInput] = useState("");
  const [manualName, setManualName] = useState("");
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [overrideJustification, setOverrideJustification] = useState("");
  const [result, setResult] = useState(null);
  const [corenResult, setCorenResult] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [corenLoading, setCorenLoading] = useState(false);
  const [corenState, setCorenState] = useState("");

  const handleValidate = async () => {
    if (!docId.trim()) { toast.error("Informe o ID do documento."); return; }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/admin/documents/${docId}/validate`, {}, { headers });
      setResult(data);
    } catch (err) { toast.error(err.response?.data?.detail || "Erro na validação."); }
    finally { setLoading(false); }
  };

  const handleCorenVerify = async () => {
    if (!corenInput.trim()) { toast.error("Informe o número COREN ou URL do certificado."); return; }
    setCorenLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/admin/coren-verify`, {
        qr_data: corenInput,
        manual_name: manualName.trim() || null,
        state: corenState.trim() || null,
      }, { headers });
      setCorenResult(data);
      setNameConfirmed(false);
      if (data.success) toast.success(data.message || "COREN verificado!");
      else toast.error(data.message || "Verificação falhou.");
    } catch (err) { toast.error(err.response?.data?.detail || "Erro na verificação COREN."); }
    finally { setCorenLoading(false); }
  };

  const handleCalibrate = async (verdict) => {
    try {
      await axios.post(`${API}/api/admin/documents/${docId}/calibrate?human_verdict=${verdict}`, {}, { headers });
      toast.success("Calibração registrada!");
      loadCalibration();
    } catch { toast.error("Erro ao calibrar."); }
  };

  const loadCalibration = () => {
    axios.get(`${API}/api/admin/documents/calibration-report`, { headers })
      .then(r => setCalibration(r.data)).catch(() => {});
  };

  const loadConfig = () => {
    axios.get(`${API}/api/admin/documents/auto-approval-config`, { headers })
      .then(r => setConfig(r.data)).catch(() => {});
  };

  useEffect(() => { loadCalibration(); loadConfig(); }, []);

  const classColor = { auto_approved: "bg-green-100 text-green-700", needs_manual_review: "bg-amber-100 text-amber-700", auto_rejected: "bg-red-100 text-red-600" };
  const classLabel = { auto_approved: "Auto-aprovado", needs_manual_review: "Revisão manual", auto_rejected: "Auto-rejeitado" };

  return (
    <div>
      <h2 className="font-bold text-navy text-lg">Validação Automática COREN</h2>
      <p className="text-xs text-slate-500 mt-0.5 mb-6">OCR + verificação cruzada de documentos profissionais</p>

      {/* COREN number / URL verification */}
      <div className="card p-5 mb-4">
        <p className="font-semibold text-navy mb-1">Verificar registro COREN</p>
        <p className="text-xs text-slate-500 mb-3">Digite o número de inscrição COREN ou cole a URL do certificado</p>
        <div className="flex gap-2 mb-3">
          <input type="text" className="form-input flex-1 text-sm" placeholder="Ex: 528594 ou URL do certificado"
            value={corenInput} onChange={e => setCorenInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCorenVerify()} />
          <button onClick={handleCorenVerify} disabled={corenLoading} className="btn-primary text-sm px-4 disabled:opacity-50">
            {corenLoading ? "..." : "Verificar"}
          </button>
        </div>

        {/* State selector for direct number lookups */}
        <div className="mb-3">
          <label className="text-xs text-slate-500">Estado do COREN (para consulta no site oficial)</label>
          <select className="form-input text-sm mt-1" value={corenState} onChange={e => setCorenState(e.target.value)}>
            <option value="">Selecione o estado...</option>
            {Object.keys(COREN_URLS).sort().map(uf => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
        </div>

        {/* 1-5: Manual name field for comparison when URL fetch can't get name */}
        <div className="mb-3">
          <label className="text-xs text-slate-500">Nome no certificado (opcional — para comparação com perfil)</label>
          <input type="text" className="form-input text-sm mt-1" placeholder="Cole o nome exato do certificado COREN aqui"
            value={manualName} onChange={e => setManualName(e.target.value)} />
        </div>

        {corenResult && (
          <div className={`p-4 rounded-xl border ${
            corenResult.name_match === false ? "bg-red-50 border-red-300" :
            corenResult.success ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
            <p className={`text-sm font-semibold ${
              corenResult.name_match === false ? "text-red-700" :
              corenResult.success ? "text-green-700" : "text-amber-700"}`}>
              {corenResult.name_match === false ? "⚠️ " : corenResult.success ? "✅ " : "⚠️ "}{corenResult.message}
            </p>

            {/* 1-3: Name mismatch warning */}
            {corenResult.name_warning && (
              <div className="mt-2 p-3 bg-red-100 border border-red-300 rounded-lg">
                <p className="text-sm font-bold text-red-700">⚠️ NOME DIVERGENTE</p>
                <p className="text-xs text-red-600 mt-1">Nome no certificado: <strong>{corenResult.extracted_name || "Não extraído"}</strong></p>
                <p className="text-xs text-red-600">Nome no perfil: <strong>{corenResult.profile_name || "N/A"}</strong></p>
                <p className="text-xs text-red-500 mt-1 italic">{corenResult.name_warning}</p>
              </div>
            )}

            {/* 1-6: Certificate warning */}
            {corenResult.cert_warning && (
              <div className="mt-2 p-2 bg-amber-100 border border-amber-300 rounded-lg">
                <p className="text-xs text-amber-700 font-semibold">⚠️ {corenResult.cert_warning}</p>
              </div>
            )}

            {corenResult.extracted && (
              <div className="mt-2 text-xs text-slate-600 space-y-0.5">
                {corenResult.extracted.coren_number && <p>Nº COREN: <strong>{corenResult.extracted.coren_number}</strong></p>}
                {corenResult.extracted.name && <p>Nome extraído: {corenResult.extracted.name}</p>}
                {corenResult.extracted.cpf && <p>CPF: {corenResult.extracted.cpf}</p>}
                {corenResult.extracted.state && <p>Estado: {corenResult.extracted.state}</p>}
                {corenResult.extracted.category && <p>Categoria: {corenResult.extracted.category}</p>}
                {corenResult.extracted.status && <p>Status: {corenResult.extracted.status}</p>}
                {corenResult.extracted.method && <p className="text-slate-400">Método: {corenResult.extracted.method}</p>}
                {corenResult.extracted.fetch_error && <p className="text-red-500">Erro: {corenResult.extracted.fetch_error}</p>}
              </div>
            )}
            {corenResult.hint && <p className="text-xs text-slate-500 mt-2 italic">{corenResult.hint}</p>}

            {/* Professional found section */}
            {corenResult.matched && corenResult.professional_name && (
              <div className={`mt-2 p-2 rounded-lg border ${corenResult.name_match === false ? "bg-red-50 border-red-200" : "bg-white border-green-200"}`}>
                <p className="text-xs font-semibold text-slate-700">Profissional no sistema:</p>
                <p className="text-xs text-slate-600">{corenResult.professional_name}</p>
              </div>
            )}

            {/* 1-4: Block approval on name mismatch — require manual confirmation */}
            {corenResult.matched && corenResult.name_match === false && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                <textarea className="form-input text-xs w-full min-h-[60px]"
                  placeholder="Justificativa obrigatória: explique por que está aprovando mesmo com nome divergente"
                  value={overrideJustification} onChange={e => setOverrideJustification(e.target.value)} />
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 accent-amber-500"
                    checked={nameConfirmed} onChange={e => setNameConfirmed(e.target.checked)}
                    disabled={!overrideJustification.trim()} />
                  <span className="text-xs text-amber-700 font-medium">
                    Confirmo que verifiquei manualmente e autorizo a aprovação.
                  </span>
                </label>
              </div>
            )}

            {/* Auto-verify button — blocked if name mismatch and not confirmed */}
            {corenResult.matched && corenResult.auto_verify && (
              <button
                disabled={corenResult.name_match === false && (!nameConfirmed || !overrideJustification.trim())}
                onClick={async () => {
                  try {
                    const reason = corenResult.name_match === false
                      ? `NOME DIVERGENTE — Justificativa: ${overrideJustification}`
                      : "COREN verificado automaticamente";
                    await axios.patch(`${API}/api/admin/professionals/${corenResult.professional_id}/approve`, {}, { headers });
                    // Log the override justification to audit
                    if (corenResult.name_match === false) {
                      await axios.post(`${API}/api/admin/coren-verify-log`, {
                        professional_id: corenResult.professional_id,
                        action: "name_mismatch_override",
                        justification: overrideJustification,
                        extracted_name: corenResult.extracted_name,
                        profile_name: corenResult.profile_name,
                      }, { headers }).catch(() => {});
                    }
                    toast.success("Profissional aprovado!");
                    setCorenResult(null); setNameConfirmed(false); setOverrideJustification("");
                  } catch (err) { toast.error(err.response?.data?.detail || "Erro."); }
                }}
                className="btn-primary w-full mt-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                {corenResult.name_match === false
                  ? (nameConfirmed && overrideJustification.trim() ? "Aprovar mesmo assim" : "Preencha a justificativa acima")
                  : "✓ Aprovar profissional"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Validate a specific document by ID */}
      <div className="card p-5 mb-4">
        <p className="font-semibold text-navy mb-3">Validar documento por ID</p>
        <div className="flex gap-2 mb-3">
          <input type="text" className="form-input flex-1 text-sm" placeholder="ID do documento" value={docId} onChange={e => setDocId(e.target.value)} />
          <button onClick={handleValidate} disabled={loading} className="btn-primary text-sm px-4 disabled:opacity-50">
            {loading ? "..." : "Validar"}
          </button>
        </div>

        {/* 49e: Display classification + criteria */}
        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${classColor[result.classification]}`}>
                {classLabel[result.classification]}
              </span>
              <span className="text-xs text-slate-500">Confiança: {result.confidence}%</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: "Nome", val: result.extracted_name, match: result.name_match },
                { label: "CPF", val: result.extracted_cpf, match: result.cpf_match },
                { label: "Categoria", val: result.extracted_category, match: result.category_match },
                { label: "Estado", val: result.extracted_state, match: result.state_match },
              ].map(item => (
                <div key={item.label} className={`p-2 rounded-lg border ${item.match === true ? "bg-green-50 border-green-200" : item.match === false ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
                  <p className="text-slate-500">{item.label}</p>
                  <p className="font-medium text-navy">{item.val || "—"}</p>
                  <p className={`text-[10px] ${item.match === true ? "text-green-600" : item.match === false ? "text-red-500" : "text-slate-400"}`}>
                    {item.match === true ? "✓ Match" : item.match === false ? "✗ Mismatch" : "? N/A"}
                  </p>
                </div>
              ))}
            </div>
            {result.extracted_coren && <p className="text-xs text-slate-500">COREN: {result.extracted_coren}</p>}

            {/* 49f: Phase 1 calibration — human verdict */}
            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Fase 1 — Calibração: qual seu veredito?</p>
              <div className="flex gap-2">
                <button onClick={() => handleCalibrate("auto_approved")} className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 font-semibold hover:bg-green-200">Aprovar</button>
                <button onClick={() => handleCalibrate("needs_manual_review")} className="text-xs px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 font-semibold hover:bg-amber-200">Revisão</button>
                <button onClick={() => handleCalibrate("auto_rejected")} className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-600 font-semibold hover:bg-red-200">Rejeitar</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 49f: Calibration report */}
      {calibration && (
        <div className="card p-5 mb-4">
          <p className="font-semibold text-navy mb-3">Relatório de calibração</p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center p-3 rounded-xl bg-slate-50">
              <p className="text-2xl font-bold text-navy">{calibration.total_reviews}</p>
              <p className="text-xs text-slate-500">Revisões</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-slate-50">
              <p className="text-2xl font-bold text-navy">{calibration.matches}</p>
              <p className="text-xs text-slate-500">Concordâncias</p>
            </div>
            <div className={`text-center p-3 rounded-xl ${calibration.accuracy_pct >= 98 ? "bg-green-50" : "bg-amber-50"}`}>
              <p className="text-2xl font-bold text-navy">{calibration.accuracy_pct}%</p>
              <p className="text-xs text-slate-500">Precisão</p>
            </div>
          </div>
          {calibration.phase_2_ready ? (
            <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700 font-medium">
              ✅ Fase 2 disponível — auto-aprovação pode ser habilitada
            </div>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              ⏳ Fase 1 em andamento — necessário ≥100 revisões com ≥98% precisão para Fase 2
            </div>
          )}
        </div>
      )}

      {/* 49g: Phase 2 threshold config */}
      {config && (
        <div className="card p-5">
          <p className="font-semibold text-navy mb-3">Configuração auto-aprovação (Fase {config.phase})</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Confiança mínima</span>
              <span className="font-medium">{config.min_confidence_for_auto_approve}%</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Revisões mínimas</span>
              <span className="font-medium">{config.min_calibration_reviews}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Precisão mínima</span>
              <span className="font-medium">{config.min_accuracy_pct}%</span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-3">{config.note}</p>
        </div>
      )}
    </div>
  );
};

/* ── Alice Panel ── */
const AlicePanel = () => {
  const { headers } = useAdmin();
  const [updating, setUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [addMode, setAddMode] = useState(false);
  const [editKey, setEditKey] = useState(null);
  const [form, setForm] = useState({ title: "", content: "" });

  const loadDocs = () => {
    axios.get(`${API}/api/alice/documents`, { headers })
      .then(r => setDocs(r.data))
      .catch(() => {})
      .finally(() => setLoadingDocs(false));
  };
  useEffect(() => { loadDocs(); }, []);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const { data } = await axios.post(`${API}/api/alice/update`, {}, { headers });
      toast.success(data.message || "Alice atualizada!");
      setLastUpdate(new Date().toLocaleString("pt-BR"));
    } catch { toast.error("Erro ao atualizar Alice."); }
    finally { setUpdating(false); }
  };

  const handleAdd = async () => {
    if (!form.title || !form.content) { toast.error("Título e conteúdo são obrigatórios."); return; }
    try {
      const { data } = await axios.post(`${API}/api/alice/documents/upload`, form, { headers });
      toast.success(data.message);
      setAddMode(false); setForm({ title: "", content: "" });
      loadDocs();
    } catch (err) { toast.error(err.response?.data?.detail || "Erro ao adicionar."); }
  };

  const handleEdit = async () => {
    if (!form.title || !form.content) { toast.error("Título e conteúdo são obrigatórios."); return; }
    try {
      const { data } = await axios.put(`${API}/api/alice/documents/${editKey}`, form, { headers });
      toast.success(data.message);
      setEditKey(null); setForm({ title: "", content: "" });
      loadDocs();
    } catch (err) { toast.error(err.response?.data?.detail || "Erro ao atualizar."); }
  };

  const handleDelete = async (key, title) => {
    if (!window.confirm(`Tem certeza que deseja remover "${title}"?`)) return;
    try {
      const { data } = await axios.delete(`${API}/api/alice/documents/${key}`, { headers });
      toast.success(data.message);
      loadDocs();
    } catch (err) { toast.error(err.response?.data?.detail || "Erro ao remover."); }
  };

  const startEdit = (doc) => {
    setEditKey(doc.key);
    setForm({ title: doc.title, content: doc.content || "" });
    setAddMode(false);
  };

  return (
    <div>
      <h2 className="font-bold text-navy text-lg">Alice — Assistente IA</h2>
      <p className="text-xs text-slate-500 mt-0.5 mb-6">Gerencie os documentos da base de conhecimento da Alice</p>

      {/* Update Alice button */}
      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot size={24} className="text-blue-500" />
            <div>
              <p className="font-semibold text-navy">Re-indexar base de conhecimento</p>
              <p className="text-xs text-slate-500">Clique após adicionar ou alterar documentos</p>
            </div>
          </div>
          <button onClick={handleUpdate} disabled={updating}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
            <Bot size={14} /> {updating ? "..." : "Atualizar Alice"}
          </button>
        </div>
        {lastUpdate && <p className="text-xs text-slate-400 mt-2">Última atualização: {lastUpdate}</p>}
      </div>

      {/* Document list */}
      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-navy">Documentos da base ({docs.length})</p>
          <button onClick={() => { setAddMode(true); setEditKey(null); setForm({ title: "", content: "" }); }}
            className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600">
            + Adicionar documento
          </button>
        </div>

        {loadingDocs ? (
          <p className="text-sm text-slate-400 text-center py-4">Carregando...</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Nenhum documento na base.</p>
        ) : (
          <div className="space-y-2">
            {docs.map(doc => (
              <div key={doc.key} className="flex items-start justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-navy">{doc.title}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      doc.type === "builtin" ? "bg-blue-100 text-blue-600" : "bg-green-100 text-green-600"}`}>
                      {doc.type === "builtin" ? "Padrão" : "Personalizado"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{doc.content_preview}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{doc.char_count} caracteres{doc.uploaded_at ? ` · ${new Date(doc.uploaded_at).toLocaleDateString("pt-BR")}` : ""}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0 ml-2">
                  <button onClick={() => startEdit(doc)}
                    className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 font-semibold hover:bg-blue-100">Editar</button>
                  {doc.deletable && (
                    <button onClick={() => handleDelete(doc.key, doc.title)}
                      className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500 font-semibold hover:bg-red-100">Remover</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit form */}
      {(addMode || editKey) && (
        <div className="card p-5">
          <p className="font-semibold text-navy mb-3">{editKey ? `Editar: ${form.title}` : "Novo documento"}</p>
          <div className="space-y-3">
            <div>
              <label className="form-label">Título do documento</label>
              <input className="form-input" placeholder="Ex: FAQ Atendimento, Protocolo de Segurança..."
                value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Conteúdo</label>
              <textarea className="form-input min-h-[400px] text-sm" placeholder="Cole ou digite o conteúdo completo do documento aqui..."
                value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} />
              <p className="text-[10px] text-slate-400 mt-1">{form.content.length} caracteres · sem limite de tamanho</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => { setAddMode(false); setEditKey(null); setForm({ title: "", content: "" }); }}
              className="btn-outline flex-1 text-sm">Cancelar</button>
            <button onClick={editKey ? handleEdit : handleAdd}
              className="btn-primary flex-1 text-sm">{editKey ? "Salvar alterações" : "Adicionar documento"}</button>
          </div>
          <p className="text-[10px] text-slate-400 text-center mt-2">Após salvar, clique em "Atualizar Alice" para que ela passe a usar este documento.</p>
        </div>
      )}
    </div>
  );
};

const AdminDashboard = () => {
  const [section,    setSection]    = useState("overview");
  const [mobileOpen, setMobileOpen] = useState(false);

  const panels = {
    overview:      <Overview />,
    professionals: <ProfessionalsPanel />,
    users:         <UsersPanel />,
    bookings:      <BookingsPanel />,
    commission:    <CommissionPanel />,
    holidays:      <HolidaysPanel />,
    reports:       <ReportsPanel />,
    alice:         <AlicePanel />,
    validation:    <ValidationPanel />,
    legal_docs:    <LegalDocsPanel />,
  };

  const sectionLabel = {
    overview: "Visão geral", professionals: "Profissionais",
    users: "Usuários", bookings: "Agendamentos", commission: "Comissão",
    holidays: "Feriados", reports: "Denúncias", alice: "Alice IA",
    validation: "Validação COREN",
    legal_docs: "Documentos Legais",
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar active={section} onNav={setSection} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="md:hidden p-2 rounded-lg hover:bg-slate-100">
              <Menu size={20} />
            </button>
            <h1 className="font-semibold text-navy text-sm">{sectionLabel[section]}</h1>
          </div>
          <LanguageSwitcher />
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {panels[section]}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;