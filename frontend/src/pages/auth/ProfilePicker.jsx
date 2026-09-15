import { useNavigate } from "react-router-dom";
import { User, Stethoscope, ChevronRight } from "lucide-react";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";

const ROLE_HOME = {
  client: "/dashboard/client",
  nurse: "/dashboard/professional",
  technician: "/dashboard/professional",
  nursing_assistant: "/dashboard/professional",
  caregiver: "/dashboard/professional",
  admin: "/dashboard/admin",
};

const ROLE_LABELS = {
  client: "Cliente",
  nurse: "Enfermeiro(a)",
  technician: "Técnico(a) de Enfermagem",
  nursing_assistant: "Auxiliar de Enfermagem",
  caregiver: "Cuidador(a)",
};

const ROLE_ICONS = {
  client: <User size={24} className="text-blue-500" />,
  nurse: <Stethoscope size={24} className="text-green-500" />,
  technician: <Stethoscope size={24} className="text-green-500" />,
  nursing_assistant: <Stethoscope size={24} className="text-green-500" />,
  caregiver: <Stethoscope size={24} className="text-amber-500" />,
};

const ProfilePicker = () => {
  const navigate = useNavigate();
  const fullName = localStorage.getItem("full_name") || "Usuário";
  const roles = JSON.parse(localStorage.getItem("roles") || "[]");

  // Filter to real roles only (not professional_pending)
  const realRoles = roles.filter(r => ROLE_LABELS[r]);

  const selectProfile = (role) => {
    localStorage.setItem("role", role);
    navigate(ROLE_HOME[role] || "/dashboard/client");
  };

  // If only 1 real role, auto-select
  if (realRoles.length <= 1) {
    const role = realRoles[0] || "client";
    selectProfile(role);
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo size="md" />
          <h1 className="font-display text-2xl font-bold text-navy mt-4">Olá, {fullName.split(" ")[0]}!</h1>
          <p className="text-sm text-slate-500 mt-1">Como deseja usar o CuidaU hoje?</p>
        </div>

        <div className="space-y-3">
          {realRoles.map(role => (
            <button key={role} onClick={() => selectProfile(role)}
              className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl border-2 border-slate-100 hover:border-blue-300 hover:shadow-md transition-all group">
              <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                {ROLE_ICONS[role] || <User size={24} className="text-slate-400" />}
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-navy">{ROLE_LABELS[role] || role}</p>
                <p className="text-xs text-slate-400">
                  {role === "client" ? "Buscar e agendar profissionais" : "Receber e gerenciar atendimentos"}
                </p>
              </div>
              <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
            </button>
          ))}
        </div>

        {/* Pending profiles */}
        {roles.includes("professional_pending") && !realRoles.some(r => r !== "client") && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-center">
            <p className="text-xs text-amber-700 font-medium">👩‍⚕️ Perfil profissional em verificação</p>
            <p className="text-[10px] text-amber-500 mt-0.5">Você receberá acesso assim que a verificação for concluída.</p>
          </div>
        )}

        <p className="text-[10px] text-slate-400 text-center mt-6">
          Você pode trocar de perfil a qualquer momento no menu do app.
        </p>
        <div className="flex justify-center mt-4">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
};

export default ProfilePicker;