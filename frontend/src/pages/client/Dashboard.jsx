import { useTranslation } from "react-i18next";
import { CalendarDays, MapPin, Star, CreditCard, User } from "lucide-react";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";

const DashboardCard = ({ icon, label, value, accent }) => (
  <div className="card p-5">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${accent ? "bg-green-100" : "bg-blue-100"}`}>
      {icon}
    </div>
    <p className="text-xs text-slate-500 mb-1">{label}</p>
    <p className="font-display text-xl font-bold text-navy">{value}</p>
  </div>
);

const ClientDashboard = () => {
  const fullName = localStorage.getItem("full_name") || "Cliente";
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
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-navy">Olá, {firstName} 👋</h1>
          <p className="text-slate-500 text-sm mt-1">Como podemos cuidar hoje?</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <DashboardCard icon={<CalendarDays size={18} className="text-blue-500" />} label="Agendamentos" value="3" />
          <DashboardCard icon={<Star size={18} className="text-amber-500" />} label="Avaliações dadas" value="12" accent />
          <DashboardCard icon={<CreditCard size={18} className="text-blue-500" />} label="Total gasto" value="R$480" />
          <DashboardCard icon={<User size={18} className="text-green-500" />} label="Profissionais" value="5" accent />
        </div>

        <div className="bg-brand-gradient rounded-2xl p-6 text-white mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold mb-1">Precisa de cuidado agora?</h2>
            <p className="text-white/80 text-sm">Encontre profissionais disponíveis perto de você.</p>
          </div>
          <button className="btn-white flex-shrink-0 flex items-center gap-2">
            <MapPin size={16} /> Buscar profissionais
          </button>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold text-navy mb-4">Agendamentos recentes</h3>
          <div className="space-y-3">
            {[
              { name: "Enf. Maria Santos", type: "Curativo complexo", date: "Hoje, 14h", status: "Confirmado", statusColor: "bg-green-100 text-green-700" },
              { name: "Téc. João Lima", type: "Banho no leito", date: "Ontem, 9h", status: "Concluído", statusColor: "bg-slate-100 text-slate-600" },
              { name: "Cuidadora Ana P.", type: "Acompanhamento", date: "02/06, 10h", status: "Concluído", statusColor: "bg-slate-100 text-slate-600" },
            ].map((b, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-blue-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-brand-gradient flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {b.name.split(" ").map(n => n[0]).slice(1, 3).join("")}
                  </div>
                  <div>
                    <p className="font-semibold text-navy text-sm">{b.name}</p>
                    <p className="text-xs text-slate-500">{b.type} · {b.date}</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${b.statusColor}`}>{b.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientDashboard;