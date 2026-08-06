import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Calendar, CheckCircle, XCircle, Clock } from "lucide-react";
import axios from "axios";
import Logo from "../../components/common/Logo";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const TABS = [
  { id: "upcoming", label: "Próximos", icon: <Calendar size={14}/> },
  { id: "completed", label: "Concluídos", icon: <CheckCircle size={14}/> },
  { id: "cancelled", label: "Cancelados", icon: <XCircle size={14}/> },
];

const STATUS_COLOR = {
  pending: "bg-yellow-100 text-yellow-700", accepted: "bg-blue-100 text-blue-700",
  checked_in: "bg-purple-100 text-purple-700", completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600", no_show: "bg-red-100 text-red-600",
  professional_arrived: "bg-indigo-100 text-indigo-700", under_review: "bg-amber-100 text-amber-700",
};
const STATUS_LABEL = {
  pending: "Pendente", accepted: "Confirmado", checked_in: "Em andamento", completed: "Concluído",
  cancelled: "Cancelado", no_show: "No-show", professional_arrived: "Profissional chegou", under_review: "Em análise",
};

const MyActivity = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const [tab, setTab] = useState("upcoming");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/api/bookings/my-bookings`, { headers })
      .then(r => setBookings(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const filtered = bookings.filter(b => {
    if (tab === "upcoming") return ["pending","accepted","checked_in","professional_arrived"].includes(b.status);
    if (tab === "completed") return b.status === "completed";
    if (tab === "cancelled") return ["cancelled","no_show"].includes(b.status);
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" /><ProfileMenu />
      </nav>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft size={20}/></button>
          <h1 className="font-display text-2xl font-bold text-navy">Minha atividade</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                tab === t.id ? "bg-blue-500 text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">Carregando...</p>
        ) : filtered.length === 0 ? (
          <div className="card p-8 text-center">
            <Clock size={40} className="mx-auto mb-3 text-slate-300"/>
            <p className="text-sm text-slate-500">Nenhum agendamento {tab === "upcoming" ? "próximo" : tab === "completed" ? "concluído" : "cancelado"}.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((b, i) => (
              <div key={i} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[b.status]}`}>
                        {STATUS_LABEL[b.status]}
                      </span>
                      <span className="text-xs text-slate-400">
                        {b.scheduled_start && new Date(b.scheduled_start).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-navy">{b.service_type || "Atendimento"}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {b.scheduled_start && new Date(b.scheduled_start).toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"})}
                      {b.scheduled_end && ` – ${new Date(b.scheduled_end).toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"})}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-navy">R$ {(b.total_price || 0).toFixed(2)}</p>
                    {b.cancel_reason && (
                      <p className="text-[10px] text-red-500 mt-0.5">Motivo: {b.cancel_reason.substring(0, 30)}...</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyActivity;