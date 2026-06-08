import { useEffect, useState } from "react";
import { CalendarDays, MapPin, Star, CreditCard, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const statusColor = (s) => ({
  accepted:   "bg-green-100 text-green-700",
  completed:  "bg-slate-100 text-slate-600",
  pending:    "bg-amber-100 text-amber-700",
  cancelled:  "bg-red-100 text-red-600",
  checked_in: "bg-blue-100 text-blue-700",
})[s] || "bg-slate-100 text-slate-600";

const statusLabel = (s) => ({
  accepted:   "Confirmado",
  completed:  "Concluído",
  pending:    "Pendente",
  cancelled:  "Cancelado",
  checked_in: "Em andamento",
})[s] || s;

const ClientDashboard = () => {
  const navigate = useNavigate();
  const fullName  = localStorage.getItem("full_name") || "Cliente";
  const firstName = fullName.split(" ")[0];
  const patientId = localStorage.getItem("patient_id");
  const token     = localStorage.getItem("token");

  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (!patientId) { setLoading(false); return; }
    axios.get(`${API}/api/bookings/patient/${patientId}`, { headers })
      .then(r => setBookings(r.data))
      .catch(() => toast.error("Erro ao carregar agendamentos."))
      .finally(() => setLoading(false));
  }, [patientId]);

  const stats = [
    { icon: <CalendarDays size={18} className="text-blue-500" />,  label: "Agendamentos",   value: bookings.length },
    { icon: <Star size={18}         className="text-amber-500" />, label: "Concluídos",      value: bookings.filter(b => b.status === "completed").length, accent: true },
    { icon: <CreditCard size={18}   className="text-blue-500" />,  label: "Total gasto",     value: `R$${bookings.filter(b=>b.status==="completed").reduce((s,b)=>s+b.total_price,0).toFixed(0)}` },
    { icon: <User size={18}         className="text-green-500" />, label: "Pendentes",        value: bookings.filter(b => b.status === "pending").length, accent: true },
  ];

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

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map((s, i) => (
            <div key={i} className="card p-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.accent ? "bg-green-100" : "bg-blue-100"}`}>
                {s.icon}
              </div>
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className="font-display text-xl font-bold text-navy">{s.value}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="bg-brand-gradient rounded-2xl p-6 text-white mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold mb-1">Precisa de cuidado agora?</h2>
            <p className="text-white/80 text-sm">Encontre profissionais disponíveis perto de você.</p>
          </div>
          <button onClick={() => toast("Em breve: mapa de profissionais!", { icon: "🗺️" })}
            className="btn-white flex-shrink-0 flex items-center gap-2">
            <MapPin size={16} /> Buscar profissionais
          </button>
        </div>

        {/* Bookings */}
        <div className="card p-6">
          <h3 className="font-semibold text-navy mb-4">Agendamentos</h3>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-6">Carregando...</p>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Nenhum agendamento ainda.</p>
          ) : (
            <div className="space-y-3">
              {bookings.map((b, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-blue-50 transition-colors">
                  <div>
                    <p className="font-semibold text-navy text-sm">{b.service_type}</p>
                    <p className="text-xs text-slate-500">{new Date(b.scheduled_start).toLocaleString("pt-BR")} · R${b.total_price}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor(b.status)}`}>
                    {statusLabel(b.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientDashboard;