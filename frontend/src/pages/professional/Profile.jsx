import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";
const SPECIALTIES = ["Cuidados domiciliares gerais","Pós-operatório / curativos","Paciente oncológico","Cuidados com idosos","Paciente pediátrico","UTI domiciliar"];
const STATES = ["SP","RJ","MG","RS","PR","BA","CE","GO","DF","SC","PE","Outro"];

const ProfessionalProfile = () => {
  const navigate  = useNavigate();
  const userId    = localStorage.getItem("user_id");
  const token     = localStorage.getItem("token");
  const headers   = { Authorization: `Bearer ${token}` };
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const [user, setUser]     = useState({ full_name: "", phone: "", cpf: "", email: "" });
  const [prof, setProf]     = useState({
    council_number: "", council_state: "", specialties: [],
    service_radius: 15, city: "", state: "", hourly_rate: "",
  });

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/users/${userId}`, { headers }),
      axios.get(`${API}/api/professionals/${userId}`, { headers }).catch(() => ({ data: {} })),
    ]).then(([uRes, pRes]) => {
      setUser(uRes.data);
      if (pRes.data) setProf({ ...prof, ...pRes.data, specialties: pRes.data.specialties || [] });
    }).finally(() => setLoading(false));
  }, []);

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
    try {
      await axios.patch(`${API}/api/users/${userId}`, { full_name: user.full_name, phone: user.phone, cpf: user.cpf }, { headers });
      await axios.patch(`${API}/api/users/${userId}/professional-profile`, {
        council_number: prof.council_number,
        council_state:  prof.council_state,
        specialties:    prof.specialties,
        service_radius: parseInt(prof.service_radius),
        city:           prof.city,
        state:          prof.state,
        hourly_rate:    parseFloat(prof.hourly_rate) || null,
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
        <button onClick={() => navigate("/dashboard/professional")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-500 mb-6 transition-colors">
          <ArrowLeft size={16} /> Voltar ao dashboard
        </button>
        <h1 className="font-display text-2xl font-bold text-navy mb-6">Meu perfil</h1>

        {loading ? <p className="text-slate-400 text-center py-10">Carregando...</p> : (
          <div className="space-y-5">
            <div className="card p-6">
              <h3 className="font-semibold text-navy mb-4">Informações pessoais</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="form-label">Nome completo</label><input className="form-input" value={user.full_name} onChange={setU("full_name")} /></div>
                <div><label className="form-label">CPF</label><input className="form-input" value={user.cpf || ""} onChange={setU("cpf")} /></div>
                <div><label className="form-label">E-mail</label><input className="form-input" value={user.email} disabled className="form-input bg-slate-50 text-slate-400 cursor-not-allowed" /></div>
                <div><label className="form-label">WhatsApp</label><input className="form-input" value={user.phone || ""} onChange={setU("phone")} /></div>
              </div>
            </div>

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