import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, CheckCircle, Loader, AlertTriangle } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

/** Change 44a — Start / End service buttons for the professional.
 *
 * Shows ONE button at a time, depending on booking.status:
 *   accepted                        → "Iniciar atendimento"   (POST /start-service-combined)
 *   checked_in | professional_arrived → "Finalizar atendimento" (POST /checkout)
 *   anything else                   → renders null (safe no-op)
 *
 * Props:
 *   - booking: the booking object (needs at least `id` and `status`)
 *   - onUpdate(updatedBookingPartial?): fired after any successful action so the
 *                                       parent can refetch or patch local state.
 *   - compact: boolean — when true, renders a smaller inline-friendly button
 *              for list rows. Defaults to false (full-width primary button).
 *
 * Safe against:
 *   - Missing booking / unexpected status      → returns null
 *   - Browser without geolocation              → toast + abort
 *   - User denies / times out location prompt  → toast + abort (button re-enabled)
 *   - Rapid double-tap                         → `busy` state disables the button
 *   - Server 400 (status conflict, race)       → toast with server's `detail`
 *   - Out-of-radius soft flag                  → toast warning but action succeeds
 *   - Network error                            → generic toast + button re-enabled
 */
const StartEndServiceButtons = ({ booking, onUpdate, compact = false }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  if (!booking || !booking.id || !booking.status) return null;

  const status = booking.status;
  // Past-booking gate: once the service window is fully over, the pro can no
  // longer "start" a service that was never started. In-progress bookings
  // (canFinish) are unaffected — a pro who checked in must still be able to
  // check out even if the scheduled end has passed.
  const now = new Date();
  const endAt = booking.scheduled_end ? new Date(booking.scheduled_end) : null;
  const isPast = endAt && !isNaN(endAt.getTime()) && endAt.getTime() < now.getTime();

  const canStart  = status === "accepted" && !isPast;
  const canFinish = status === "checked_in" || status === "professional_arrived";
  if (!canStart && !canFinish) return null;

  // GPS helper — resolves with {latitude, longitude} or rejects with a translated string
  const getGPS = () => new Promise((resolve, reject) => {
    if (!navigator?.geolocation) {
      reject(t("start_end_service.gps_unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => {
        if (err.code === 1)      reject(t("start_end_service.gps_denied"));
        else if (err.code === 3) reject(t("start_end_service.gps_timeout"));
        else                     reject(t("start_end_service.gps_error"));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

  const callAndHandle = async (url, successKey) => {
    if (busy) return;                          // rapid-tap guard
    setBusy(true);
    try {
      const gps = await getGPS();
      const { data } = await axios.post(`${API}${url}`, gps, { headers });
      if (data?.flagged) {
        toast(t("start_end_service.out_of_radius_warning"), { icon: "📍", duration: 5000 });
      } else if (data?.already_started) {
        toast(t("start_end_service.already_started"));
      } else if (data?.early_termination && data?.refund_amount > 0) {
        // Backend recalculated; show the adjusted refund to the pro
        toast.success(
          t("start_end_service.finished_adjusted", { refund: data.refund_amount.toFixed(2) }),
          { duration: 6000 }
        );
      } else {
        toast.success(t(successKey));
      }
      onUpdate?.(data);
    } catch (err) {
      if (typeof err === "string") {
        toast.error(err);                      // GPS-side rejection
      } else {
        const detail = err?.response?.data?.detail;
        toast.error(detail || t("start_end_service.action_error"));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleStart = () => callAndHandle(`/api/bookings/${booking.id}/start-service-combined`, "start_end_service.started");

  // Early-finalize confirmation — if more than 10 min before scheduled_end, warn
  // the pro that the price will be adjusted (Change 23/30, enforced server-side).
  const handleFinish = () => {
    const schedEnd = booking.scheduled_end ? new Date(booking.scheduled_end) : null;
    if (schedEnd && !isNaN(schedEnd.getTime())) {
      const minutesEarly = (schedEnd.getTime() - Date.now()) / 60000;
      if (minutesEarly > 10) {
        const hh = String(schedEnd.getHours()).padStart(2, "0");
        const mm = String(schedEnd.getMinutes()).padStart(2, "0");
        const confirmMsg = t("start_end_service.early_finish_confirm", { time: `${hh}:${mm}` });
        if (!window.confirm(confirmMsg)) return;
      }
    }
    callAndHandle(`/api/bookings/${booking.id}/checkout`, "start_end_service.finished");
  };

  const baseBtn = compact
    ? "text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 disabled:opacity-50"
    : "btn-primary w-full flex items-center justify-center gap-1.5 disabled:opacity-50";

  if (canStart) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); handleStart(); }}
        disabled={busy}
        className={compact ? `${baseBtn} bg-emerald-500 text-white hover:bg-emerald-600` : baseBtn}
        title={t("start_end_service.start_tooltip")}>
        {busy ? <Loader size={compact ? 12 : 14} className="animate-spin" />
              : <Play   size={compact ? 12 : 14} />}
        {t("start_end_service.start")}
      </button>
    );
  }

  // canFinish
  return (
    <button
      onClick={(e) => { e.stopPropagation(); handleFinish(); }}
      disabled={busy}
      className={compact ? `${baseBtn} bg-blue-500 text-white hover:bg-blue-600` : baseBtn}
      title={t("start_end_service.finish_tooltip")}>
      {busy ? <Loader       size={compact ? 12 : 14} className="animate-spin" />
            : <CheckCircle  size={compact ? 12 : 14} />}
      {t("start_end_service.finish")}
    </button>
  );
};

export default StartEndServiceButtons;