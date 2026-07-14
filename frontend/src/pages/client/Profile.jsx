import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Upload, CheckCircle, AlertTriangle } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";
import VerificationCenter from "../../components/common/VerificationCenter";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const ClientProfile = () => {
  const navigate  = useNavigate();
  const userId    = localStorage.getItem("user_id");
  const token     = localStorage.getItem("token");
  const headers   = { Authorization: `Bearer ${token}` };
  const [loading, setLoading]      = useState(true);
  const [saving,  setSaving]       = useState(false);
  const [clientDocs, setClientDocs]= useState([]);
  const [docUploading, setDocUploading] = useState(false);

  const [user, setUser] = useState({ full_name: "", phone: "", cpf: "", email: "", is_verified: false });
  const [patient, setPatient] = useState({});

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/users/${userId}`, { headers }),
      axios.get(`${API}/api/users/${userId}/patient`, { headers }).catch(() => ({ data: null })),
      axios.get(`${API}/api/documents/my-documents`, { headers }).catch(() => ({ data: [] })),
    ]).then(([uRes, pRes, docRes]) => {
      setUser(uRes.data);
      if (pRes.data) setPatient(pRes.data);
      setClientDocs(Array.isArray(docRes.data) ? docRes.data : []);
    }).finally(() => setLoading(false));
  }, []);

  const setU = k => e => setUser(p => ({ ...p, [k]: e.target.value }));
  const setP = k => e => setPatient(p => ({ ...p, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/api/users/${userId}`, {
        full_name: user.full_name, phone: user.phone, cpf: user.cpf,
      }, { headers });
      localStorage.setItem("full_name", user.full_name);
      toast.success("Perfil atualizado!");
    } catch {
      toast.error("Erro ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" />
        <div className="flex items-center gap-3"><LanguageSwitcher /><ProfileMenu /></div>
      </nav>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={() => navigate("/dashboard/client")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-500 mb-6 transition-colors">
          <ArrowLeft size={16} /> Voltar ao dashboard
        </button>
        <h1 className="font-display text-2xl font-bold text-navy mb-6">Meu perfil</h1>

        {loading ? <p className="text-slate-400 text-center py-10">Carregando...</p> : (
          <div className="space-y-5">
            {/* Personal info */}
            <div className="card p-6">
              <h3 className="font-semibold text-navy mb-4">Informações pessoais</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="form-label">Nome completo</label><input className="form-input" value={user.full_name} onChange={setU("full_name")} /></div>
                <div><label className="form-label">CPF</label><input className="form-input" value={user.cpf || ""} onChange={setU("cpf")} /></div>
                <div><label className="form-label">E-mail</label><input className="form-input" value={user.email} disabled className="form-input bg-slate-50 text-slate-400 cursor-not-allowed" /></div>
                <div><label className="form-label">WhatsApp</label><input className="form-input" value={user.phone || ""} onChange={setU("phone")} placeholder="(11) 99999-9999" /></div>
              </div>
            </div>

            {/* Patient info — removed per suggestion: patient data moves to booking flow */}

            {/* Verification Center */}
            <VerificationCenter role="client" userId={userId} />

            {/* Client Identity Verification */}
            <div className="card p-6">
              <h3 className="font-semibold text-navy mb-2">Verificação de identidade</h3>
              <p className="text-xs text-slate-500 mb-4">Envie seus documentos para verificar sua identidade e poder agendar atendimentos.</p>
              {user.is_verified ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                  <CheckCircle size={16} className="text-green-500"/>
                  <span className="text-sm font-semibold text-green-700">✓ Identidade verificada</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-3">
                    <AlertTriangle size={16} className="text-amber-500"/>
                    <span className="text-xs text-amber-700 font-medium">Envie os documentos abaixo para completar sua verificação</span>
                  </div>
                  {[
                    {key:"client_id", label:"Documento com foto (RG/CNH)", note:"Frente e verso · JPG, PNG ou PDF"},
                    {key:"client_selfie", label:"Selfie segurando o documento", note:"Foto clara do rosto com documento visível"},
                  ].map(d => {
                    const existing = clientDocs.find(cd=>cd.doc_type===d.key);
                    return (
                      <div key={d.key} className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <p className="text-sm font-semibold text-navy">{d.label}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{d.note}</p>
                          </div>
                          {existing ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              existing.status==="approved"?"bg-green-100 text-green-700":existing.status==="rejected"?"bg-red-100 text-red-600":"bg-amber-100 text-amber-700"
                            }`}>{existing.status==="approved"?"✓ Aprovado":existing.status==="rejected"?"✗ Rejeitado":"⏳ Em análise"}</span>
                          ) : <span className="text-xs text-slate-400">Não enviado</span>}
                        </div>
                        {existing?.status==="rejected" && existing?.rejection_reason && (
                          <div className="flex items-start gap-2 p-2 mb-2 bg-red-50 border border-red-200 rounded-lg">
                            <span className="text-xs text-red-600"><strong>Motivo:</strong> {existing.rejection_reason}</span>
                          </div>
                        )}
                        <label className={`flex items-center gap-2 cursor-pointer w-fit px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          docUploading?"bg-slate-200 text-slate-400":"bg-blue-100 text-blue-700 hover:bg-blue-200"}`}>
                          <Upload size={13}/>
                          <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" disabled={docUploading} onChange={async(e)=>{
                            const file=e.target.files[0]; if(!file) return;
                            if(file.size>10*1024*1024){toast.error("Máximo 10MB.");return;}
                            setDocUploading(true);
                            try{
                              const fd=new FormData(); fd.append("file",file); fd.append("doc_type",d.key);
                              const{data}=await axios.post(`${API}/api/documents/upload`,fd,{headers:{...headers,"Content-Type":"multipart/form-data"}});
                              toast.success("Documento enviado!");
                              setClientDocs(prev=>{const idx=prev.findIndex(x=>x.doc_type===d.key);if(idx>=0){const u=[...prev];u[idx]={...u[idx],...data};return u;}return[...prev,data];});
                            }catch{toast.error("Erro ao enviar.");}finally{setDocUploading(false);}
                          }}/>
                          {docUploading?"Enviando...":existing?"Reenviar":"Enviar"}
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

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

export default ClientProfile;