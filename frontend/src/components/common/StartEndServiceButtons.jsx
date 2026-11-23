import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Play, CheckCircle, Loader, AlertTriangle, Clock } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

// Rule #3 (21/11/2026) + Rule #1 (23/11/2026): the start window is
// [scheduled_start - 10 min, scheduled_start + 30 min]. Server is the source
// of truth — these values are the client-side UX hints; the backend enforces
// them independently and will 400 any attempt outside the window.
// Between +15 and +30 the start still goes through but is logged as a late
// arrival (we show a warning badge). Past +30 the pro can only start if the
// client has confirmed presence via /confirm-pro-presence, which sets
// booking.client_confirmed_pro_presence = true.
const EARLY_START_WINDOW_MINUTES = 10;
const LATE_ARRIVAL_AFTER_MINUTES  = 15;
const MAX_START_LATE_MINUTES      = 30;
// Finish side (23/11/2026): the pro may finalize up to 30 min past
// scheduled_end. After that the server auto-finishes at scheduled_end and
// the button is disabled with "use the extension flow next time". Staying
// longer requires the Service Extension flow — the grace is not paid time.
const MAX_FINISH_LATE_MINUTES = 30;

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
  // "Finalizar anterior e iniciar?" dialog — set by a 409 "pro_busy" from the
  // start endpoint. Holds the blocker payload from the server (code,
  // blocking_booking_id, service, patient, times, message). While non-null,
  // the dialog is rendered over the button. See the 409 branch in callStart.
  const [blockingInfo, setBlockingInfo] = useState(null);
  const [resolvingBlock, setResolvingBlock] = useState(false);
  // Drives re-renders of the time gate — ticked every 15s while the user is
  // within the "almost able to start" window so the button auto-enables at
  // T-10min without a manual refresh.
  const [, setNowTick] = useState(0);
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const status = booking?.status;
  const startAt = booking?.scheduled_start ? new Date(booking.scheduled_start) : null;
  const endAt   = booking?.scheduled_end   ? new Date(booking.scheduled_end)   : null;
  const now     = Date.now();

  const earliestStartMs = startAt && !isNaN(startAt.getTime())
    ? startAt.getTime() - EARLY_START_WINDOW_MINUTES * 60 * 1000
    : null;
  const lateCutoffMs = startAt && !isNaN(startAt.getTime())
    ? startAt.getTime() + MAX_START_LATE_MINUTES * 60 * 1000
    : null;
  const lateArrivalCutoffMs = startAt && !isNaN(startAt.getTime())
    ? startAt.getTime() + LATE_ARRIVAL_AFTER_MINUTES * 60 * 1000
    : null;

  const tooEarlyToStart = earliestStartMs !== null && now < earliestStartMs;
  const tooLateToStart  = lateCutoffMs !== null && now > lateCutoffMs
    && !booking?.client_confirmed_pro_presence;
  const isLateStart     = lateArrivalCutoffMs !== null
    && now >= lateArrivalCutoffMs
    && (!lateCutoffMs || now <= lateCutoffMs);

  // Finish side: window closes at scheduled_end + 30 min. Past that the
  // server auto-finishes and this button is disabled.
  const finishCutoffMs = endAt && !isNaN(endAt.getTime())
    ? endAt.getTime() + MAX_FINISH_LATE_MINUTES * 60 * 1000
    : null;
  const tooLateToFinish = finishCutoffMs !== null && now > finishCutoffMs;
  const isPastScheduledEnd = endAt && !isNaN(endAt.getTime()) && now > endAt.getTime();

  const minsUntilStart  = earliestStartMs !== null
    ? Math.max(1, Math.ceil((earliestStartMs - now) / 60000))
    : null;

  // Keep the button fresh while we wait for the gate to open or close. 15 s
  // resolution is fine — the user won't notice a <15 s drift and we avoid
  // thrashing. useEffect declared BEFORE any early return so hooks order is
  // stable across renders (React rule).
  const needsTicker = tooEarlyToStart || (startAt && !tooLateToStart && !isLateStart);
  useEffect(() => {
    if (!needsTicker) return;
    const h = setInterval(() => setNowTick(x => x + 1), 15000);
    return () => clearInterval(h);
  }, [needsTicker]);

  if (!booking || !booking.id || !booking.status) return null;

  // Past-booking gate: once the service window is fully over, the pro can no
  // longer "start" a service that was never started. In-progress bookings
  // (canFinish) are unaffected — a pro who checked in must still be able to
  // check out even if the scheduled end has passed.
  const isPast = endAt && !isNaN(endAt.getTime()) && endAt.getTime() < now;

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
        const msg = typeof detail === "string"
          ? detail
          : (detail?.message || t("start_end_service.action_error"));
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  // Start flow — like callAndHandle, but intercepts the "pro_busy" 409 and
  // surfaces the "Finalizar anterior?" dialog instead of toasting the error.
  const handleStart = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const gps = await getGPS();
      const { data } = await axios.post(
        `${API}/api/bookings/${booking.id}/start-service-combined`,
        gps, { headers }
      );
      if (data?.flagged) {
        toast(t("start_end_service.out_of_radius_warning"), { icon: "📍", duration: 5000 });
      } else if (data?.already_started) {
        toast(t("start_end_service.already_started"));
      } else {
        toast.success(t("start_end_service.started"));
      }
      onUpdate?.(data);
    } catch (err) {
      if (typeof err === "string") {
        toast.error(err);
      } else {
        const status = err?.response?.status;
        const detail = err?.response?.data?.detail;
        // Rule (23/11/2026) — pro has an unfinished previous service.
        if (status === 409 && detail && typeof detail === "object" && detail.code === "pro_busy") {
          setBlockingInfo(detail);
        } else {
          const msg = typeof detail === "string"
            ? detail
            : (detail?.message || t("start_end_service.action_error"));
          toast.error(msg);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  // Chain the "finish previous, then start this one" flow invoked from the
  // blocking dialog. Uses a single GPS read for both calls so we don't
  // double-prompt the pro and both legs reflect the same current location.
  const handleFinishPreviousAndStart = async () => {
    if (resolvingBlock || !blockingInfo?.blocking_booking_id) return;
    setResolvingBlock(true);
    try {
      const gps = await getGPS();
      // 1. Checkout the previous one (GPS checkout; soft-flagged if the pro
      //    is already at the next client's address). If this 400s (e.g. its
      //    own 30-min finish window expired) we surface the message and bail
      //    — the next step won't run.
      await axios.post(
        `${API}/api/bookings/${blockingInfo.blocking_booking_id}/checkout`,
        gps, { headers }
      );
      // 2. Start the new one.
      const { data: startData } = await axios.post(
        `${API}/api/bookings/${booking.id}/start-service-combined`,
        gps, { headers }
      );
      toast.success(t("start_end_service.finished_previous_and_started"));
      setBlockingInfo(null);
      onUpdate?.(startData);
    } catch (err) {
      if (typeof err === "string") {
        toast.error(err);
      } else {
        const detail = err?.response?.data?.detail;
        const msg = typeof detail === "string"
          ? detail
          : (detail?.message || t("start_end_service.action_error"));
        toast.error(msg);
      }
    } finally {
      setResolvingBlock(false);
    }
  };

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

  // "Finalizar anterior e iniciar?" modal — rendered as a position:fixed
  // overlay, so it visually floats over the chip regardless of where in the
  // parent tree the button lives (compact dashboard rows included).
  // Rendered via `wrap()` below so every early return still mounts it.
  const blockFmtTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };
  const blockingDialog = blockingInfo ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
         onClick={(e) => { e.stopPropagation(); if (!resolvingBlock) setBlockingInfo(null); }}>
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-navy text-base leading-tight">
              {t("start_end_service.block_dialog_title")}
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-snug">
              {t("start_end_service.block_dialog_message")}
            </p>
          </div>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 mb-4 text-xs">
          <div className="font-semibold text-slate-700 truncate">
            {blockingInfo.blocking_service_type || t("start_end_service.block_service_default")}
            {blockingInfo.blocking_booking_code && (
              <span className="text-slate-400 font-normal"> · {blockingInfo.blocking_booking_code}</span>
            )}
          </div>
          {blockingInfo.blocking_patient_name && (
            <div className="text-slate-500 mt-0.5 truncate">{blockingInfo.blocking_patient_name}</div>
          )}
          {blockingInfo.blocking_scheduled_end && (
            <div className="text-slate-400 mt-0.5">
              {t("start_end_service.block_scheduled_end", { time: blockFmtTime(blockingInfo.blocking_scheduled_end) })}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleFinishPreviousAndStart}
            disabled={resolvingBlock}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 disabled:opacity-60">
            {resolvingBlock
              ? <Loader size={14} className="animate-spin" />
              : <CheckCircle size={14} />}
            {t("start_end_service.block_finish_and_start")}
          </button>
          <button
            onClick={() => setBlockingInfo(null)}
            disabled={resolvingBlock}
            className="w-full py-2 rounded-xl text-slate-500 text-sm hover:text-slate-700 disabled:opacity-60">
            {t("start_end_service.block_cancel")}
          </button>
        </div>
      </div>
    </div>
  ) : null;
  const wrap = (content) => (<>{content}{blockingDialog}</>);

  if (canStart) {
    // Rule #3 — before T-10 min: disabled, "faltam N min".
    if (tooEarlyToStart) {
      const disabledBtn = (
        <button
          disabled
          aria-disabled="true"
          title={t("start_end_service.too_early_hint")}
          className={compact
            ? `${baseBtn} bg-slate-300 text-slate-600 cursor-not-allowed`
            : `${baseBtn} opacity-60 cursor-not-allowed`}>
          <Clock size={compact ? 12 : 14} />
          {t("start_end_service.start")}
        </button>
      );
      if (compact) return wrap(disabledBtn);
      return wrap(
        <div className="w-full">
          {disabledBtn}
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1.5 leading-snug">
            <Clock size={12} className="flex-shrink-0 text-amber-500" />
            <span>
              {t("start_end_service.too_early_hint")}
              {minsUntilStart !== null && (
                <span className="text-slate-400">
                  {" "}· {t("start_end_service.minutes_left", { count: minsUntilStart })}
                </span>
              )}
            </span>
          </p>
        </div>
      );
    }

    // Rule #1 — past T+30 and no client-confirmed override: cannot start.
    // The client-side ClientBookingDetailModal exposes "Confirmar presença
    // do profissional" which POSTs /confirm-pro-presence and sets
    // booking.client_confirmed_pro_presence=true, which re-enables this
    // button on the next refetch.
    if (tooLateToStart) {
      const disabledBtn = (
        <button
          disabled
          aria-disabled="true"
          title={t("start_end_service.too_late_hint")}
          className={compact
            ? `${baseBtn} bg-slate-300 text-slate-600 cursor-not-allowed`
            : `${baseBtn} opacity-60 cursor-not-allowed`}>
          <AlertTriangle size={compact ? 12 : 14} />
          {t("start_end_service.start")}
        </button>
      );
      if (compact) return wrap(disabledBtn);
      return wrap(
        <div className="w-full">
          {disabledBtn}
          <p className="mt-2 text-xs text-red-500 flex items-center gap-1.5 leading-snug">
            <AlertTriangle size={12} className="flex-shrink-0" />
            <span>{t("start_end_service.too_late_hint")}</span>
          </p>
        </div>
      );
    }

    // Rule #1 — between T+15 and T+30: start is still allowed but the
    // booking will be flagged as a late arrival by the server. Show a warn
    // badge so the pro knows the counter will tick up.
    const startButton = (
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
    if (!isLateStart || compact) return wrap(startButton);
    return wrap(
      <div className="w-full">
        {startButton}
        <p className="mt-2 text-xs text-amber-600 flex items-center gap-1.5 leading-snug">
          <AlertTriangle size={12} className="flex-shrink-0" />
          <span>{t("start_end_service.late_arrival_warning")}</span>
        </p>
      </div>
    );
  }

  // ── canFinish ──
  // Finish-side rule (23/11/2026):
  //  - past scheduled_end but within the 30-min grace → button enabled, with
  //    an amber hint that staying longer requires the Extension flow (the
  //    grace is NOT free paid time).
  //  - past scheduled_end + 30 → button disabled; the scheduler sweep will
  //    auto-finalize the booking at scheduled_end. Pro sees a message about
  //    using the Extension flow next time.
  if (tooLateToFinish) {
    const disabledBtn = (
      <button
        disabled
        aria-disabled="true"
        title={t("start_end_service.finish_window_expired_hint")}
        className={compact
          ? `${baseBtn} bg-slate-300 text-slate-600 cursor-not-allowed`
          : `${baseBtn} opacity-60 cursor-not-allowed`}>
        <AlertTriangle size={compact ? 12 : 14} />
        {t("start_end_service.finish")}
      </button>
    );
    if (compact) return wrap(disabledBtn);
    return wrap(
      <div className="w-full">
        {disabledBtn}
        <p className="mt-2 text-xs text-red-500 flex items-center gap-1.5 leading-snug">
          <AlertTriangle size={12} className="flex-shrink-0" />
          <span>{t("start_end_service.finish_window_expired_hint")}</span>
        </p>
      </div>
    );
  }

  const finishButton = (
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
  if (!isPastScheduledEnd || compact) return wrap(finishButton);
  return wrap(
    <div className="w-full">
      {finishButton}
      <p className="mt-2 text-xs text-amber-600 flex items-center gap-1.5 leading-snug">
        <AlertTriangle size={12} className="flex-shrink-0" />
        <span>{t("start_end_service.past_end_hint")}</span>
      </p>
    </div>
  );
};

export default StartEndServiceButtons;