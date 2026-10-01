import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, BellOff, Trash2, ChevronLeft, CheckCircle, AlertTriangle,
  Calendar, CreditCard, MessageSquare, Star, Mail, Phone, Smartphone,
  Filter, Check,
} from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const ICON_MAP = {
  booking:               <Calendar size={16} className="text-blue-500" />,
  payment:               <CreditCard size={16} className="text-green-500" />,
  cancel:                <AlertTriangle size={16} className="text-red-500" />,
  checkin:               <CheckCircle size={16} className="text-purple-500" />,
  message:               <MessageSquare size={16} className="text-blue-500" />,
  admin_message:         <MessageSquare size={16} className="text-indigo-500" />,
  rating:                <Star size={16} className="text-amber-500" />,
  system:                <Bell size={16} className="text-slate-500" />,
  verification_complete: <CheckCircle size={16} className="text-green-600" />,
  document_feedback:     <AlertTriangle size={16} className="text-orange-500" />,
};

const TYPE_LABELS = {
  booking: "Agendamento",
  payment: "Pagamento",
  cancel: "Cancelamento",
  checkin: "Check-in",
  message: "Mensagem",
  admin_message: "Mensagem da equipe",
  rating: "Avaliação",
  system: "Sistema",
  verification_complete: "Verificação concluída",
  document_feedback: "Documento",
};

const DELIVERY_ICON = {
  sent: <Check size={10} className="text-green-500" />,
  failed: <AlertTriangle size={10} className="text-red-500" />,
  not_configured: <BellOff size={10} className="text-slate-300" />,
  pending: <Bell size={10} className="text-slate-300" />,
};

const NotificationsPage = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const headers = { Authorization: `Bearer ${token}` };

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, unread

  const isPro = ["nurse", "technician", "nursing_assistant", "caregiver"].includes(role);
  const backPath = isPro ? "/dashboard/professional" : role === "admin" ? "/admin" : "/dashboard/client";

  useEffect(() => {
    axios.get(`${API}/api/notifications`, { headers })
      .then(r => setNotifications(Array.isArray(r.data) ? r.data : []))
      .catch(() => toast.error("Erro ao carregar notificações."))
      .finally(() => setLoading(false));
  }, []);

  const markRead = async (id) => {
    try {
      await axios.patch(`${API}/api/notifications/${id}/read`, {}, { headers });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch { /* silent */ }
  };

  const markAllRead = async () => {
    try {
      await axios.patch(`${API}/api/notifications/read-all`, {}, { headers });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast.success("Todas marcadas como lidas.");
    } catch { toast.error("Erro."); }
  };

  const deleteNotif = async (id) => {
    try {
      await axios.delete(`${API}/api/notifications/${id}`, { headers });
      setNotifications(prev => prev.filter(n => n.id !== id));
      toast.success("Notificação removida.");
    } catch { toast.error("Erro ao remover."); }
  };

  const filtered = filter === "unread"
    ? notifications.filter(n => !n.read)
    : notifications;
  const unreadCount = notifications.filter(n => !n.read).length;

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
            <h1 className="font-display text-2xl font-bold text-navy">Notificações</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {unreadCount > 0 ? `${unreadCount} não lida(s)` : "Tudo em dia"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Filter toggle */}
            <button
              onClick={() => setFilter(f => f === "all" ? "unread" : "all")}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                filter === "unread" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              <Filter size={13} /> {filter === "unread" ? "Não lidas" : "Todas"}
            </button>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-blue-500 hover:underline whitespace-nowrap">
                Marcar todas como lidas
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-slate-400 text-sm text-center py-8">Carregando...</p>
        ) : filtered.length === 0 ? (
          <div className="card p-8 text-center">
            <Bell size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-navy font-semibold mb-1">
              {filter === "unread" ? "Nenhuma notificação não lida" : "Nenhuma notificação"}
            </p>
            <p className="text-sm text-slate-500">
              {filter === "unread"
                ? "Todas as notificações foram lidas."
                : "Você receberá notificações sobre agendamentos, verificações e mensagens da equipe aqui."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(n => {
              const icon = ICON_MAP[n.type] || ICON_MAP.system;
              const typeLabel = TYPE_LABELS[n.type] || n.type;
              return (
                <div
                  key={n.id}
                  className={`card p-4 transition-all cursor-pointer ${!n.read ? "border-l-4 border-l-blue-500 bg-blue-50/30" : "hover:bg-slate-50"}`}
                  onClick={() => !n.read && markRead(n.id)}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex-shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">{typeLabel}</span>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                      </div>
                      <p className={`text-sm ${!n.read ? "font-semibold text-navy" : "text-slate-700"}`}>{n.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                      {/* Document link */}
                      {n.doc_type && (
                        <p className="text-xs text-blue-500 mt-1">
                          📄 Documento: {n.doc_type}
                          {isPro && (
                            <button onClick={(e) => { e.stopPropagation(); navigate("/profile/professional"); }}
                              className="ml-2 text-blue-600 hover:underline font-semibold">Ver meus documentos →</button>
                          )}
                        </p>
                      )}
                      {/* Delivery status indicators */}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="flex items-center gap-1 text-[10px] text-slate-400" title={`In-app: ${n.delivery_in_app || "sent"}`}>
                          <Smartphone size={10} /> {DELIVERY_ICON[n.delivery_in_app] || DELIVERY_ICON.sent}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-400" title={`Email: ${n.delivery_email || "pending"}`}>
                          <Mail size={10} /> {DELIVERY_ICON[n.delivery_email] || DELIVERY_ICON.pending}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-400" title={`WhatsApp: ${n.delivery_whatsapp || "pending"}`}>
                          <Phone size={10} /> {DELIVERY_ICON[n.delivery_whatsapp] || DELIVERY_ICON.pending}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-auto">
                          {n.created_at && new Date(n.created_at).toLocaleString("pt-BR", {
                            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteNotif(n.id); }}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 flex-shrink-0"
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
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

export default NotificationsPage;