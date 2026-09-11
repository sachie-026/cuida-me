import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, User, Stethoscope, CheckCircle, Clock, XCircle, Plus, RefreshCw } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const ROLE_LABELS = {
  client: "Cliente",
  nurse: "Enfermeiro(a)",
  technician: "Técnico(a) de Enfermagem",
  nursing_assistant: "Auxiliar de Enfermagem",
  caregiver: "Cuidador(a)",
};

const ROLE_DESCS = {
  client: "Buscar e agendar profissionais de saúde",
  nurse: "Todos os procedimentos de enfermagem",
  technician: "Medicamentos, curativos, sondas, cateteres",
  nursing_assistant: "Sinais vitais, medicamentos orais, curativos simples",
  caregiver: "Companhia, mobilidade, higiene pessoal, alimentação",
};

const ManageProfiles = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const currentRole = localStorage.getItem("role") || "client";
  const roles = JSON.parse(localStorage.getItem("roles") || "[]");
  const hasPro = localStorage.getItem("has_pro") === "true";

  const [proData, setProData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    // Load professional data if exists
    if (hasPro || roles.some(r => r !== "client")) {
      axios.get(`${API}/api/professionals/${userId}`, { headers })
        .then(r => setProData(r.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const switchTo = (role) => {
    localStorage.setItem("role", role);
    toast.success(`Perfil alterado para ${ROLE_LABELS[role] || role}`);
    const dest = ["nurse", "technician", "nursing_assistant", "caregiver"].includes(role)
      ? "/dashboard/professional" : "/dashboard/client";
    navigate(dest);
  };

  const proRoles = roles.filter(r => ["nurse", "technician", "nursing_assistant", "caregiver"].includes(r));
  const allProfiles = [
    { role: "client", active: currentRole === "client" },
    ...proRoles.map(r => ({ role: r, active: currentRole === r })),
  ];

  // Available pro roles user doesn't have
  const availableToAdd = ["nurse", "technician", "nursing_assistant", "caregiver"]
    .filter(r => !roles.includes(r));

  const getVerificationBadge = () => {
    if (!proData) return null;
    const status = proData.approval_status || "pending";
    if (status === "approved") return <span className="flex items-center gap-1 text-xs font-semibold text-green-600"><CheckCircle size={12}/> Verificado</span>;
    if (status === "rejected") return <span className="flex items-center gap-1 text-xs font-semibold text-red-500"><XCircle size={12}/> Rejeitado</span>;
    return <span className="flex items-center gap-1 text-xs font-semibold text-amber-600"><Clock size={12}/> Verificação pendente</span>;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" /><ProfileMenu />
      </nav>

      <div className="max-w-md mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft size={20}/></button>
          <div>
            <h1 className="font-display text-2xl font-bold text-navy">Gerenciar Perfis</h1>
            <p className="text-xs text-slate-500">Alterne entre seus perfis ou adicione novos</p>
          </div>
        </div>

        {/* Current active profile */}
        <div className="card p-4 mb-4 border-2 border-blue-200 bg-blue-50">
          <p className="text-[10px] text-blue-500 font-semibold uppercase mb-1">Perfil ativo</p>
          <div className="flex items-center gap-3">
            {currentRole === "client"
              ? <User size={20} className="text-blue-500" />
              : <Stethoscope size={20} className="text-green-500" />}
            <div>
              <p className="font-semibold text-navy">{ROLE_LABELS[currentRole] || currentRole}</p>
              <p className="text-xs text-slate-500">{ROLE_DESCS[currentRole]}</p>
            </div>
          </div>
        </div>

        {/* All profiles */}
        <h3 className="text-sm font-semibold text-slate-500 uppercase mb-2">Seus perfis</h3>
        <div className="space-y-2 mb-6">
          {allProfiles.map(p => (
            <div key={p.role} className={`card p-4 flex items-center gap-3 ${p.active ? "border-2 border-blue-300" : ""}`}>
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                {p.role === "client"
                  ? <User size={18} className="text-blue-500" />
                  : <Stethoscope size={18} className="text-green-500" />}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-navy text-sm">{ROLE_LABELS[p.role]}</p>
                <p className="text-xs text-slate-400">{ROLE_DESCS[p.role]}</p>
                {p.role !== "client" && getVerificationBadge()}
              </div>
              {p.active ? (
                <span className="text-xs font-semibold text-blue-500 bg-blue-100 px-2 py-1 rounded-full">Ativo</span>
              ) : (
                <button onClick={() => switchTo(p.role)}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg">
                  <RefreshCw size={12}/> Usar
                </button>
              )}
            </div>
          ))}

          {/* Pending professional profile */}
          {roles.includes("professional_pending") && proRoles.length === 0 && (
            <div className="card p-4 flex items-center gap-3 border-2 border-amber-200 bg-amber-50">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <Stethoscope size={18} className="text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-navy text-sm">Profissional de Saúde</p>
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-600"><Clock size={12}/> Verificação pendente</span>
              </div>
            </div>
          )}
        </div>

        {/* Add new profile */}
        {availableToAdd.length > 0 && !roles.includes("professional_pending") && (
          <div>
            <h3 className="text-sm font-semibold text-slate-500 uppercase mb-2">Adicionar perfil</h3>
            <button onClick={() => navigate("/register/professional")}
              className="w-full card p-4 flex items-center gap-3 hover:border-blue-200 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Plus size={18} className="text-blue-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-navy text-sm">Adicionar perfil profissional</p>
                <p className="text-xs text-slate-400">Ofereça atendimentos como profissional de saúde</p>
              </div>
            </button>
          </div>
        )}

        {/* Professional verification info */}
        {proData && (
          <div className="card p-4 mt-4">
            <h3 className="text-sm font-semibold text-slate-500 uppercase mb-2">Verificação profissional</h3>
            <div className="space-y-1 text-xs text-slate-600">
              <p>COREN: {proData.council_number || "—"} ({proData.council_state || "—"})</p>
              <p>Status: {proData.approval_status === "approved" ? "✅ Verificado" : proData.approval_status === "rejected" ? "❌ Rejeitado" : "⏳ Pendente"}</p>
              {proData.professional_category && <p>Categoria: {ROLE_LABELS[proData.professional_category] || proData.professional_category}</p>}
            </div>
            <button onClick={() => { switchTo(proRoles[0] || "nurse"); setTimeout(() => navigate("/profile/professional"), 100); }}
              className="btn-outline w-full mt-3 text-sm">Ver perfil profissional completo</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageProfiles;