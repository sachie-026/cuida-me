import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, CalendarDays, DollarSign, ShieldCheck, Menu, LogOut, CheckCircle, XCircle, Ban, FileText, ExternalLink, CalendarRange, Trash2, Plus, Bot } from "lucide-react";
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
    { key: "professionals", label: "Profissionais", icon: <ShieldCheck size={18} /> },
    { key: "users",         label: "Usuários",      icon: <Users size={18} /> },
    { key: "bookings",      label: "Agendamentos",  icon: <CalendarDays size={18} /> },
    { key: "commission",    label: "Comissão",      icon: <DollarSign size={18} /> },
    { key: "holidays",      label: "Feriados",      icon: <CalendarRange size={18} /> },
    { key: "reports",       label: "Denúncias",     icon: <FileText size={18} /> },
    { key: "alice",          label: "Alice IA",       icon: <Bot size={18} /> },
  ];

  const content = (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-slate-100">
        <Logo size="sm" />
        <span className="text-xs font-semibold text-slate-400 mt-1 block">Admin Panel</span>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {links.map(l => (
          <button key={l.key} onClick={() => { onNav(l.key); setMobileOpen(false); }}
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
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [qrInput, setQrInput] = useState("");
  const [qrResult, setQrResult] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);

  const handleQrVerify = async () => {
    if (!qrInput.trim()) return;
    setQrLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/admin/coren-verify`, { qr_data: qrInput }, { headers });
      setQrResult(data);
      if (data.auto_verify) toast.success("COREN ativo verificado!");
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
    setActionLoading(docId);
    try {
      await axios.patch(`${API}/api/admin/documents/${docId}/approve`, {}, { headers });
      toast.success("Documento aprovado!");
      onDocUpdate();
    } catch { toast.error("Erro ao aprovar."); }
    finally { setActionLoading(null); }
  };

  const handleReject = async (docId) => {
    if (!rejectReason.trim()) { toast.error("Informe o motivo da rejeição."); return; }
    setActionLoading(docId);
    try {
      await axios.patch(`${API}/api/admin/documents/${docId}/reject?reason=${encodeURIComponent(rejectReason)}`, {}, { headers });
      toast.success("Documento rejeitado.");
      setRejectingId(null);
      setRejectReason("");
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
                    <p className={`text-xs font-medium mt-0.5 ${DOC_STATUS_COLOR[doc.status]}`}>
                      {doc.status === "approved" ? "✓ Aprovado" : doc.status === "pending" ? "⏳ Em análise" : "✗ Rejeitado"}
                    </p>
                    {doc.rejection_reason && doc.status === "rejected" && (
                      <p className="text-xs text-red-500 mt-0.5">Motivo: {doc.rejection_reason}</p>
                    )}
                  </div>
                  {doc.file_url && !doc.file_url.includes("placeholder.com") && (
                    <div className="flex items-center gap-1.5">
                      <a href={doc.file_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors">
                        <ExternalLink size={11} /> Abrir
                      </a>
                      <a href={doc.file_url} download
                        className="flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-50 hover:bg-slate-100 px-2 py-1 rounded-lg transition-colors">
                        ⬇ Baixar
                      </a>
                    </div>
                  )}
                </div>
                {/* Inline image preview */}
                {doc.file_url && !doc.file_url.includes("placeholder.com") && /\.(jpg|jpeg|png|webp)/i.test(doc.file_url) && (
                  <DocImagePreview url={doc.file_url} />
                )}
                {/* Approve/Reject actions */}
                {doc.status !== "approved" && doc.file_url && !doc.file_url.includes("placeholder.com") && (
                  <div className="mt-2 pt-2 border-t border-slate-200">
                    {rejectingId === doc.id ? (
                      <div className="space-y-2">
                        <input type="text" className="form-input text-sm" placeholder="Motivo da rejeição..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
                        <div className="flex gap-2">
                          <button onClick={() => handleReject(doc.id)} disabled={actionLoading === doc.id}
                            className="text-xs px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 font-semibold disabled:opacity-50">
                            {actionLoading === doc.id ? "..." : "Confirmar rejeição"}
                          </button>
                          <button onClick={() => { setRejectingId(null); setRejectReason(""); }}
                            className="text-xs px-3 py-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 font-semibold">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => handleApprove(doc.id)} disabled={actionLoading === doc.id}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 font-semibold disabled:opacity-50">
                          <CheckCircle size={12} /> Aprovar
                        </button>
                        <button onClick={() => setRejectingId(doc.id)}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-semibold">
                          <XCircle size={12} /> Rejeitar
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

        {/* COREN QR Verification */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Verificação COREN via QR</p>
          <div className="flex gap-2 mb-2">
            <input type="text" className="form-input text-xs flex-1" placeholder="Cole o texto do QR code aqui..."
              value={qrInput} onChange={e => setQrInput(e.target.value)} />
            <button onClick={handleQrVerify} disabled={qrLoading || !qrInput.trim()}
              className="btn-primary text-xs px-3 disabled:opacity-50">
              {qrLoading ? "..." : "Verificar"}
            </button>
          </div>
          {qrResult && (
            <div className={`p-2 rounded-lg text-xs ${qrResult.auto_verify ? "bg-green-50 text-green-700" : qrResult.matched ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
              {qrResult.message}
              {qrResult.extracted?.coren_number && <span className="block mt-1 font-mono">COREN: {qrResult.extracted.coren_number} {qrResult.extracted.state && `(${qrResult.extracted.state})`}</span>}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {prof.documents?.filter(d => d.status === "approved").length || 0} de 4 documentos aprovados
            {prof.documents?.filter(d => d.status === "approved").length >= 4 && " ✓ Profissional auto-aprovado"}
          </span>
          <button onClick={onClose} className="btn-outline text-xs px-4">Fechar</button>
        </div>
      </div>
    </div>
  );
};

/* ── Professionals Panel ── */
const ProfessionalsPanel = () => {
  const { headers } = useAdmin();
  const [list,       setList]       = useState([]);
  const [filter,     setFilter]     = useState("pending");
  const [viewingDoc, setViewingDoc] = useState(null);

  const loadProfessionals = () => {
    axios.get(`${API}/api/admin/professionals?status=${filter}`, { headers })
      .then(r => setList(r.data)).catch(() => {});
  };

  useEffect(() => { loadProfessionals(); }, [filter]);

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

  return (
    <div>
      {viewingDoc && <DocModal prof={viewingDoc} onClose={() => setViewingDoc(null)} onDocUpdate={() => { loadProfessionals(); setViewingDoc(null); }} />}

      <h2 className="font-display text-xl font-bold text-navy mb-4">Profissionais</h2>
      <div className="flex gap-2 mb-5">
        {["pending","approved","rejected"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors
              ${filter === s ? "bg-blue-500 text-white border-blue-500" : "border-slate-200 text-slate-600 hover:border-blue-400"}`}>
            {s === "pending" ? "Pendentes" : s === "approved" ? "Aprovados" : "Rejeitados"}
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
                  <p className="font-semibold text-navy text-sm">{p.full_name}</p>
                  <p className="text-xs text-slate-500">{p.email} · {p.phone}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {p.council_type} {p.council_number}-{p.council_state} · {p.city}
                  </p>
                  {/* Document status summary */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {["photo_id","diploma","criminal","selfie"].map(type => {
                      const doc = p.documents?.find(d => d.doc_type === type);
                      return (
                        <span key={type} className={`text-xs px-2 py-0.5 rounded-full font-medium
                          ${doc ? (doc.status === "approved" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700") : "bg-slate-100 text-slate-400"}`}>
                          {DOC_LABELS[type]?.split(" ")[0]} {doc ? "✓" : "—"}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* View documents button */}
                  <button onClick={() => setViewingDoc(p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors">
                    <FileText size={13} /> Documentos ({p.documents?.length || 0})
                  </button>

                  {filter === "pending" && (
                    <>
                      <button onClick={() => approve(p.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-200 transition-colors">
                        <CheckCircle size={14} /> Aprovar
                      </button>
                      <button onClick={() => reject(p.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-200 transition-colors">
                        <XCircle size={14} /> Rejeitar
                      </button>
                    </>
                  )}
                  {filter !== "pending" && (
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full
                      ${filter === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      {filter === "approved" ? "Aprovado" : "Rejeitado"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
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

/* ── Alice Panel ── */
const AlicePanel = () => {
  const { headers } = useAdmin();
  const [updating, setUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const { data } = await axios.post(`${API}/api/alice/update`, {}, { headers });
      toast.success(data.message || "Alice atualizada!");
      setLastUpdate(new Date().toLocaleString("pt-BR"));
    } catch { toast.error("Erro ao atualizar Alice."); }
    finally { setUpdating(false); }
  };

  return (
    <div>
      <h2 className="font-bold text-navy text-lg">Alice — Assistente IA</h2>
      <p className="text-xs text-slate-500 mt-0.5 mb-6">Gerencie a base de conhecimento da Alice (FAQ inteligente)</p>

      <div className="card p-6 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <Bot size={24} className="text-blue-500" />
          <div>
            <p className="font-semibold text-navy">Base de conhecimento</p>
            <p className="text-xs text-slate-500">Termos de Uso, Política de Privacidade, LGPD, Pagamentos</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Clique em "Atualizar Alice" após alterar qualquer documento legal para que a assistente passe a responder com as informações atualizadas.
        </p>
        <button onClick={handleUpdate} disabled={updating}
          className="btn-primary flex items-center gap-2 disabled:opacity-50">
          <Bot size={16} /> {updating ? "Atualizando..." : "Atualizar Alice"}
        </button>
        {lastUpdate && <p className="text-xs text-slate-400 mt-2">Última atualização: {lastUpdate}</p>}
      </div>

      <div className="card p-6">
        <p className="font-semibold text-navy mb-3">Documentos indexados</p>
        <div className="space-y-2">
          {["Termos de Uso", "Política de Privacidade", "LGPD", "Pagamentos e Reembolsos"].map(doc => (
            <div key={doc} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
              <span className="text-sm text-slate-600">{doc}</span>
              <span className="text-xs text-green-600 font-semibold">✓ Indexado</span>
            </div>
          ))}
        </div>
      </div>
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
  };

  const sectionLabel = {
    overview: "Visão geral", professionals: "Profissionais",
    users: "Usuários", bookings: "Agendamentos", commission: "Comissão",
    holidays: "Feriados", reports: "Denúncias", alice: "Alice IA",
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