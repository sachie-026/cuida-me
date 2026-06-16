import { useEffect, useState } from "react";
import { DollarSign, CalendarDays, Star, CheckCircle, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const STATUS_COLOR = {
  accepted:   "bg-green-100 text-green-700",
  completed:  "bg-slate-100 text-slate-600",
  pending:    "bg-amber-100 text-amber-700",
  cancelled:  "bg-red-100 text-red-600",
  checked_in: "bg-blue-100 text-blue-700",
};
const STATUS_LABEL = {
  accepted: "Confirmado", completed: "Concluído",
  pending: "Pendente", cancelled: "Cancelado", checked_in: "Em andamento",
};

const ProfessionalDashboard = () => {
  const navigate  = useNavigate();
  const fullName  = localStorage.getItem("full_name") || "Profissional";
  const firstName = fullName.split(" ")[0];
  const userId    = localStorage.getItem("user_id");
  const token     = localStorage.getItem("token");
  const headers   = { Authorization: `Bearer ${token}` };

  const [bookings,        setBookings]        = useState([]);
  const [available,       setAvailable]       = useState(false);
  const [approvalStatus,  setApprovalStatus]  = useState("pending");
  const [loading,         setLoading]         = useState(true);
  const [toggling,        setToggling]        = useState(false);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    Promise.all([
      axios.get(`${API}/api/professionals/${userId}`,        { headers }),
      axios.get(`${API}/api/bookings/professional/${userId}`, { headers }),
    ]).then(([profRes, bookRes]) => {
      setAvailable(profRes.data.is_available || false);
      setApprovalStatus(profRes.data.approval_status || "pending");
      setBookings(Array.isArray(bookRes.data) ? bookRes.data : []);
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, [userId]);

  const toggleAvailability = async () => {
    // Check approval first
    if (approvalStatus !== "approved") {
      toast("Sua conta precisa ser verificada primeiro.", { icon: "⚠️" });
      navigate("/profile/professional");
      return;
    }
    setToggling(true);
    try {
      const { data } = await axios.patch(
        `${API}/api/professionals/${userId}/toggle-availability`, {}, { headers }
      );
      setAvailable(data.is_available);
      toast.success(data.is_available ? "Você está disponível!" : "Você está indisponível.");
    } catch (err) {
      if (err.response?.data?.detail === "ACCOUNT_NOT_VERIFIED") {
        toast("Conta pendente de verificação.", { icon: "⚠️" });
        navigate("/profile/professional");
      } else {
        toast.error("Erro ao atualizar disponibilidade.");
      }
    } finally {
      setToggling(false);
    }
  };

  const handleAccept = async (bookingId) => {
    try {
      await axios.patch(`${API}/api/bookings/${bookingId}/accept`, {}, { headers });
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: "accepted" } : b));
      toast.success("Solicitação aceita!");
    } catch {
      toast.error("Erro ao aceitar solicitação.");
    }
  };

  const handleDecline = async (bookingId) => {
    try {
      await axios.patch(`${API}/api/bookings/${bookingId}/cancel?reason=Recusado pelo profissional`, {}, { headers });
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: "cancelled" } : b));
      toast("Solicitação recusada.", { icon: "❌" });
    } catch {
      toast.error("Erro ao recusar solicitação.");
    }
  };

  const earnings  = bookings.filter(b => b.status === "completed").reduce((s, b) => s + (b.pro_payout || 0), 0);
  const completed = bookings.filter(b => b.status === "completed").length;
  const total     = bookings.length;
  const pending   = bookings.filter(b => b.status === "pending");

  const stats = [
    { icon: <DollarSign size={18} className="text-green-500" />,  label: "Ganhos",          value: `R$${earnings.toFixed(0)}`,                          accent: true },
    { icon: <CalendarDays size={18} className="text-blue-500" />, label: "Atendimentos",     value: total },
    { icon: <Star size={18} className="text-amber-500" />,        label: "Concluídos",       value: completed },
    { icon: <CheckCircle size={18} className="text-green-500" />, label: "Taxa de conclusão",value: total ? `${Math.round(completed/total*100)}%` : "–", accent: true },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" />
        <div className="flex items-center gap-3"><LanguageSwitcher /><ProfileMenu /></div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* Verification warning banner */}
        {approvalStatus !== "approved" && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-700 text-sm">
                {approvalStatus === "rejected" ? "Cadastro rejeitado" : "Conta pendente de verificação"}
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                {approvalStatus === "rejected"
                  ? "Seus documentos foram rejeitados. Acesse seu perfil e reenvie documentos válidos."
                  : "Envie seus documentos no perfil para que nossa equipe aprove sua conta. Enquanto isso, você não aparece para clientes."}
              </p>
            </div>
            <button onClick={() => navigate("/profile/professional")}
              className="text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
              Enviar docs →
            </button>
          </div>
        )}

        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-navy">Olá, {firstName} 👩‍⚕️</h1>
            <p className="text-slate-500 text-sm mt-1">Gerencie seus atendimentos</p>
          </div>
          {/* Availability toggle */}
          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium ${available ? "text-green-600" : "text-slate-500"}`}>
              {available ? "Disponível" : "Indisponível"}
            </span>
            <button
              onClick={toggleAvailability}
              disabled={toggling}
              title={approvalStatus !== "approved" ? "Conta não verificada" : ""}
              className={`w-12 h-6 rounded-full relative transition-colors duration-300 disabled:opacity-60
                ${available ? "bg-green-500" : approvalStatus !== "approved" ? "bg-slate-200" : "bg-slate-300"}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all duration-300 shadow
                ${available ? "right-0.5" : "left-0.5"}`} />
            </button>
            {approvalStatus !== "approved" && (
              <span className="text-xs text-amber-600 font-medium">⚠️ Não verificado</span>
            )}
          </div>
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

        {/* Pending requests */}
        {pending.length > 0 && (
          <div className="card p-6 mb-6">
            <h3 className="font-semibold text-navy mb-4">Solicitações pendentes ({pending.length})</h3>
            <div className="space-y-3">
              {pending.map((b, i) => (
                <div key={i} className="p-4 rounded-xl border border-slate-200 hover:border-blue-300 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="font-semibold text-navy text-sm">{b.service_type}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {new Date(b.scheduled_start).toLocaleString("pt-BR")} → {new Date(b.scheduled_end).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-bold text-green-600 text-sm">R${b.pro_payout?.toFixed(0)}</span>
                      <button onClick={() => handleAccept(b.id)} className="btn-primary text-xs px-3 py-1.5">Aceitar</button>
                      <button onClick={() => handleDecline(b.id)} className="btn-outline text-xs px-3 py-1.5">Recusar</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All bookings */}
        <div className="card p-6">
          <h3 className="font-semibold text-navy mb-4">Todos os atendimentos</h3>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-6">Carregando...</p>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Nenhum atendimento ainda.</p>
          ) : (
            <div className="space-y-3">
              {bookings.map((b, i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50">
                  <div className="text-xs font-bold text-blue-500 w-20 flex-shrink-0">
                    {new Date(b.scheduled_start).toLocaleDateString("pt-BR")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy truncate">{b.service_type}</p>
                    <p className="text-xs text-slate-500">R${b.pro_payout?.toFixed(0)} líquido</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_COLOR[b.status]}`}>
                    {STATUS_LABEL[b.status]}
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

export default ProfessionalDashboard;