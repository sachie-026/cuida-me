import { useState, useEffect, useRef } from "react";
import { Bell, X, CheckCircle, AlertTriangle, Calendar, CreditCard, MessageSquare, Star } from "lucide-react";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const ICON_MAP = {
  booking:    <Calendar size={14} className="text-blue-500" />,
  payment:    <CreditCard size={14} className="text-green-500" />,
  cancel:     <AlertTriangle size={14} className="text-red-500" />,
  checkin:    <CheckCircle size={14} className="text-purple-500" />,
  message:    <MessageSquare size={14} className="text-blue-500" />,
  rating:     <Star size={14} className="text-amber-500" />,
  system:     <Bell size={14} className="text-slate-500" />,
};

const NotificationCenter = () => {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef(null);
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  // Poll for notifications every 30 seconds
  useEffect(() => {
    const fetch = () => {
      if (!token) return;
      axios.get(`${API}/api/notifications`, { headers }).then(r => {
        const data = Array.isArray(r.data) ? r.data : [];
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.read).length);
      }).catch(() => {});
    };
    fetch();
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const markRead = async (id) => {
    try {
      await axios.patch(`${API}/api/notifications/${id}/read`, {}, { headers });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await axios.patch(`${API}/api/notifications/read-all`, {}, { headers });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {}
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors">
        <Bell size={20} className="text-slate-500" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 max-h-[70vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-bold text-navy">Notificações</p>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-blue-500 hover:underline">Marcar todas como lidas</button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-slate-100"><X size={14} className="text-slate-400"/></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell size={28} className="mx-auto mb-2 text-slate-300" />
                <p className="text-xs text-slate-400">Nenhuma notificação</p>
              </div>
            ) : (
              notifications.slice(0, 20).map(n => (
                <button key={n.id} onClick={() => markRead(n.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${!n.read ? "bg-blue-50/50" : ""}`}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5">{ICON_MAP[n.type] || ICON_MAP.system}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.read ? "font-semibold text-navy" : "text-slate-600"}`}>{n.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {n.created_at && new Date(n.created_at).toLocaleString("pt-BR", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}
                      </p>
                    </div>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;