import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, Trash2, Play, Pause, ChevronLeft, CheckCircle, Clock, Search } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const STATUS_CONFIG = {
  active:  { label: "Ativo",    color: "bg-green-100 text-green-700", icon: <Bell size={13} /> },
  paused:  { label: "Pausado",  color: "bg-slate-100 text-slate-500", icon: <BellOff size={13} /> },
  matched: { label: "Encontrado", color: "bg-blue-100 text-blue-700", icon: <CheckCircle size={13} /> },
  expired: { label: "Expirado", color: "bg-red-100 text-red-500",   icon: <Clock size={13} /> },
};

const AlertsPage = () => {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token");
  const role     = localStorage.getItem("role");
  const headers  = { Authorization: `Bearer ${token}` };

  const [alerts, setAlerts]     = useState([]);
  const [matches, setMatches]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [checking, setChecking] = useState(false);

  const isPro = ["nurse", "technician", "nursing_assistant", "caregiver"].includes(role);
  const backPath = isPro ? "/dashboard/professional" : "/dashboard/client";

  useEffect(() => {
    axios.get(`${API}/api/alerts`, { headers })
      .then(r => setAlerts(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const checkMatches = async () => {
    setChecking(true);
    try {
      const { data } = await axios.get(`${API}/api/alerts/match/check`, { headers });
      setMatches(data.alerts_with_matches || []);
      if (data.total_matches > 0) {
        toast.success(`${data.total_matches} oportunidade(s) encontrada(s)!`);
      } else {
        toast("Nenhuma oportunidade compatível no momento.", { icon: "🔍" });
      }
    } catch { toast.error("Erro ao buscar oportunidades."); }
    finally { setChecking(false); }
  };

  const pauseAlert = async (id) => {
    await axios.patch(`${API}/api/alerts/${id}/pause`, {}, { headers });
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: "paused" } : a));
    toast.success("Alerta pausado.");
  };

  const resumeAlert = async (id) => {
    await axios.patch(`${API}/api/alerts/${id}/resume`, {}, { headers });
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: "active" } : a));
    toast.success("Alerta reativado.");
  };

  const deleteAlert = async (id) => {
    await axios.delete(`${API}/api/alerts/${id}`, { headers });
    setAlerts(prev => prev.filter(a => a.id !== id));
    toast.success("Alerta removido.");
  };

  const confirmMatch = async (id) => {
    await axios.patch(`${API}/api/alerts/match/${id}/confirm`, {}, { headers });
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: "matched" } : a));
    toast.success("Match confirmado!");
  };

  const activeCount = alerts.filter(a => a.status === "active").length;

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" />
        <div className="flex items-center gap-3"><LanguageSwitcher /><ProfileMenu /></div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <button onClick={() => navigate(backPath)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold text-navy">Alertas de disponibilidade</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {activeCount > 0 ? `${activeCount} alerta(s) ativo(s)` : "Nenhum alerta ativo"}
            </p>
          </div>
          <button onClick={checkMatches} disabled={checking || activeCount === 0}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
            <Search size={15} /> {checking ? "Buscando..." : "Buscar agora"}
          </button>
        </div>

        {/* Matches found */}
        {matches.length > 0 && (
          <div className="mb-6 space-y-3">
            <h3 className="font-semibold text-navy text-sm">🎉 Oportunidades encontradas</h3>
            {matches.map(m => (
              <div key={m.alert.id} className="card p-4 border-2 border-green-200 bg-green-50/50">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-navy">
                    {m.alert.alert_type === "patient" ? "Profissionais disponíveis" : "Solicitações compatíveis"}
                  </p>
                  <span className="text-xs font-semibold text-green-600">{m.match_count} encontrado(s)</span>
                </div>
                <div className="space-y-2 mb-3">
                  {m.matches.slice(0, 3).map((match, i) => (
                    <div key={i} className="text-xs text-slate-600 bg-white p-2 rounded-lg border border-slate-100">
                      {match.full_name || match.service_type || "Oportunidade"} 
                      {match.role && ` · ${match.role}`}
                      {match.rating_avg && ` · ⭐ ${match.rating_avg}`}
                      {match.scheduled_start && ` · ${new Date(match.scheduled_start).toLocaleDateString("pt-BR")}`}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { confirmMatch(m.alert.id); navigate(isPro ? "/dashboard/professional" : "/booking/new"); }}
                    className="btn-primary text-xs px-3 py-1.5">
                    {m.alert.alert_type === "patient" ? "Agendar agora" : "Ver solicitações"}
                  </button>
                  <button onClick={() => confirmMatch(m.alert.id)} className="btn-outline text-xs px-3 py-1.5">
                    Marcar como resolvido
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Alert list */}
        {loading ? (
          <p className="text-slate-400 text-sm text-center py-8">Carregando...</p>
        ) : alerts.length === 0 ? (
          <div className="card p-8 text-center">
            <Bell size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-navy font-semibold mb-1">Nenhum alerta criado</p>
            <p className="text-sm text-slate-500 mb-4">
              {isPro
                ? "Crie um alerta para ser notificado quando surgirem solicitações de cuidado compatíveis."
                : "Ao buscar profissionais, se nenhum estiver disponível, você pode criar um alerta para ser notificado."}
            </p>
            <button onClick={() => navigate(isPro ? "/availability" : "/booking/new")} className="btn-primary">
              {isPro ? "Gerenciar disponibilidade" : "Buscar profissional"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map(alert => {
              const cfg = STATUS_CONFIG[alert.status] || STATUS_CONFIG.active;
              return (
                <div key={alert.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                        <span className="text-xs text-slate-400">
                          {alert.created_at && new Date(alert.created_at).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-navy">
                        {alert.alert_type === "patient" ? "Busca por profissional" : "Busca por solicitações"}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {alert.preferred_date && (
                          <span className="text-xs text-slate-500">📅 {alert.preferred_date}</span>
                        )}
                        {alert.preferred_time && (
                          <span className="text-xs text-slate-500">🕐 {alert.preferred_time}</span>
                        )}
                        {alert.duration_hours && (
                          <span className="text-xs text-slate-500">⏱ {alert.duration_hours}h</span>
                        )}
                        {alert.professional_category && (
                          <span className="text-xs text-slate-500">👩‍⚕️ {alert.professional_category}</span>
                        )}
                        {alert.services?.length > 0 && (
                          <span className="text-xs text-slate-500">📋 {alert.services.length} serviço(s)</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {alert.status === "active" && (
                        <button onClick={() => pauseAlert(alert.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" title="Pausar">
                          <Pause size={14} />
                        </button>
                      )}
                      {alert.status === "paused" && (
                        <button onClick={() => resumeAlert(alert.id)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-500" title="Reativar">
                          <Play size={14} />
                        </button>
                      )}
                      <button onClick={() => deleteAlert(alert.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="Excluir">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AlertsPage;