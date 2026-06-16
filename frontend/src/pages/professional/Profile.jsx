import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Upload, CheckCircle, Clock, XCircle, AlertTriangle } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";
const SPECIALTIES = ["Cuidados domiciliares gerais","Pós-operatório / curativos","Paciente oncológico","Cuidados com idosos","Paciente pediátrico","UTI domiciliar"];
const STATES = ["SP","RJ","MG","RS","PR","BA","CE","GO","DF","SC","PE","Outro"];

const DOC_TYPES = [
  { key: "photo_id",   label: "Documento com foto (RG/CNH)",    note: "Frente e verso · JPG, PNG ou PDF" },
  { key: "diploma",    label: "Diploma ou certificado",          note: "Diploma de enfermagem ou certificado" },
  { key: "criminal",   label: "Antecedentes criminais",          note: "Emitido há menos de 90 dias" },
  { key: "selfie",     label: "Selfie com prova de vida",        note: "Selfie segurando o documento" },
  { key: "vaccination",label: "Carteira de vacinação (opcional)",note: "Hepatite B, tétano, etc." },
];

const DocStatusBadge = ({ status }) => {
  if (!status) return <span className="text-xs text-slate-400">Não enviado</span>;
  const map = {
    approved: { label: "Aprovado",  color: "bg-green-100 text-green-700", icon: <CheckCircle size={12} /> },
    pending:  { label: "Em análise",color: "bg-amber-100 text-amber-700",  icon: <Clock size={12} /> },
    rejected: { label: "Rejeitado", color: "bg-red-100 text-red-600",     icon: <XCircle size={12} /> },
  };
  const s = map[status] || map.pending;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${s.color}`}>
      {s.icon} {s.label}
    </span>
  );
};

const UploadZone = ({ docType, label, note, existingDoc, onUploaded }) => {
  const [uploading, setUploading] = useState(false);
  const token   = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const handleChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Client-side validation
    const allowed = ["image/jpeg","image/png","image/jpg","application/pdf"];
    if (!allowed.includes(file.type)) { toast.error("Apenas JPG, PNG ou PDF."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo 10MB."); return; }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file",     file);
      formData.append("doc_type", docType);

      const { data } = await axios.post(`${API}/api/documents/upload`, formData, {
        headers: { ...headers, "Content-Type": "multipart/form-data" },
      });
      toast.success(`${label} enviado com sucesso!`);
      onUploaded(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao enviar documento.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-sm font-semibold text-navy">{label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{note}</p>
        </div>
        <DocStatusBadge status={existingDoc?.status} />
      </div>

      {existingDoc?.file_url && (
        <a href={existingDoc.file_url} target="_blank" rel="noreferrer"
          className="text-xs text-blue-500 hover:underline block mb-2">
          Ver documento enviado ↗
        </a>
      )}

      <label className={`flex items-center gap-2 cursor-pointer w-fit px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
        ${uploading ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}>
        <Upload size={13} />
        <input type="file" className="hidden" onChange={handleChange} accept=".jpg,.jpeg,.png,.pdf" disabled={uploading} />
        {uploading ? "Enviando..." : existingDoc ? "Reenviar" : "Enviar documento"}
      </label>
    </div>
  );
};

const VerificationBanner = ({ approvalStatus, hasAllDocs }) => {
  if (approvalStatus === "approved") return null;

  return (
    <div className={`rounded-xl p-4 mb-6 flex items-start gap-3
      ${approvalStatus === "rejected" ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"}`}>
      <AlertTriangle size={20} className={approvalStatus === "rejected" ? "text-red-500" : "text-amber-500"} />
      <div>
        <p className={`font-semibold text-sm ${approvalStatus === "rejected" ? "text-red-700" : "text-amber-700"}`}>
          {approvalStatus === "rejected" ? "Cadastro rejeitado" : "Conta pendente de verificação"}
        </p>
        <p className={`text-xs mt-0.5 ${approvalStatus === "rejected" ? "text-red-600" : "text-amber-600"}`}>
          {approvalStatus === "rejected"
            ? "Seus documentos foram rejeitados. Por favor reenvie documentos válidos abaixo."
            : !hasAllDocs
            ? "Envie todos os documentos obrigatórios abaixo para que nossa equipe possa analisar sua conta."
            : "Documentos enviados. Nossa equipe irá analisar em até 48 horas."}
        </p>
      </div>
    </div>
  );
};

const ProfessionalProfile = () => {
  const navigate  = useNavigate();
  const userId    = localStorage.getItem("user_id");
  const token     = localStorage.getItem("token");
  const headers   = { Authorization: `Bearer ${token}` };
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  const [user, setUser]   = useState({ full_name: "", phone: "", cpf: "", email: "" });
  const [prof, setProf]   = useState({ council_number: "", council_state: "", specialties: [], service_radius: 15, city: "", state: "", hourly_rate: "" });
  const [docs, setDocs]   = useState([]);
  const [approvalStatus, setApprovalStatus] = useState("pending");

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/users/${userId}`,            { headers }),
      axios.get(`${API}/api/professionals/${userId}`,    { headers }).catch(() => ({ data: {} })),
      axios.get(`${API}/api/documents/my-documents`,     { headers }).catch(() => ({ data: [] })),
    ]).then(([uRes, pRes, dRes]) => {
      setUser(uRes.data);
      if (pRes.data?.id) {
        setProf({ ...prof, ...pRes.data, specialties: pRes.data.specialties || [] });
        setApprovalStatus(pRes.data.approval_status || "pending");
      }
      setDocs(Array.isArray(dRes.data) ? dRes.data : []);
    }).catch(() => {
      setError("Erro ao carregar perfil.");
    }).finally(() => setLoading(false));
  }, [userId]);

  const setU = k => e => setUser(p => ({ ...p, [k]: e.target.value }));
  const setP = k => e => setProf(p => ({ ...p, [k]: e.target.value }));

  const toggleSpecialty = (s) => {
    setProf(p => ({
      ...p,
      specialties: p.specialties.includes(s)
        ? p.specialties.filter(x => x !== s)
        : [...p.specialties, s],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await axios.patch(`${API}/api/users/${userId}`, {
        full_name: user.full_name, phone: user.phone, cpf: user.cpf,
      }, { headers });
      await axios.patch(`${API}/api/users/${userId}/professional-profile`, {
        council_number: prof.council_number,
        council_state:  prof.council_state,
        specialties:    prof.specialties,
        service_radius: parseInt(prof.service_radius) || 15,
        city:           prof.city,
        state:          prof.state,
        hourly_rate:    parseFloat(prof.hourly_rate) || null,
      }, { headers });
      localStorage.setItem("full_name", user.full_name);
      toast.success("Perfil atualizado!");
    } catch {
      setError("Erro ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  };

  const getDoc = (type) => docs.find(d => d.doc_type === type);
  const requiredDocs = ["photo_id","diploma","criminal","selfie"];
  const hasAllDocs = requiredDocs.every(t => docs.some(d => d.doc_type === t && d.file_url));

  const handleDocUploaded = (newDoc) => {
    setDocs(prev => {
      const exists = prev.findIndex(d => d.doc_type === newDoc.doc_type);
      if (exists >= 0) {
        const updated = [...prev];
        updated[exists] = { ...updated[exists], ...newDoc };
        return updated;
      }
      return [...prev, newDoc];
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" />
        <div className="flex items-center gap-3"><LanguageSwitcher /><ProfileMenu /></div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={() => navigate("/dashboard/professional")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-500 mb-6 transition-colors">
          <ArrowLeft size={16} /> Voltar ao dashboard
        </button>
        <h1 className="font-display text-2xl font-bold text-navy mb-6">Meu perfil</h1>

        {loading ? (
          <p className="text-slate-400 text-center py-10">Carregando...</p>
        ) : (
          <div className="space-y-5">

            {/* Verification banner */}
            <VerificationBanner approvalStatus={approvalStatus} hasAllDocs={hasAllDocs} />

            {/* Personal info */}
            <div className="card p-6">
              <h3 className="font-semibold text-navy mb-4">Informações pessoais</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="form-label">Nome completo</label><input className="form-input" value={user.full_name} onChange={setU("full_name")} /></div>
                <div><label className="form-label">CPF</label><input className="form-input" value={user.cpf || ""} onChange={setU("cpf")} /></div>
                <div><label className="form-label">E-mail</label><input className="form-input bg-slate-50 text-slate-400 cursor-not-allowed" value={user.email} readOnly /></div>
                <div><label className="form-label">WhatsApp</label><input className="form-input" value={user.phone || ""} onChange={setU("phone")} placeholder="(11) 99999-9999" /></div>
              </div>
            </div>

            {/* Professional details */}
            <div className="card p-6">
              <h3 className="font-semibold text-navy mb-4">Dados profissionais</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div><label className="form-label">Nº COREN</label><input className="form-input" value={prof.council_number || ""} onChange={setP("council_number")} placeholder="123456" /></div>
                <div>
                  <label className="form-label">Estado COREN</label>
                  <select className="form-input" value={prof.council_state || ""} onChange={setP("council_state")}>
                    <option value="">Selecione...</option>
                    {STATES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="form-label">Cidade</label><input className="form-input" value={prof.city || ""} onChange={setP("city")} /></div>
                <div>
                  <label className="form-label">Estado</label>
                  <select className="form-input" value={prof.state || ""} onChange={setP("state")}>
                    <option value="">Selecione...</option>
                    {STATES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="form-label">Raio de atendimento (km)</label><input className="form-input" type="number" value={prof.service_radius || 15} onChange={setP("service_radius")} /></div>
                <div><label className="form-label">Valor/hora (R$)</label><input className="form-input" type="number" value={prof.hourly_rate || ""} onChange={setP("hourly_rate")} placeholder="120" /></div>
              </div>
              <div>
                <label className="form-label">Especialidades</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {SPECIALTIES.map(s => (
                    <button key={s} type="button" onClick={() => toggleSpecialty(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors
                        ${prof.specialties?.includes(s) ? "bg-blue-500 text-white border-blue-500" : "border-slate-200 text-slate-600 hover:border-blue-400"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Documents */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-navy">Documentos</h3>
                {hasAllDocs && approvalStatus === "pending" && (
                  <span className="text-xs text-amber-600 font-medium">Em análise pela equipe</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Envie todos os documentos obrigatórios para que sua conta seja aprovada.
              </p>
              <div className="space-y-3">
                {DOC_TYPES.map(({ key, label, note }) => (
                  <UploadZone
                    key={key}
                    docType={key}
                    label={label}
                    note={note}
                    existingDoc={getDoc(key)}
                    onUploaded={handleDocUploaded}
                  />
                ))}
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium">
                {error}
              </div>
            )}

            <button onClick={handleSave} disabled={saving}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60">
              <Save size={16} /> {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfessionalProfile;