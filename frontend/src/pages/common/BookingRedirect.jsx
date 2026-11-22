// BookingRedirect — target of every notification's /bookings/<id> link.
//
// Why this exists: notification rules point to `/bookings/<booking_id>`,
// but there was no `/bookings/:id` React route, so clicking any notification
// fell through the Router's catch-all `*` → <NotFound /> → 404.
//
// Behavior:
//  1. Fetch the booking by id via GET /api/bookings/:id.
//  2. 404 from the API → show a friendly "booking not found" screen with
//     links to Notifications and History (not a hard 404).
//  3. Other error → show error screen with a retry button.
//  4. Success → render the correct detail modal (Pro vs Client) directly
//     on top of a neutral backdrop. Closing the modal navigates to:
//       - /history         if the booking is finalized or past
//       - /dashboard/<role> otherwise
//
// No changes to existing Dashboard pages — this page owns the modal itself,
// so there are no race conditions with "?open=<id>" query params.
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Calendar, AlertCircle, ArrowLeft, Bell, Clock } from "lucide-react";
import axios from "axios";
import BookingDetailModal from "../../components/common/BookingDetailModal";
import ClientBookingDetailModal from "../../components/common/ClientBookingDetailModal";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";
const PRO_ROLES = ["nurse", "technician", "nursing_assistant", "caregiver"];
const FINAL_STATUSES = new Set(["completed", "cancelled", "no_show", "under_review"]);

const BookingRedirect = () => {
  const { t } = useTranslation();
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const role = (localStorage.getItem("role") || "").toLowerCase();
  const isPro = PRO_ROLES.includes(role);

  const [booking, setBooking] = useState(null);
  const [status, setStatus] = useState("loading"); // "loading" | "ok" | "notfound" | "error"

  // Where we send the user when they close the modal, or when the lookup fails.
  const dashboardHome = isPro ? "/dashboard/professional" : "/dashboard/client";

  const fetchBooking = async () => {
    if (!bookingId) { setStatus("notfound"); return; }
    if (!token)     { navigate("/login"); return; }
    setStatus("loading");
    try {
      const r = await axios.get(`${API}/api/bookings/${bookingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBooking(r.data);
      setStatus("ok");
    } catch (e) {
      const code = e?.response?.status;
      // 403 (no access) is treated the same as 404 to the end user — they
      // shouldn't be able to tell the difference between "doesn't exist"
      // and "exists but belongs to someone else" from this screen.
      if (code === 404 || code === 403) setStatus("notfound");
      else setStatus("error");
    }
  };

  useEffect(() => { fetchBooking(); /* eslint-disable-next-line */ }, [bookingId]);

  // Close handler: send the user somewhere real, not back here.
  const handleClose = () => {
    if (!booking) { navigate(dashboardHome); return; }
    const scheduledEnd = booking.scheduled_end ? new Date(booking.scheduled_end) : null;
    const isPast = scheduledEnd && scheduledEnd.getTime() < Date.now();
    if (FINAL_STATUSES.has(booking.status) || isPast) navigate("/history");
    else navigate(dashboardHome);
  };

  // ── Rendering ──────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Clock size={28} className="animate-pulse" />
          <p className="text-sm">{t("booking_redirect.loading")}</p>
        </div>
      </div>
    );
  }

  if (status === "notfound") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
            <Calendar size={24} className="text-amber-500" />
          </div>
          <h1 className="text-lg font-bold text-navy mb-1">
            {t("booking_redirect.not_found_title")}
          </h1>
          <p className="text-sm text-slate-500 mb-5">
            {t("booking_redirect.not_found_message")}
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate("/notifications")}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
            >
              <Bell size={16} />
              {t("booking_redirect.go_notifications")}
            </button>
            <button
              onClick={() => navigate("/history")}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
            >
              {t("booking_redirect.go_history")}
            </button>
            <button
              onClick={() => navigate(dashboardHome)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-slate-500 text-sm hover:text-slate-700 transition-colors"
            >
              <ArrowLeft size={14} />
              {t("booking_redirect.go_dashboard")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
            <AlertCircle size={24} className="text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-navy mb-1">{t("booking_redirect.error_title")}</h1>
          <p className="text-sm text-slate-500 mb-5">{t("booking_redirect.error_message")}</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={fetchBooking}
              className="w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
            >
              {t("booking_redirect.retry")}
            </button>
            <button
              onClick={() => navigate(dashboardHome)}
              className="w-full py-2.5 text-slate-500 text-sm hover:text-slate-700 transition-colors"
            >
              {t("booking_redirect.go_dashboard")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // status === "ok" → render the right modal on a neutral backdrop.
  // Both modals render their own overlay; this wrapper gives them a page to
  // sit on so the URL `/bookings/<id>` has something behind it if the modal
  // itself ever fails to mount for any reason.
  return (
    <div className="min-h-screen bg-slate-50">
      {isPro ? (
        <BookingDetailModal
          booking={booking}
          onClose={handleClose}
          onBookingChanged={(updated) => setBooking(updated)}
        />
      ) : (
        <ClientBookingDetailModal
          booking={booking}
          onClose={handleClose}
          onUpdated={(updated) => setBooking(updated)}
        />
      )}
    </div>
  );
};

export default BookingRedirect;