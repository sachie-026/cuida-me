import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Clock, CheckCircle, XCircle, History as HistoryIcon, Star } from "lucide-react";
import axios from "axios";
import Logo from "../../components/common/Logo";
import ProfileMenu from "../../components/common/ProfileMenu";
import BookingDetailModal from "../../components/common/BookingDetailModal";
import ClientBookingDetailModal from "../../components/common/ClientBookingDetailModal";
import RatingModal from "../../components/common/RatingModal";
import { formatBRL } from "../../utils/format";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

/** Change 44b — Read-only booking history, shared by client + professional.
 *
 * - Uses the existing `/api/bookings/my-bookings` endpoint (auto-scoped by role).
 * - Shows bookings that are finalized (completed / cancelled / no_show) OR
 *   whose service window has fully passed (pending/accepted but past).
 * - No Start / Cancel buttons — read-only. Tapping a row opens the correct
 *   detail modal (pro vs client) for review.
 */
const FINAL_STATUSES = new Set(["completed", "cancelled", "no_show", "under_review"]);
const PRO_ROLES = ["nurse", "technician", "nursing_assistant", "caregiver"];

const STATUS_PALETTE = {
  completed:  { bg: "bg-green-100 text-green-700", icon: CheckCircle },
  cancelled:  { bg: "bg-red-100 text-red-600",     icon: XCircle },
  no_show:    { bg: "bg-red-100 text-red-600",     icon: XCircle },
  under_review: { bg: "bg-amber-100 text-amber-700", icon: Clock },
  expired:    { bg: "bg-slate-200 text-slate-600", icon: Clock },
};

const BookingHistory = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState(null);
  // When set, opens the RatingModal for this booking. Kept separate from
  // `selectedBooking` so tapping the Rate chip does not also open the
  // (larger) detail modal underneath it.
  const [ratingBooking, setRatingBooking] = useState(null);

  // Role detection — picks the right detail modal
  const role = (localStorage.getItem("role") || "").toLowerCase();
  const isPro = PRO_ROLES.includes(role);

  const loadBookings = useCallback(() => {
    setLoading(true);
    axios.get(`${API}/api/bookings/my-bookings`, { headers })
      .then(r => setBookings(Array.isArray(r.data) ? r.data : []))
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  const historyBookings = useMemo(() => {
    const now = Date.now();
    return bookings.filter(b => {
      if (FINAL_STATUSES.has(b.status)) return true;
      // pending/accepted bookings whose end-time is past also count as history
      if (!["pending", "accepted"].includes(b.status)) return false;
      if (!b.scheduled_end) return false;
      const endMs = new Date(b.scheduled_end).getTime();
      return !isNaN(endMs) && endMs < now;
    });
  }, [bookings]);

  const effectiveLabel = (b) => {
    if (FINAL_STATUSES.has(b.status)) return t(`booking_detail.status.${b.status}`, { defaultValue: b.status });
    return t("history.expired");
  };
  const effectivePalette = (b) => {
    if (FINAL_STATUSES.has(b.status)) return STATUS_PALETTE[b.status] || STATUS_PALETTE.expired;
    return STATUS_PALETTE.expired;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" />
        <ProfileMenu />
      </nav>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <ChevronLeft size={20} />
          </button>
          <h1 className="font-display text-2xl font-bold text-navy flex items-center gap-2">
            <HistoryIcon size={20} className="text-blue-500" />
            {t("history.title")}
          </h1>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">{t("history.loading")}</p>
        ) : historyBookings.length === 0 ? (
          <div className="card p-8 text-center">
            <HistoryIcon size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500">{t("history.empty")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {historyBookings.map(b => {
              const { bg, icon: Icon } = effectivePalette(b);
              const label = effectiveLabel(b);
              return (
                <div key={b.id}
                  onClick={() => setSelectedBooking(b)}
                  className="card p-4 cursor-pointer hover:ring-2 hover:ring-blue-200 transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${bg}`}>
                          <Icon size={11} /> {label}
                        </span>
                        <span className="text-xs text-slate-400">
                          {b.scheduled_start && new Date(b.scheduled_start).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-navy truncate">
                        {b.service_type || t("history.service_default")}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {b.scheduled_start && new Date(b.scheduled_start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        {b.scheduled_end && ` – ${new Date(b.scheduled_end).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-navy">
                        {formatBRL(isPro ? (b.pro_payout || 0) : (b.total_price || 0))}
                      </p>
                      {b.cancel_reason && (
                        <p className="text-[10px] text-red-500 mt-0.5 max-w-[150px] truncate" title={b.cancel_reason}>
                          {b.cancel_reason.substring(0, 30)}{b.cancel_reason.length > 30 ? "..." : ""}
                        </p>
                      )}
                      {/* Rating chip — completed bookings only.
                          - Already rated → "Avaliado" badge (static).
                          - Can rate → "Avaliar" button; opens RatingModal.
                          - Window closed (user made a newer request) → nothing.
                          stopPropagation prevents the row's own onClick from
                          also opening the detail modal underneath. */}
                      {b.status === "completed" && b.current_user_has_rated && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          <Star size={10} className="fill-amber-500 text-amber-500" />
                          {t("history.rated")}
                        </span>
                      )}
                      {b.status === "completed" && !b.current_user_has_rated && b.current_user_can_rate && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setRatingBooking(b); }}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                        >
                          <Star size={11} /> {t("history.rate_button")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Read-only detail — pick the right modal for the role.
          No action handlers wired (onAccept, onDecline, etc. intentionally omitted). */}
      {selectedBooking && isPro && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
        />
      )}
      {selectedBooking && !isPro && (
        <ClientBookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
        />
      )}

      {/* Rating flow — fired from the row's "Avaliar" chip. The backend
          auto-resolves `reviewee_id` from the booking when it is omitted,
          so we don't need to pass revieweeId here. On successful submit
          we refetch the list so the chip flips to "Avaliado" live. */}
      {ratingBooking && (
        <RatingModal
          booking={ratingBooking}
          onClose={() => setRatingBooking(null)}
          onDone={() => { setRatingBooking(null); loadBookings(); }}
        />
      )}
    </div>
  );
};

export default BookingHistory;