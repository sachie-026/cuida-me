import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const ClientProfile = () => {
  const navigate  = useNavigate();
  const userId    = localStorage.getItem("user_id");
  const token     = localStorage.getItem("token");
  const headers   = { Authorization: `Bearer ${token}` };
  const [loading, setLoading]  = useState(true);
  const [saving,  setSaving]   = useState(false);

  const [user, setUser] = useState({ full_name: "", phone: "", cpf: "", email: "" });
  const [patient, setPatient] = useState({
    patient_name: "", age: "", relation: "", diagnoses: "", allergies: "", medications: "", address: ""
  });

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/users/${userId}`, { headers }),
      axios.get(`${API}/api/users/${userId}/patient`, { headers }).catch(() => ({ data: null })),
    ]).then(([uRes, pRes]) => {
      setUser(uRes.data);
      if (pRes.data) setPatient(pRes.data);
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
      await axios.patch(`${API}/api/users/${userId}/patient`, {
        patient_name: patient.patient_name, age: parseInt(patient.age),
        relation: patient.relation, diagnoses: patient.diagnoses,
        allergies: patient.allergies, medications: patient.medications,
        address: patient.address,
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

            {/* Patient info */}
            <div className="card p-6">
              <h3 className="font-semibold text-navy mb-4">Dados do paciente</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div><label className="form-label">Nome do paciente</label><input className="form-input" value={patient.patient_name || ""} onChange={setP("patient_name")} /></div>
                <div><label className="form-label">Idade</label><input className="form-input" type="number" value={patient.age || ""} onChange={setP("age")} /></div>
                <div>
                  <label className="form-label">Relação</label>
                  <select className="form-input" value={patient.relation || ""} onChange={setP("relation")}>
                    <option value="">Selecione...</option>
                    {["Filho(a)","Cônjuge","Próprio paciente","Outro familiar"].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div><label className="form-label">Endereço</label><input className="form-input" value={patient.address || ""} onChange={setP("address")} /></div>
              </div>
              <div className="mb-4"><label className="form-label">Diagnósticos</label><textarea className="form-input min-h-[70px]" value={patient.diagnoses || ""} onChange={setP("diagnoses")} /></div>
              <div className="mb-4"><label className="form-label">Alergias</label><textarea className="form-input min-h-[60px]" value={patient.allergies || ""} onChange={setP("allergies")} /></div>
              <div><label className="form-label">Medicamentos em uso</label><textarea className="form-input min-h-[60px]" value={patient.medications || ""} onChange={setP("medications")} /></div>
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