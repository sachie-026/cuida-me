import { useEffect, useState } from "react";
import { DollarSign, CalendarDays, Star, CheckCircle, AlertTriangle, MessageSquare, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";
import NotificationCenter from "../../components/common/NotificationCenter";
import CancelBookingModal from "../../components/common/CancelBookingModal";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const STATUS_COLOR = {
  accepted:   "bg-green-100 text-green-700",
  completed:  "bg-slate-100 text-slate-600",
  pending:    "bg-amber-100 text-amber-700",
  cancelled:  "bg-red-100 text-red-600",
  checked_in: "bg-blue-100 text-blue-700",
};

const ProfessionalDashboard = () => {
  const navigate  = useNavigate();
  const { t }     = useTranslation();
  const fullName  = localStorage.getItem("full_name") || t("pro_dashboard.default_name");
  const firstName = fullName.split(" ")[0];
  const userId    = localStorage.getItem("user_id");
  const token     = localStorage.getItem("token");
  const headers   = { Authorization: `Bearer ${token}` };

  const [bookings,       setBookings]       = useState([]);
  const [approvalStatus, setApprovalStatus] = useState("pending");
  const [hasAvailability, setHasAvailability] = useState(false);
  const [profId,         setProfId]         = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [cancellingBooking, setCancellingBooking] = useState(null);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    const t0 = performance.now();

    axios.get(`${API}/api/professionals/${userId}`, { headers })
      .then(profRes => {
        const prof = profRes.data;
        setApprovalStatus(prof.approval_status || "pending");
        setProfId(prof.id);
        setLoading(false);
        console.log(`[53a] Pro profile: ${Math.round(performance.now()-t0)}ms — dashboard interactive`);

        return axios.get(`${API}/api/availability/professional/${userId}`, { headers })
          .then(availRes => {
            const slots = availRes.data?.slots || [];
            setHasAvailability(slots.length > 0);
          })
          .catch(() => setHasAvailability(false))
          .then(() => axios.get(`${API}/api/bookings/professional/${prof.id}`, { headers }));
      })
      .then(bookRes => {
        if (bookRes) setBookings(Array.isArray(bookRes.data) ? bookRes.data : []);
        console.log(`[53a] Pro bookings: ${Math.round(performance.now()-t0)}ms`);
      })
      .catch(() => { setLoading(false); });
  }, [userId]);


  const handleAccept = async (bookingId) => {
    try {
      await axios.patch(`${API}/api/bookings/${bookingId}/accept`, {}, { headers });
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: "accepted" } : b));
      toast.success(t("pro_dashboard.toast_accepted"));
    } catch {
      toast.error(t("pro_dashboard.toast_accept_error"));
    }
  };

  const handleDecline = async (bookingId) => {
    try {
      await axios.patch(`${API}/api/bookings/${bookingId}/cancel?reason=Recusado pelo profissional`, {}, { headers });
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: "cancelled" } : b));
      toast(t("pro_dashboard.toast_declined"), { icon: "❌" });
    } catch {
      toast.error(t("pro_dashboard.toast_decline_error"));
    }
  };

  const earnings  = bookings.filter(b => b.status === "completed").reduce((s, b) => s + (b.pro_payout || 0), 0);
  const completed = bookings.filter(b => b.status === "completed").length;
  const total     = bookings.length;
  const pending   = bookings.filter(b => b.status === "pending");

  const stats = [
    { icon: <DollarSign size={18} className="text-green-500" />,  label: t("pro_dashboard.stat_earnings"),       value: `R$${earnings.toFixed(0)}`,                          accent: true },
    { icon: <CalendarDays size={18} className="text-blue-500" />, label: t("pro_dashboard.stat_appointments"),   value: total },
    { icon: <Star size={18} className="text-amber-500" />,        label: t("pro_dashboard.stat_completed"),      value: completed },
    { icon: <CheckCircle size={18} className="text-green-500" />, label: t("pro_dashboard.stat_completion_rate"),value: total ? `${Math.round(completed / total * 100)}%` : "–", accent: true },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" />
        <div className="flex items-center gap-3"><NotificationCenter /><LanguageSwitcher /><ProfileMenu /></div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* Verification warning */}
        {approvalStatus !== "approved" && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-700 text-sm">
                {approvalStatus === "rejected" ? t("pro_dashboard.verify_rejected_title") : t("pro_dashboard.verify_pending_title")}
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                {approvalStatus === "rejected"
                  ? t("pro_dashboard.verify_rejected_desc")
                  : t("pro_dashboard.verify_pending_desc")}
              </p>
            </div>
            <button onClick={() => navigate("/profile/professional")}
              className="text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
              {t("pro_dashboard.send_docs")}
            </button>
          </div>
        )}

        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-navy">{t("pro_dashboard.greeting", { name: firstName })} 👩‍⚕️</h1>
            <p className="text-slate-500 text-sm mt-1">{t("pro_dashboard.subtitle")}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/messages")}
              className="btn-outline flex items-center gap-2 text-sm">
              <MessageSquare size={16} /> {t("pro_dashboard.btn_messages")}
            </button>
            <button onClick={() => navigate("/availability")}
              className="btn-outline flex items-center gap-2 text-sm">
              <Clock size={16} /> {t("pro_dashboard.btn_availability")}
            </button>
            <span className={`text-sm font-medium ${hasAvailability ? "text-green-600" : "text-amber-600"}`}>
              {hasAvailability ? t("pro_dashboard.available") : t("pro_dashboard.no_slots")}
            </span>
            {!hasAvailability && (
              <button onClick={() => navigate("/availability")}
                className="text-xs text-blue-600 underline hover:text-blue-800">
                {t("pro_dashboard.add_slots")}
              </button>
            )}
            {approvalStatus !== "approved" && (
              <span className="text-xs text-amber-600 font-medium">{t("pro_dashboard.not_verified")}</span>
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
            <h3 className="font-semibold text-navy mb-4">{t("pro_dashboard.pending_title", { count: pending.length })}</h3>
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
                      <button onClick={() => handleAccept(b.id)} className="btn-primary text-xs px-3 py-1.5">{t("pro_dashboard.btn_accept")}</button>
                      <button onClick={() => handleDecline(b.id)} className="btn-outline text-xs px-3 py-1.5">{t("pro_dashboard.btn_decline")}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All bookings */}
        <div className="card p-6">
          <h3 className="font-semibold text-navy mb-4">{t("pro_dashboard.all_bookings")}</h3>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-6">{t("pro_dashboard.loading")}</p>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">{t("pro_dashboard.no_bookings")}</p>
          ) : (
            <div className="space-y-3">
              {bookings.map((b, i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50">
                  <div className="text-xs font-bold text-blue-500 w-20 flex-shrink-0">
                    {new Date(b.scheduled_start).toLocaleDateString("pt-BR")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy truncate">{b.service_type}</p>
                    <p className="text-xs text-slate-500">R${b.pro_payout?.toFixed(0)} {t("pro_dashboard.net")}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_COLOR[b.status]}`}>
                    {t(`pro_dashboard.status.${b.status}`)}
                  </span>
                  {(b.status === "accepted" || b.status === "pending") && b.status !== "cancelled" && b.status !== "completed" && (
                    <button onClick={() => setCancellingBooking(b)} className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 font-semibold flex-shrink-0">
                      {t("pro_dashboard.btn_cancel")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cancel modal */}
        {cancellingBooking && (
          <CancelBookingModal
            booking={cancellingBooking}
            cancelledBy="professional"
            onClose={() => setCancellingBooking(null)}
            onCancelled={() => { setCancellingBooking(null); window.location.reload(); }}
          />
        )}
      </div>
    </div>
  );
};

export default ProfessionalDashboard;