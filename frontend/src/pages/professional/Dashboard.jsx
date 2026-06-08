import { DollarSign, CalendarDays, Star, CheckCircle } from "lucide-react";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";

const ProfessionalDashboard = () => {
  const fullName = localStorage.getItem("full_name") || "Profissional";
  const firstName = fullName.split(" ")[0];

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" />
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <ProfileMenu />
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-navy">Olá, {firstName} 👩‍⚕️</h1>
            <p className="text-slate-500 text-sm mt-1">COREN-SP 123456 · <span className="text-green-600 font-semibold">Ativa</span></p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Disponível</span>
            <div className="w-12 h-6 bg-green-500 rounded-full relative cursor-pointer">
              <div className="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5 shadow" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: <DollarSign size={18} className="text-green-500" />, label: "Ganhos este mês", value: "R$1.240", accent: true },
            { icon: <CalendarDays size={18} className="text-blue-500" />, label: "Atendimentos", value: "8" },
            { icon: <Star size={18} className="text-amber-500" />, label: "Avaliação média", value: "4.9 ★" },
            { icon: <CheckCircle size={18} className="text-green-500" />, label: "Taxa de conclusão", value: "98%", accent: true },
          ].map((s, i) => (
            <div key={i} className="card p-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.accent ? "bg-green-100" : "bg-blue-100"}`}>
                {s.icon}
              </div>
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className="font-display text-xl font-bold text-navy">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="card p-6 mb-6">
          <h3 className="font-semibold text-navy mb-4">Solicitações próximas</h3>
          <div className="space-y-3">
            {[
              { patient: "Paciente: Maria, 78 anos", type: "Curativo complexo + sonda vesical", dist: "1.8 km", time: "Hoje 15h–18h", value: "R$180" },
              { patient: "Paciente: José, 65 anos", type: "Administração de medicamentos", dist: "3.2 km", time: "Amanhã 8h–10h", value: "R$120" },
            ].map((r, i) => (
              <div key={i} className="p-4 rounded-xl border border-slate-200 hover:border-blue-300 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="font-semibold text-navy text-sm">{r.type}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{r.patient} · {r.dist} · {r.time}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-bold text-green-600 text-sm">{r.value}</span>
                    <button className="btn-primary text-xs px-3 py-1.5">Aceitar</button>
                    <button className="btn-outline text-xs px-3 py-1.5">Recusar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold text-navy mb-4">Minha agenda — hoje</h3>
          <div className="space-y-3">
            {[
              { time: "9h–11h", patient: "Roberto P.", type: "Banho no leito", status: "Concluído" },
              { time: "14h–17h", patient: "Ana C.", type: "Curativo pós-op", status: "Em andamento" },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50">
                <div className="text-xs font-bold text-blue-500 w-16 flex-shrink-0">{s.time}</div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-navy">{s.patient}</p>
                  <p className="text-xs text-slate-500">{s.type}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.status === "Concluído" ? "bg-slate-100 text-slate-600" : "bg-blue-100 text-blue-700"}`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalDashboard;