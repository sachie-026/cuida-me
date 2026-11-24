import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, MapPin, Clock, User, Phone, Edit2, Save, AlertCircle, Loader, CheckCircle2, Hourglass, Star, Zap } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import CareBadges from "./CareBadges";
import QuickMessagesButtons from "./QuickMessagesButtons";
import ExtendServiceModal from "./ExtendServiceModal";
import DurationChangeModal from "./DurationChangeModal";
import RatingModal from "./RatingModal";
import { formatBRL } from "../../utils/format";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const FINALIZED = new Set(["completed", "cancelled", "no_show"]);

// Rule #1 (23/11/2026): after T+30 min the pro can't start on their own.
// Client can confirm presence past this point, which unlocks start under
// admin review.
const MAX_START_LATE_MINUTES = 30;

// Backend returns naive ISO strings (no TZ offset). Browsers parse them as
// local time, so the displayed hour matches what was originally stored — no
// TZ conversion is done anywhere and the app treats all times as wall-clock
// Brazilian time end-to-end.
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }) : "";
const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";

const ClientBookingDetailModal = ({ booking, onClose, onUpdated }) => {
  const { t } = useTranslation();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(booking?.notes || "");
  const [emName, setEmName] = useState(booking?.emergency_name || "");
  const [emPhone, setEmPhone] = useState(booking?.emergency_phone || "");
  const [confirmingPresence, setConfirmingPresence] = useState(false);
  // Rule #5 — "Estender atendimento" modal state.
  const [showExtend, setShowExtend] = useState(false);
  // Item 6 (24/11/2026) — duration-change modal state.
  const [showDurationChange, setShowDurationChange] = useState(false);
  // Rating flow — matches BookingDetailModal's pro-side pattern. `justRated`
  // tracks local state within this open modal; `current_user_has_rated` on
  // the booking row is the persistent flag (set by GET /my-bookings when the
  // Assessment row exists). Either being true hides the Rate button.
  const [showRating, setShowRating] = useState(false);
  const [justRated, setJustRated] = useState(false);
  // Local optimistic flag — the booking object is immutable from this
  // modal's perspective (parent owns refetch), so we mirror the state
  // after a successful POST so the button hides until the parent refreshes.
  const [presenceConfirmedLocal, setPresenceConfirmedLocal] = useState(
    Boolean(booking?.client_confirmed_pro_presence)
  );
  // Keep a live tick so the "Confirmar presença" button appears on time
  // without the user having to reopen the modal.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setNowTick(x => x + 1), 15000);
    return () => clearInterval(h);
  }, []);

  // Resync local draft if the parent passes a different booking in
  useEffect(() => {
    setNotes(booking?.notes || "");
    setEmName(booking?.emergency_name || "");
    setEmPhone(booking?.emergency_phone || "");
    setEditing(false);
    setPresenceConfirmedLocal(Boolean(booking?.client_confirmed_pro_presence));
    setJustRated(false);
  }, [booking?.id, booking?.client_confirmed_pro_presence]);

  // Rule #1 — "Confirmar presença do profissional" button is offered while
  // the booking is still in accepted (pro hasn't started) AND we are past
  // T+30 min from scheduled_start. We render it a bit early (T+25 min) so
  // the client sees it when the +25 min reminder fires; the server still
  // only treats it as a true override after T+30.
  const schedStartMs = booking?.scheduled_start ? new Date(booking.scheduled_start).getTime() : null;
  const past25m = schedStartMs !== null && Date.now() >= schedStartMs + 25 * 60 * 1000;
  const past30m = schedStartMs !== null && Date.now() >  schedStartMs + MAX_START_LATE_MINUTES * 60 * 1000;
  const showConfirmPresence = (
    booking &&
    booking.status === "accepted" &&
    past25m &&
    !presenceConfirmedLocal
  );

  const handleConfirmPresence = async () => {
    if (confirmingPresence) return;
    setConfirmingPresence(true);
    try {
      await axios.post(`${API}/api/bookings/${booking.id}/confirm-pro-presence`, {}, { headers });
      setPresenceConfirmedLocal(true);
      toast.success(t("client_booking_detail.presence_confirmed_toast"));
      onUpdated?.({ ...booking, client_confirmed_pro_presence: true, review_type: "gps_exception" });
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("client_booking_detail.presence_confirm_error"));
    } finally {
      setConfirmingPresence(false);
    }
  };

  if (!booking) return null;

  const isFinalized = FINALIZED.has(booking.status);
  const statusLabel = t(`client_activity.status.${booking.status}`, { defaultValue: booking.status });
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

  const dirty =
    notes !== (booking.notes || "") ||
    emName !== (booking.emergency_name || "") ||
    emPhone !== (booking.emergency_phone || "");

  const handleSave = async () => {
    if (!dirty) { setEditing(false); return; }
    setSaving(true);
    try {
      await axios.patch(`${API}/api/bookings/${booking.id}/details`, {
        notes,
        emergency_name: emName,
        emergency_phone: emPhone,
      }, { headers });
      toast.success(t("client_booking_detail.save_success"));
      setEditing(false);
      onUpdated?.({ ...booking, notes, emergency_name: emName, emergency_phone: emPhone });
    } catch (err) {
      toast.error(err.response?.data?.detail || t("client_booking_detail.save_error"));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setNotes(booking.notes || "");
    setEmName(booking.emergency_name || "");
    setEmPhone(booking.emergency_phone || "");
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor}`}>{statusLabel}</span>
            <h3 className="font-display text-lg font-bold text-navy mt-2">
              {booking.service_type || t("client_booking_detail.service_default")}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* Schedule */}
        <div className="flex items-center gap-2 text-sm text-slate-600 mb-3">
          <Clock size={14} className="text-slate-400" />
          <span>
            {fmtDate(booking.scheduled_start)}
            {" · "}
            {fmtTime(booking.scheduled_start)}
            {booking.scheduled_end && ` – ${fmtTime(booking.scheduled_end)}`}
          </span>
        </div>
        {booking.duration_hours && (
          <p className="text-xs text-slate-500 mb-3">⏱ {t("client_booking_detail.duration")} {booking.duration_hours}h</p>
        )}

        {/* Services / Care badges */}
        {booking.services?.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1.5">{t("client_booking_detail.services")}</p>
            <CareBadges services={booking.services} isNight={booking.shift === "night"} isUrgent={booking.is_urgent} isHoliday={booking.is_holiday} size="lg" />
          </div>
        )}

        {/* Professional info (shown once the pro accepts) */}
        {booking.professional_name && !isFinalized && (
          <div className="p-3 bg-slate-50 rounded-xl mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t("client_booking_detail.professional")}</p>
            <div className="flex items-center gap-2">
              <User size={14} className="text-slate-400" />
              <span className="text-sm font-medium text-navy">{booking.professional_name}</span>
            </div>
          </div>
        )}

        {/* Address (always shown except for cancelled/no_show, since it's the client's own address) */}
        {booking.address && booking.status !== "cancelled" && booking.status !== "no_show" && (
          <div className="p-3 bg-slate-50 rounded-xl mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t("client_booking_detail.address")}</p>
            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-slate-400 mt-0.5" />
              <span className="text-sm text-slate-600">{booking.address}</span>
            </div>
          </div>
        )}

        {/* Pricing */}
        <div className="p-3 bg-green-50 rounded-xl mb-4 border border-green-100">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase">{t("client_booking_detail.total")}</p>
            <p className="text-lg font-bold text-green-700">{formatBRL(booking.total_price || 0)}</p>
          </div>
          {/* Item 4 (24/11/2026) — urgency surcharge line. Separate from the
              total so the client sees what the fee was. Platform fee stays
              hidden. Only shown when urgency_fee_amount > 0. */}
          {booking.urgency_fee_amount > 0 && (
            <div className="mt-2 pt-2 border-t border-green-200/60">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 flex items-center gap-1">
                  <Zap size={12} className="text-amber-500" />
                  {t("client_booking_detail.urgency_fee_label", { pct: booking.urgency_fee_pct })}
                </span>
                <span className="font-semibold text-amber-700">+ {formatBRL(booking.urgency_fee_amount)}</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                {t("client_booking_detail.urgency_fee_note", { pct: booking.urgency_fee_pct })}
              </p>
            </div>
          )}
        </div>

        {/* Item 6 (24/11/2026) — Duration change (before service starts).
            Uses DurationChangeModal. Hidden while a request is pending (we
            show a pending banner instead). Also hidden for finalized bookings. */}
        {!editing && ["pending", "accepted"].includes(booking.status) && (
          <>
            {booking.duration_change_status === "requested" ? (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-2">
                <Hourglass size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-snug">
                  {t("client_booking_detail.duration_change_pending")}
                </p>
              </div>
            ) : (
              <>
                {["declined"].includes(booking.duration_change_status) && (
                  <div className="mb-3 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2">
                    <AlertCircle size={16} className="text-slate-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-700 leading-snug">
                      {t("client_booking_detail.duration_change_declined")}
                    </p>
                  </div>
                )}
                <button onClick={() => setShowDurationChange(true)}
                  className="mb-4 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white border border-blue-200 text-blue-600 font-semibold text-sm hover:bg-blue-50">
                  <Clock size={14} /> {t("client_booking_detail.duration_change_button")}
                </button>
              </>
            )}
          </>
        )}
        {showDurationChange && (
          <DurationChangeModal booking={booking}
            onClose={() => setShowDurationChange(false)}
            onUpdated={(p) => { onUpdated?.(p); setShowDurationChange(false); }} />
        )}

        {/* Change 44a — One-tap quick-message chips (client side: Pode chegar / Estou aguardando) */}
        <div className="mb-4">
          <QuickMessagesButtons booking={booking} side="client" />
        </div>

        {/* Rule #1 — Confirmar presença do profissional. Shown from T+25 min
            onwards for bookings still in `accepted` where the client has not
            yet confirmed. Posts to /confirm-pro-presence, which flips the
            booking's client_confirmed_pro_presence flag and unlocks the
            pro's Start button past T+30. The amber "past 30 min" variant
            emphasises it; before +30 it's a softer prompt. */}
        {showConfirmPresence && (
          <div className={`mb-4 p-3 rounded-xl border ${past30m ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-100"}`}>
            <p className={`text-sm font-semibold mb-1 ${past30m ? "text-amber-800" : "text-blue-800"}`}>
              {past30m
                ? t("client_booking_detail.presence_prompt_title_past30")
                : t("client_booking_detail.presence_prompt_title")}
            </p>
            <p className="text-xs text-slate-600 mb-3 leading-snug">
              {past30m
                ? t("client_booking_detail.presence_prompt_message_past30")
                : t("client_booking_detail.presence_prompt_message")}
            </p>
            <button
              onClick={handleConfirmPresence}
              disabled={confirmingPresence}
              className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold py-2 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60">
              {confirmingPresence
                ? <Loader size={14} className="animate-spin" />
                : <CheckCircle2 size={14} />}
              {t("client_booking_detail.confirm_presence_button")}
            </button>
          </div>
        )}
        {presenceConfirmedLocal && booking?.status === "accepted" && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
            <p className="text-xs text-emerald-800 leading-snug">
              {t("client_booking_detail.presence_confirmed_banner")}
            </p>
          </div>
        )}

        {/* Rule #5 (23/11/2026) — Service extension.
            - In-progress service with no pending/confirmed extension:
              show "Estender atendimento" button.
            - extension_status === "requested": waiting-for-pro banner (no
              action here since the pro acts from their side).
            - "declined" / "payment_failed" / "expired": one-line banner + the
              button again so the client can try a different duration.
            Confirmed extensions don't need a banner — scheduled_end has
            already moved; the regular time row shows the new end. */}
        {(booking?.status === "checked_in" || booking?.status === "professional_arrived") && (
          <>
            {booking.extension_status === "requested" ? (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-2">
                <Hourglass size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-snug">
                  {t("client_booking_detail.extension_pending")}
                </p>
              </div>
            ) : (
              <>
                {["declined", "payment_failed", "expired"].includes(booking.extension_status) && (
                  <div className="mb-3 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2">
                    <AlertCircle size={16} className="text-slate-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-700 leading-snug">
                      {t(`client_booking_detail.extension_${booking.extension_status}`)}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => setShowExtend(true)}
                  className="mb-4 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white border border-blue-200 text-blue-600 font-semibold text-sm hover:bg-blue-50">
                  <Clock size={14} /> {t("client_booking_detail.extend_button")}
                </button>
              </>
            )}
          </>
        )}

        {showExtend && (
          <ExtendServiceModal
            booking={booking}
            onClose={() => setShowExtend(false)}
            onUpdated={(partial) => { onUpdated?.(partial); setShowExtend(false); }}
          />
        )}

        {/* ── Editable section ───────────────────────────────────────────── */}
        <div className="border-t border-slate-100 pt-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 uppercase">{t("client_booking_detail.editable")}</p>
            {!isFinalized && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg">
                <Edit2 size={11} /> {t("client_booking_detail.edit")}
              </button>
            )}
          </div>

          {isFinalized && (
            <p className="text-xs text-slate-400 flex items-center gap-1 mb-3">
              <AlertCircle size={11} /> {t("client_booking_detail.edit_disabled")}
            </p>
          )}

          {/* Notes */}
          <div className="mb-3">
            <label className="text-xs font-medium text-slate-500 block mb-1">{t("client_booking_detail.notes")}</label>
            {editing ? (
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder={t("client_booking_detail.notes_placeholder")} />
            ) : (
              <p className="text-sm text-slate-600">{booking.notes || <span className="text-slate-400 italic">{t("client_booking_detail.none")}</span>}</p>
            )}
          </div>

          {/* Emergency contact */}
          <div className="mb-2">
            <label className="text-xs font-medium text-slate-500 block mb-1">{t("client_booking_detail.emergency_contact")}</label>
            {editing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={emName}
                  onChange={e => setEmName(e.target.value)}
                  maxLength={100}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder={t("client_booking_detail.em_name_placeholder")} />
                <input
                  type="tel"
                  value={emPhone}
                  onChange={e => setEmPhone(e.target.value)}
                  maxLength={20}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder={t("client_booking_detail.em_phone_placeholder")} />
              </div>
            ) : (booking.emergency_name || booking.emergency_phone) ? (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Phone size={12} className="text-slate-400" />
                <span>{booking.emergency_name || "—"}{booking.emergency_phone ? ` · ${booking.emergency_phone}` : ""}</span>
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">{t("client_booking_detail.none")}</p>
            )}
          </div>

          {/* Save/Cancel edit controls */}
          {editing && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50">
                {saving ? <><Loader size={14} className="animate-spin" /> {t("client_booking_detail.saving")}</>
                        : <><Save size={14} /> {t("client_booking_detail.save")}</>}
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={saving}
                className="btn-outline flex-1">
                {t("client_booking_detail.cancel_edit")}
              </button>
            </div>
          )}
        </div>

        {/* Actions row — matches the pro's modal layout.
            Rate button is shown only for completed bookings. Cancelled /
            no_show / under_review intentionally get no rating option.
            Persistence: booking.current_user_has_rated comes from
            /my-bookings; justRated covers the "just submitted" case within
            this open modal. Either hides the Rate button. */}
        {!editing && (
          <div className="flex gap-2">
            {booking.status === "completed" && !justRated && !booking.current_user_has_rated && (
              <button
                onClick={() => setShowRating(true)}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                <Star size={14} />
                {t("client_booking_detail.rate_professional")}
              </button>
            )}
            {booking.status === "completed" && (justRated || booking.current_user_has_rated) && (
              <button
                disabled
                className="btn-outline flex-1 flex items-center justify-center gap-1.5 opacity-70 cursor-default">
                <Star size={14} className="fill-amber-400 text-amber-400" />
                {t("client_booking_detail.rating_sent")}
              </button>
            )}
            <button onClick={onClose} className="btn-outline flex-1">
              {t("client_booking_detail.close")}
            </button>
          </div>
        )}
      </div>

      {/* Rating modal — client rates the professional. The RatingModal
          auto-resolves the reviewee if revieweeId is omitted, but we pass
          it explicitly from the enriched booking so there's no round-trip. */}
      {showRating && (
        <RatingModal
          booking={booking}
          revieweeId={booking.professional_user_id || undefined}
          onClose={() => setShowRating(false)}
          onDone={() => {
            setShowRating(false);
            setJustRated(true);
            onUpdated?.({ ...booking, current_user_has_rated: true });
          }}
        />
      )}
    </div>
  );
};

export default ClientBookingDetailModal;