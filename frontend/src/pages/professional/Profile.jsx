import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Upload, CheckCircle, Clock, XCircle, AlertTriangle, Trash2 } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";
import VerificationCenter from "../../components/common/VerificationCenter";
import AvailabilityCalendar from "../../components/professional/AvailabilityCalendar";

const API    = process.env.REACT_APP_API_URL || "http://localhost:8000";
const STATES = ["SP","RJ","MG","RS","PR","BA","CE","GO","DF","SC","PE","Outro"];
const MARKUP_OPTIONS = [0,5,10,15,20,25,30];

const DOC_TYPES = [
  {key:"photo_id",       label:"Documento com foto (RG/CNH)",    note:"Frente e verso · JPG, PNG ou PDF"},
  {key:"diploma",        label:"Diploma ou certificado",          note:"Diploma de enfermagem ou certificado"},
  {key:"coren_negative", label:"Certidão Negativa COREN",        note:"Certidão Única Negativa emitida pelo COREN", nursingOnly:true},
  {key:"criminal",       label:"Antecedentes criminais",          note:"Emitido há menos de 90 dias"},
  {key:"selfie",         label:"Selfie com prova de vida",        note:"Selfie segurando o documento"},
  {key:"vaccination",    label:"Carteira de vacinação (opcional)",note:"Hepatite B, tétano, etc."},
];

const DocStatusBadge = ({status}) => {
  if (!status) return <span className="text-xs text-slate-400">Não enviado</span>;
  const map = {
    approved:{label:"Aprovado", color:"bg-green-100 text-green-700", icon:<CheckCircle size={12}/>},
    pending: {label:"Em análise",color:"bg-amber-100 text-amber-700",icon:<Clock size={12}/>},
    rejected:{label:"Rejeitado",color:"bg-red-100 text-red-600",    icon:<XCircle size={12}/>},
  };
  const s = map[status]||map.pending;
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${s.color}`}>{s.icon}{s.label}</span>;
};

const UploadZone = ({docType,label,note,existingDoc,onUploaded,onDeleted}) => {
  const [uploading,setUploading] = useState(false);
  const [deleting,setDeleting] = useState(false);
  const token   = localStorage.getItem("token");
  const headers = {Authorization:`Bearer ${token}`};

  const handleChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = ["image/jpeg","image/png","image/jpg","application/pdf"];
    if (!allowed.includes(file.type)) { toast.error("Apenas JPG, PNG ou PDF."); return; }
    if (file.size > 10*1024*1024)     { toast.error("Arquivo muito grande. Máximo 10MB."); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("doc_type", docType);
      const {data} = await axios.post(`${API}/api/documents/upload`, formData, {
        headers:{...headers,"Content-Type":"multipart/form-data"},
      });
      if (!data || !data.id) { toast.error("Upload falhou: resposta inválida. Tente novamente."); setUploading(false); return; }
      toast.success(`${label} enviado!`);
      onUploaded(data);
    } catch(err) {
      const status = err.response?.status; const detail = err.response?.data?.detail || err.message;
      console.error(`[48b] Upload failed: doc_type=${docType}, status=${status}, detail=${detail}`);
      toast.error(`Falha no envio (${status||"rede"}): ${detail||"tente novamente"}`);
    } finally { setUploading(false); }
  };

  const handleDelete = async () => {
    if (!existingDoc?.id) return;
    if (!window.confirm(`Tem certeza que deseja excluir "${label}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    try {
      const {data} = await axios.delete(`${API}/api/documents/${existingDoc.id}`, {headers});
      toast.success(data.message || "Documento excluído.");
      onDeleted?.(existingDoc.id);
    } catch(err) {
      toast.error(err.response?.data?.detail || "Erro ao excluir documento.");
    } finally { setDeleting(false); }
  };

  const canDelete = existingDoc && existingDoc.status !== "approved";

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div><p className="text-sm font-semibold text-navy">{label}</p><p className="text-xs text-slate-500 mt-0.5">{note}</p></div>
        <DocStatusBadge status={existingDoc?.status}/>
      </div>
      {existingDoc?.file_url && !existingDoc.file_url.includes("placeholder.com") && (
        <a href={existingDoc.file_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline block mb-2">Ver documento ↗</a>
      )}
      {existingDoc?.status === "rejected" && existingDoc?.rejection_reason && (
        <div className="flex items-start gap-2 p-2 mb-2 bg-red-50 border border-red-200 rounded-lg">
          <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5"/>
          <p className="text-xs text-red-600"><span className="font-semibold">Motivo da rejeição:</span> {existingDoc.rejection_reason}</p>
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className={`flex items-center gap-2 cursor-pointer w-fit px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
          uploading?"bg-slate-200 text-slate-400 cursor-not-allowed":"bg-blue-100 text-blue-700 hover:bg-blue-200"}`}>
          <Upload size={13}/>
          <input type="file" className="hidden" onChange={(e) => {
            if (existingDoc && !window.confirm("Deseja substituir o documento atual? O documento antigo será sobrescrito.")) {
              e.target.value = ""; return;
            }
            handleChange(e);
          }} accept=".jpg,.jpeg,.png,.pdf" disabled={uploading}/>
          {uploading?"Enviando...":existingDoc?"⟳ Substituir":"Enviar documento"}
        </label>
        {canDelete && (
          <button onClick={handleDelete} disabled={deleting}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition-colors">
            <Trash2 size={12}/> {deleting?"...":"Excluir"}
          </button>
        )}
      </div>
    </div>
  );
};

const VerificationBanner = ({approvalStatus,hasAllDocs,docs=[]}) => {
  if (approvalStatus==="approved") return null;
  const rejectedDocs = docs.filter(d=>d.status==="rejected");
  const approvedDocs = docs.filter(d=>d.status==="approved");
  return (
    <div className={`rounded-xl p-4 mb-6 flex items-start gap-3 ${
      approvalStatus==="rejected"||rejectedDocs.length>0?"bg-red-50 border border-red-200":"bg-amber-50 border border-amber-200"}`}>
      <AlertTriangle size={20} className={approvalStatus==="rejected"||rejectedDocs.length>0?"text-red-500":"text-amber-500"}/>
      <div>
        <p className={`font-semibold text-sm ${approvalStatus==="rejected"||rejectedDocs.length>0?"text-red-700":"text-amber-700"}`}>
          {rejectedDocs.length>0?`${rejectedDocs.length} documento(s) rejeitado(s)`
            :approvalStatus==="rejected"?"Cadastro rejeitado":"Conta pendente de verificação"}
        </p>
        <p className={`text-xs mt-0.5 ${approvalStatus==="rejected"||rejectedDocs.length>0?"text-red-600":"text-amber-600"}`}>
          {rejectedDocs.length>0
            ?"Corrija e reenvie os documentos rejeitados abaixo. Veja o motivo da rejeição em cada documento."
            :!hasAllDocs
            ?"Envie todos os documentos obrigatórios abaixo para que nossa equipe analise sua conta."
            :"Documentos enviados. Nossa equipe irá analisar em até 48 horas."}
        </p>
        {approvedDocs.length>0 && (
          <p className="text-xs text-green-600 mt-1">{approvedDocs.length} de 4 documentos aprovados</p>
        )}
      </div>
    </div>
  );
};

const CAREGIVER_TERMS = "Eu entendo que, ao aceitar atendimentos como Cuidador(a), prestarei exclusivamente cuidados não-técnicos (companhia, auxílio à mobilidade, cuidados pessoais) e não realizarei procedimentos técnicos de enfermagem durante este atendimento.";

const CategorySwitch = ({ userId, currentRole }) => {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const [catData, setCatData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [independentMode, setIndependentMode] = useState(false);
  const [indCorenNum, setIndCorenNum] = useState("");
  const [indCorenState, setIndCorenState] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState("");

  const ROLE_LABELS_CAT = { nurse: "Enfermeiro(a)", technician: "Técnico(a)", nursing_assistant: "Auxiliar", caregiver: "Cuidador(a)" };
  const VERIFY_COLOR = { approved: "bg-green-100 text-green-700", pending: "bg-amber-100 text-amber-700", rejected: "bg-red-100 text-red-600" };

  const loadCategories = () => {
    axios.get(`${API}/api/professionals/categories`, { headers })
      .then(r => setCatData(r.data))
      .catch(() => setCatData({ original_role: currentRole, active_category: currentRole, available_to_add: [], categories: [] }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadCategories(); }, []);

  const handleSwitch = async (target) => {
    if (target !== currentRole && !accepted) { toast.error("Aceite os termos para atuar nesta categoria."); return; }
    setSwitching(true); setBlocked(false);
    try {
      const { data } = await axios.post(`${API}/api/professionals/switch-category`, {
        target_category: target, accept_terms: true,
      }, { headers });
      toast.success(data.message);
      setAccepted(false); setSelectedTarget(null);
      loadCategories();
    } catch (err) {
      const msg = err.response?.data?.detail || "Erro ao trocar categoria.";
      if (msg.includes("pendentes") || msg.includes("Conclua")) { setBlocked(true); setBlockReason(msg); }
      toast.error(msg);
    } finally { setSwitching(false); }
  };

  const handleDeactivate = async (cat) => {
    try {
      const { data } = await axios.post(`${API}/api/professionals/category/${cat}/deactivate`, {}, { headers });
      toast.success(data.message); loadCategories();
    } catch (err) { toast.error(err.response?.data?.detail || "Erro."); }
  };

  const handleReactivate = async (cat) => {
    try {
      const { data } = await axios.post(`${API}/api/professionals/category/${cat}/reactivate`, {}, { headers });
      toast.success(data.message); loadCategories();
    } catch (err) { toast.error(err.response?.data?.detail || "Erro."); }
  };

  if (loading || !catData) return null;

  return (
    <div className="card p-6" id="categories">
      <h3 className="font-semibold text-navy mb-1">Categorias profissionais</h3>
      <p className="text-xs text-slate-500 mb-4">Gerencie suas categorias de atuação. Sua categoria principal é {ROLE_LABELS_CAT[currentRole] || currentRole}.</p>

      {/* 45h: Category records list */}
      <div className="space-y-2 mb-4">
        {/* Primary role — always shown */}
        <div className={`p-3 rounded-xl border-2 ${catData.active_category === currentRole ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-navy">{ROLE_LABELS_CAT[currentRole]}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Principal</span>
              {catData.active_category === currentRole && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Ativa</span>}
            </div>
            {catData.active_category !== currentRole && (
              <button onClick={() => handleSwitch(currentRole)} className="text-xs text-blue-600 font-semibold hover:underline">Ativar</button>
            )}
          </div>
        </div>

        {/* Additional category records */}
        {(catData.categories || []).map(cat => (
          <div key={cat.role} className={`p-3 rounded-xl border-2 ${
            catData.active_category === cat.role ? "border-green-500 bg-green-50" :
            !cat.is_active ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200"}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-navy">{ROLE_LABELS_CAT[cat.role] || cat.role}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${VERIFY_COLOR[cat.verification_status] || VERIFY_COLOR.pending}`}>
                    {cat.verification_status === "approved" ? "✓ Verificado" : cat.verification_status === "rejected" ? "✗ Rejeitado" : "⏳ Pendente"}
                  </span>
                  {catData.active_category === cat.role && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Ativa</span>}
                  {!cat.is_active && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">Desativada</span>}
                </div>
                <p className="text-xs text-slate-500">Diurno: R${cat.rate_day}/h · Noturno: R${cat.rate_night}/h</p>
              </div>
              <div className="flex gap-1.5">
                {cat.is_active && catData.active_category !== cat.role && (
                  <button onClick={() => { setSelectedTarget(cat.role); setAccepted(false); }} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 font-semibold hover:bg-blue-100">Ativar</button>
                )}
                {cat.is_active && cat.role !== currentRole && (
                  <button onClick={() => handleDeactivate(cat.role)} className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500 font-semibold hover:bg-red-100">Desativar</button>
                )}
                {!cat.is_active && (
                  <button onClick={() => handleReactivate(cat.role)} className="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-600 font-semibold hover:bg-green-100">Reativar</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add new category — derived (terms only) or independent (needs docs) */}
      {catData.available_to_add?.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-500 mb-2">Adicionar categoria:</p>
          <div className="flex flex-wrap gap-2">
            {catData.available_to_add.map(cat => (
              <button key={cat} onClick={() => { setSelectedTarget(cat); setAccepted(false); setIndependentMode(false); }}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-semibold hover:bg-blue-100">
                + {ROLE_LABELS_CAT[cat] || cat}
              </button>
            ))}
          </div>
          {/* 45d: Independent category — roles NOT in derived list */}
          {["nurse","technician","nursing_assistant","caregiver"].filter(c =>
            c !== currentRole && !(catData.available_to_add || []).includes(c) && !(catData.categories || []).some(r => r.role === c)
          ).length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-slate-400 mb-1">Categoria independente (requer documentos adicionais):</p>
              <div className="flex flex-wrap gap-2">
                {["nurse","technician","nursing_assistant","caregiver"].filter(c =>
                  c !== currentRole && !(catData.available_to_add || []).includes(c) && !(catData.categories || []).some(r => r.role === c)
                ).map(cat => (
                  <button key={cat} onClick={() => { setSelectedTarget(cat); setAccepted(false); setIndependentMode(true); }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 font-semibold hover:bg-purple-100">
                    + {ROLE_LABELS_CAT[cat] || cat} (independente)
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Terms acceptance for derived switching */}
      {selectedTarget && !independentMode && selectedTarget !== currentRole && (
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 mb-3">
          <p className="text-sm font-semibold text-navy mb-2">Termos para {ROLE_LABELS_CAT[selectedTarget] || selectedTarget}</p>
          <label className="flex items-start gap-3 cursor-pointer mb-3">
            <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} className="accent-blue-500 mt-0.5" />
            <span className="text-xs text-slate-600">Eu confirmo que entendo o escopo de atuação desta categoria e atuarei dentro dos limites permitidos.</span>
          </label>
          <div className="flex gap-2">
            <button onClick={() => setSelectedTarget(null)} className="btn-outline text-xs flex-1">Cancelar</button>
            <button onClick={() => handleSwitch(selectedTarget)} disabled={!accepted || switching}
              className="btn-primary text-xs flex-1 disabled:opacity-50">{switching ? "..." : "Confirmar"}</button>
          </div>
        </div>
      )}

      {/* 45d: Independent category — shows doc requirements */}
      {selectedTarget && independentMode && (
        <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 mb-3">
          <p className="text-sm font-semibold text-navy mb-2">Adicionar {ROLE_LABELS_CAT[selectedTarget]} (categoria independente)</p>
          <p className="text-xs text-slate-500 mb-3">Esta categoria requer documentação própria. Após adicionar, envie os documentos para verificação.</p>
          {selectedTarget !== "caregiver" && (
            <div className="space-y-2 mb-3">
              <input className="form-input text-sm" placeholder="Número COREN para esta categoria" value={indCorenNum} onChange={e => setIndCorenNum(e.target.value)} />
              <input className="form-input text-sm" placeholder="Estado (ex: SP)" value={indCorenState} onChange={e => setIndCorenState(e.target.value)} maxLength={2} />
            </div>
          )}
          <label className="flex items-start gap-3 cursor-pointer mb-3">
            <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} className="accent-blue-500 mt-0.5" />
            <span className="text-xs text-slate-600">Eu confirmo que possuo formação e registro válido para esta categoria.</span>
          </label>
          <div className="flex gap-2">
            <button onClick={() => { setSelectedTarget(null); setIndependentMode(false); }} className="btn-outline text-xs flex-1">Cancelar</button>
            <button onClick={async () => {
              if (!accepted) { toast.error("Aceite os termos."); return; }
              setSwitching(true);
              try {
                const { data } = await axios.post(`${API}/api/professionals/add-independent-category`, {
                  category: selectedTarget, accept_terms: true,
                  council_number: indCorenNum || null, council_state: indCorenState || null,
                }, { headers });
                toast.success(data.message);
                setSelectedTarget(null); setIndependentMode(false);
                loadCategories();
              } catch (err) { toast.error(err.response?.data?.detail || "Erro."); }
              finally { setSwitching(false); }
            }} disabled={!accepted || switching}
              className="btn-primary text-xs flex-1 disabled:opacity-50">{switching ? "..." : "Adicionar categoria"}</button>
          </div>
        </div>
      )}

      {blocked && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5"/>
          <p className="text-xs text-amber-700">{blockReason}</p>
        </div>
      )}
    </div>
  );
};

const ProfessionalProfile = () => {
  const navigate  = useNavigate();
  const userId    = localStorage.getItem("user_id");
  const role      = localStorage.getItem("role");
  const token     = localStorage.getItem("token");
  const headers   = {Authorization:`Bearer ${token}`};

  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState("");
  const [servicesMap,    setServicesMap]     = useState({});
  const [user,           setUser]           = useState({full_name:"",phone:"",cpf:"",email:""});
  const [prof,           setProf]           = useState({council_number:"",council_state:"",services_offered:[],specialties:[],service_radius:15,city:"",state:"",markup_pct:0});
  const [docs,           setDocs]           = useState([]);
  const [approvalStatus, setApprovalStatus] = useState("pending");
  const [pricingTable,   setPricingTable]   = useState(null);
  const [specialtiesOptions, setSpecialtiesOptions] = useState([]);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/professionals/services`),
      axios.get(`${API}/api/users/${userId}`, {headers}),
      axios.get(`${API}/api/professionals/${userId}`, {headers}).catch(()=>({data:{}})),
      axios.get(`${API}/api/documents/my-documents`, {headers}).catch(()=>({data:[]})),
    ]).then(([svcRes,uRes,pRes,dRes]) => {
      setServicesMap(svcRes.data);
      setUser(uRes.data);
      // Fetch pricing table for this role
      if (uRes.data.role && uRes.data.role !== "client" && uRes.data.role !== "admin") {
        axios.get(`${API}/api/professionals/pricing-table/${uRes.data.role}`).then(r => setPricingTable(r.data)).catch(()=>{});
        axios.get(`${API}/api/professionals/specialties/${uRes.data.role}`).then(r => setSpecialtiesOptions(r.data.specialties||[])).catch(()=>{});
      }
      if (pRes.data?.id) {
        setProf({
          council_number:   pRes.data.council_number||"",
          council_state:    pRes.data.council_state||"",
          services_offered: pRes.data.services_offered||[],
          service_radius:   pRes.data.service_radius||15,
          city:             pRes.data.city||"",
          state:            pRes.data.state||"",
          markup_pct:       pRes.data.markup_pct||0,
        });
        setApprovalStatus(pRes.data.approval_status||"pending");
      }
      setDocs(Array.isArray(dRes.data)?dRes.data:[]);
    }).catch(()=>setError("Erro ao carregar perfil."))
    .finally(()=>setLoading(false));
  },[userId]);

  const setU = k => e => setUser(p=>({...p,[k]:e.target.value}));
  const setP = k => e => setProf(p=>({...p,[k]:e.target.value}));

  const toggleService = (svc) => {
    setProf(p=>({
      ...p,
      services_offered: p.services_offered.includes(svc)
        ? p.services_offered.filter(s=>s!==svc)
        : [...p.services_offered, svc]
    }));
  };

  // Services available for this role
  const availableServices = servicesMap[role] || [];

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      await axios.patch(`${API}/api/users/${userId}`, {full_name:user.full_name,phone:user.phone,cpf:user.cpf}, {headers});
      await axios.patch(`${API}/api/users/${userId}/professional-profile`, {
        council_number:   prof.council_number,
        council_state:    prof.council_state,
        services_offered: prof.services_offered,
        service_radius:   parseInt(prof.service_radius)||15,
        city:             prof.city,
        state:            prof.state,
        markup_pct:       parseInt(prof.markup_pct)||0,
      }, {headers});
      localStorage.setItem("full_name", user.full_name);
      toast.success("Perfil atualizado!");
    } catch { setError("Erro ao salvar perfil."); }
    finally { setSaving(false); }
  };

  const getDoc = (type) => docs.find(d=>d.doc_type===type);
  const isNursingRole = ["nurse","technician","nursing_assistant"].includes(role);
  const requiredDocs = isNursingRole ? ["photo_id","diploma","criminal","selfie","coren_negative"] : ["photo_id","diploma","criminal","selfie"];
  const filteredDocTypes = DOC_TYPES.filter(d => !d.nursingOnly || isNursingRole);
  const hasAllDocs   = requiredDocs.every(t=>docs.some(d=>d.doc_type===t&&d.file_url));
  const handleDocUploaded = (newDoc) => {
    setDocs(prev => {
      const idx = prev.findIndex(d=>d.doc_type===newDoc.doc_type);
      if (idx>=0) { const u=[...prev]; u[idx]={...u[idx],...newDoc}; return u; }
      return [...prev,newDoc];
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm"/>
        <div className="flex items-center gap-3"><LanguageSwitcher/><ProfileMenu/></div>
      </nav>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={()=>navigate("/dashboard/professional")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-500 mb-6 transition-colors">
          <ArrowLeft size={16}/> Voltar ao dashboard
        </button>
        <h1 className="font-display text-2xl font-bold text-navy mb-6">Meu perfil</h1>

        {loading ? (
          <p className="text-slate-400 text-center py-10">Carregando...</p>
        ) : (
          <div className="space-y-5">
            <VerificationBanner approvalStatus={approvalStatus} hasAllDocs={hasAllDocs} docs={docs}/>
            <VerificationCenter role={role} userId={userId} />

            {/* Personal info */}
            <div className="card p-6">
              <h3 className="font-semibold text-navy mb-4">Informações pessoais</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="form-label">Nome completo</label><input className="form-input" value={user.full_name} onChange={setU("full_name")}/></div>
                <div><label className="form-label">CPF</label><input className="form-input" value={user.cpf||""} onChange={setU("cpf")}/></div>
                <div><label className="form-label">E-mail</label><input className="form-input bg-slate-50 text-slate-400 cursor-not-allowed" value={user.email} readOnly/></div>
                <div><label className="form-label">WhatsApp</label><input className="form-input" value={user.phone||""} onChange={setU("phone")} placeholder="(11) 99999-9999"/></div>
              </div>
            </div>

            {/* Professional details */}
            <div className="card p-6">
              <h3 className="font-semibold text-navy mb-4">Dados profissionais</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div><label className="form-label">Nº COREN</label><input className="form-input" value={prof.council_number} onChange={setP("council_number")} placeholder="123456"/></div>
                <div>
                  <label className="form-label">Estado COREN</label>
                  <select className="form-input" value={prof.council_state} onChange={setP("council_state")}>
                    <option value="">Selecione...</option>
                    {STATES.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="form-label">Cidade</label><input className="form-input" value={prof.city} onChange={setP("city")}/></div>
                <div>
                  <label className="form-label">Estado</label>
                  <select className="form-input" value={prof.state} onChange={setP("state")}>
                    <option value="">Selecione...</option>
                    {STATES.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="form-label">Raio de atendimento (km)</label><input className="form-input" type="number" value={prof.service_radius} onChange={setP("service_radius")}/></div>
              </div>

              {/* Specialties */}
              {specialtiesOptions.length > 0 && (
                <div className="mt-4">
                  <label className="form-label">Áreas de atuação / Especialidades</label>
                  <p className="text-xs text-slate-400 mb-2">Selecione suas áreas de experiência — elas aparecerão no seu perfil para clientes.</p>
                  <div className="space-y-1">
                    {specialtiesOptions.map(spec => {
                      const selected = (prof.specialties || []).includes(spec);
                      return (
                        <label key={spec} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                          <input type="checkbox" checked={selected} onChange={() => {
                            const current = prof.specialties || [];
                            const updated = selected ? current.filter(s => s !== spec) : [...current, spec];
                            setProf(p => ({ ...p, specialties: updated }));
                          }} className="w-4 h-4 accent-blue-500 flex-shrink-0"/>
                          <span className={`text-sm ${selected ? "text-navy font-medium" : "text-slate-600"}`}>{spec}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <label className="form-label">Meu acréscimo sobre o mínimo</label>
                <select className="form-input" value={prof.markup_pct} onChange={setP("markup_pct")}>
                  {MARKUP_OPTIONS.map(m=>(
                    <option key={m} value={m}>{m===0?"Valor mínimo (sem acréscimo)":`+${m}% acima do mínimo`}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">O valor mínimo é definido pela plataforma</p>
              </div>

              {/* Platform pricing table */}
              {pricingTable && (
                <div className="mt-6">
                  <label className="form-label">Suas taxas por hora</label>
                  <p className="text-xs text-slate-400 mb-3">Valores que você recebe por hora (após comissão da plataforma de 12%). Seu acréscimo: +{prof.markup_pct||0}%</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                      <p className="text-xs font-semibold text-amber-600 uppercase mb-1">Diurno (06h–22h)</p>
                      <p className="text-xl font-bold text-navy">R$ {((pricingTable.day_rate * (1 + (prof.markup_pct||0)/100)) * 0.88).toFixed(2)}<span className="text-xs text-slate-400">/hora</span></p>
                      <p className="text-[10px] text-slate-400 mt-1">Base: R${pricingTable.day_rate}/h + {prof.markup_pct||0}% − 12% comissão</p>
                    </div>
                    <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200">
                      <p className="text-xs font-semibold text-indigo-600 uppercase mb-1">Noturno (22h–06h)</p>
                      <p className="text-xl font-bold text-navy">R$ {((pricingTable.night_rate * (1 + (prof.markup_pct||0)/100)) * 0.88).toFixed(2)}<span className="text-xs text-slate-400">/hora</span></p>
                      <p className="text-[10px] text-slate-400 mt-1">Base: R${pricingTable.night_rate}/h + {prof.markup_pct||0}% − 12% comissão</p>
                    </div>
                  </div>
                  <div className="mt-3 p-3 rounded-xl bg-green-50 border border-green-200">
                    <p className="text-xs font-semibold text-green-600 uppercase mb-1">Taxa inicial de serviço</p>
                    <p className="text-lg font-bold text-navy">R$ {pricingTable.initial_fee?.toFixed(2)} <span className="text-xs text-slate-400">(primeiras 2h inclusas)</span></p>
                  </div>
                </div>
              )}

              {/* Services offered */}
              <div>
                <label className="form-label">Serviços que ofereço</label>
                <p className="text-xs text-slate-400 mb-3">Selecione apenas os serviços que você está habilitado e confortável em realizar</p>
                {availableServices.length===0 ? (
                  <p className="text-slate-400 text-sm">Carregando serviços...</p>
                ) : (
                  <div className="space-y-4">
                    {[
                      {label:"Cuidados básicos",svcs:servicesMap.caregiver||[]},
                      {label:"Cuidados básicos de enfermagem",svcs:(servicesMap.nursing_assistant||[]).filter(s=>!(servicesMap.caregiver||[]).includes(s))},
                      {label:"Procedimentos técnicos",svcs:(servicesMap.technician||[]).filter(s=>!(servicesMap.nursing_assistant||[]).includes(s))},
                      {label:"Procedimentos especializados",svcs:(servicesMap.nurse||[]).filter(s=>!(servicesMap.technician||[]).includes(s))},
                    ].filter(g=>g.svcs.some(s=>availableServices.includes(s))).map(group=>(
                      <div key={group.label}>
                        <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">{group.label}</p>
                        <div className="flex flex-wrap gap-2">
                          {group.svcs.filter(s=>availableServices.includes(s)).map(svc=>(
                            <button key={svc} type="button" onClick={()=>toggleService(svc)}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                prof.services_offered.includes(svc)
                                  ?"bg-blue-500 text-white border-blue-500"
                                  :"border-slate-200 text-slate-600 hover:border-blue-400"
                              }`}>{svc}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {prof.services_offered.length>0 && (
                  <p className="text-xs text-blue-600 mt-3 font-medium">✓ {prof.services_offered.length} serviço(s) selecionado(s)</p>
                )}
              </div>
            </div>

            {/* Availability Calendar */}
            <div className="card p-6">
              <AvailabilityCalendar userId={userId} />
            </div>

            {/* Category Switch (V9-6 / Change 43) */}
            {["nurse","technician","nursing_assistant"].includes(role) && (
              <CategorySwitch userId={userId} currentRole={role} />
            )}

            {/* Documents */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-navy">Documentos</h3>
                {hasAllDocs && approvalStatus==="pending" && (
                  <span className="text-xs text-amber-600 font-medium">Em análise pela equipe</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-4">Envie todos os documentos obrigatórios para aprovação da conta.</p>
              <div className="space-y-3">
                {filteredDocTypes.map(({key,label,note})=>(
                  <UploadZone key={key} docType={key} label={label} note={note}
                    existingDoc={getDoc(key)} onUploaded={handleDocUploaded}
                    onDeleted={() => { setDocs(prev => prev.filter(d => d.doc_type !== key)); }}/>
                ))}
              </div>
            </div>

            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium">{error}</div>}

            <button onClick={handleSave} disabled={saving}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60">
              <Save size={16}/>{saving?"Salvando...":"Salvar alterações"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfessionalProfile;