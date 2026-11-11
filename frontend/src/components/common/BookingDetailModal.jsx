import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, MapPin, Clock, User, Star, Phone, MessageSquare, CheckCircle, AlertCircle, Navigation, Timer } from "lucide-react";
import CareBadges from "./CareBadges";
import VerifiedBadge from "./VerifiedBadge";
import { formatBRL } from "../../utils/format";

const BookingDetailModal = ({ booking, onClose, onAccept, onDecline, onChat }) => {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(null);

  // #39: Countdown timer for pending requests
  useEffect(() => {
    if (booking?.status !== "pending" || !booking?.match_deadline) return;
    const interval = setInterval(() => {
      const remaining = (new Date(booking.match_deadline) - Date.now()) / 1000;
      if (remaining <= 0) { setCountdown(t("booking_detail.expired")); clearInterval(interval); return; }
      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = Math.floor(remaining % 60);
      setCountdown(`${h}h ${m.toString().padStart(2,"0")}m ${s.toString().padStart(2,"0")}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [booking?.match_deadline, booking?.status, t]);
  if (!booking) return null;

  const statusLabel = t(`booking_detail.status.${booking.status}`, { defaultValue: booking.status });
  const statusColors = {
    pending: "bg-yellow-100 text-yellow-700",
    accepted: "bg-blue-100 text-blue-700",
    professional_arrived: "bg-indigo-100 text-indigo-700",
    checked_in: "bg-purple-100 text-purple-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-600",
    no_show: "bg-red-100 text-red-600",
    under_review: "bg-amber-100 text-amber-700",
  };
  const statusColor = statusColors[booking.status] || statusColors.pending;

  const isPending = booking.status === "pending";
  const isAccepted = booking.status === "accepted" || booking.status === "professional_arrived" || booking.status === "checked_in";
  const isCompleted = booking.status === "completed";
  const isCancelled = booking.status === "cancelled" || booking.status === "no_show";
  const isFinished = isCompleted || isCancelled;

  // LGPD: client name visibility — pending shows first name only, finished hides contact
  const clientDisplayName = isPending
    ? (booking.client_name?.split(" ")[0] || t("booking_detail.client"))
    : (booking.client_name || t("booking_detail.client"));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor}`}>{statusLabel}</span>
            <h3 className="font-display text-lg font-bold text-navy mt-2">{booking.service_type || t("booking_detail.service_default")}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* #39: Countdown timer */}
        {isPending && countdown && (
          <div className={`flex items-center gap-2 p-3 rounded-xl mb-3 ${
            countdown === t("booking_detail.expired") ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"}`}>
            <Timer size={14} className={countdown === t("booking_detail.expired") ? "text-red-500" : "text-amber-500"} />
            <span className={`text-sm font-semibold ${countdown === t("booking_detail.expired") ? "text-red-600" : "text-amber-700"}`}>
              {countdown === t("booking_detail.expired") ? t("booking_detail.time_expired") : `${t("booking_detail.time_remaining")} ${countdown}`}
            </span>
          </div>
        )}

        {/* Schedule */}
        <div className="flex items-center gap-2 text-sm text-slate-600 mb-3">
          <Clock size={14} className="text-slate-400" />
          <span>
            {booking.scheduled_start && new Date(booking.scheduled_start).toLocaleDateString("pt-BR", { weekday:"long", day:"numeric", month:"long" })}
            {" · "}
            {booking.scheduled_start && new Date(booking.scheduled_start).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}
            {booking.scheduled_end && ` – ${new Date(booking.scheduled_end).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}`}
          </span>
        </div>
        {booking.duration_hours && (
          <p className="text-xs text-slate-500 mb-3">⏱ {t("booking_detail.duration")} {booking.duration_hours}h</p>
        )}

        {/* Services / Care badges */}
        {booking.services?.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1.5">{t("booking_detail.services")}</p>
            <CareBadges services={booking.services} isNight={booking.shift === "night"} isUrgent={booking.is_urgent} isHoliday={booking.is_holiday} size="lg" />
          </div>
        )}

        {/* Client info — hidden for completed/cancelled (LGPD) */}
        {!isFinished && (
          <div className="p-3 bg-slate-50 rounded-xl mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t("booking_detail.client")}</p>
            <div className="flex items-center gap-2 mb-1">
              <User size={14} className="text-slate-400" />
              <span className="text-sm font-medium text-navy">{clientDisplayName}</span>
              {booking.client_verified && <VerifiedBadge type="client" verified={true} size="sm" />}
            </div>
            {booking.client_reliability && (
              <p className="text-xs text-slate-500">{t("booking_detail.reliability")} {booking.client_reliability}%</p>
            )}
          </div>
        )}

        {/* Patient info — always visible (except completed/cancelled contact info) */}
        {booking.patient_name && (
          <div className="p-3 bg-slate-50 rounded-xl mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t("booking_detail.patient")}</p>
            <div className="flex items-center gap-2">
              <User size={14} className="text-slate-400" />
              <span className="text-sm font-medium text-navy">
                {isFinished ? booking.patient_name?.split(" ")[0] : booking.patient_name}
              </span>
            </div>
          </div>
        )}

        {/* Location — approximate before accept, full after, hidden when finished (LGPD) */}
        {!isFinished && (
          <div className="p-3 bg-slate-50 rounded-xl mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
              {isPending ? t("booking_detail.approximate_location") : t("booking_detail.address")}
            </p>
            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-slate-400 mt-0.5" />
              <span className="text-sm text-slate-600">
                {isPending
                  ? (booking.approximate_location || booking.city || t("booking_detail.region_not_provided"))
                  : (booking.address || booking.city || t("booking_detail.address_not_provided"))}
              </span>
            </div>
            {isPending && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertCircle size={11} /> {t("booking_detail.address_after_accept")}
              </p>
            )}
            {/* Navigation buttons — only for accepted */}
            {isAccepted && booking.address && (
              <div className="flex gap-2 mt-2">
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(booking.address)}`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
                  <Navigation size={12} /> {t("booking_detail.open_maps")}
                </a>
                <a href={`https://waze.com/ul?q=${encodeURIComponent(booking.address)}&navigate=yes`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition-colors">
                  <Navigation size={12} /> {t("booking_detail.open_waze")}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Pricing */}
        <div className="p-3 bg-green-50 rounded-xl mb-4 border border-green-100">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase">{t("booking_detail.your_earnings")}</p>
            <p className="text-lg font-bold text-green-700">{formatBRL(booking.pro_payout || booking.total_price || 0)}</p>
          </div>
        </div>

        {/* Notes */}
        {booking.notes && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{t("booking_detail.notes")}</p>
            <p className="text-sm text-slate-600">{booking.notes}</p>
          </div>
        )}

        {/* Emergency contact — only for accepted bookings */}
        {isAccepted && (booking.emergency_name || booking.emergency_phone) && (
          <div className="p-3 bg-red-50 rounded-xl mb-4 border border-red-100">
            <p className="text-xs font-semibold text-red-600 uppercase mb-1">{t("booking_detail.emergency_contact")}</p>
            <p className="text-sm text-red-700">{booking.emergency_name} · {booking.emergency_phone}</p>
          </div>
        )}

        {/* Reschedule request */}
        {booking.reschedule_status === "requested" && (
          <div className="p-3 bg-amber-50 rounded-xl mb-4 border border-amber-200">
            <p className="text-xs font-semibold text-amber-700 uppercase mb-1">{t("booking_detail.reschedule_request")}</p>
            <p className="text-sm text-amber-600">
              {t("booking_detail.new_date")} {booking.reschedule_new_start && new Date(booking.reschedule_new_start).toLocaleDateString("pt-BR")}
              {" · "}
              {booking.reschedule_new_start && new Date(booking.reschedule_new_start).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}
            </p>
          </div>
        )}

        {/* Contact buttons — WhatsApp + Call — only for accepted (LGPD) */}
        {isAccepted && booking.client_phone && (
          <div className="flex gap-2 mb-4">
            <a href={`https://wa.me/55${booking.client_phone.replace(/\D/g, "")}`}
              target="_blank" rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 transition-colors">
              <MessageSquare size={14} /> WhatsApp
            </a>
            <a href={`tel:${booking.client_phone}`}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors">
              <Phone size={14} /> {t("booking_detail.call")}
            </a>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-2">
          {isPending && onAccept && (
            <>
              <button onClick={() => onAccept(booking.id)} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                <CheckCircle size={14} /> {t("booking_detail.accept")}
              </button>
              <button onClick={() => onDecline(booking.id)} className="btn-outline flex-1 text-red-500 border-red-200 hover:bg-red-50">
                {t("booking_detail.decline")}
              </button>
            </>
          )}
          {isAccepted && onChat && (
            <button onClick={() => onChat(booking.id)} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
              <MessageSquare size={14} /> {t("booking_detail.chat_client")}
            </button>
          )}
          {isCompleted && (
            <button onClick={() => {/* TODO: navigate to rate */}} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
              <Star size={14} /> {t("booking_detail.rate_client")}
            </button>
          )}
          <button onClick={onClose} className="btn-outline flex-1">{t("booking_detail.close")}</button>
        </div>
      </div>
    </div>
  );
};

export default BookingDetailModal;