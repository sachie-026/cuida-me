import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, MapPin, Clock, User, Phone, MessageSquare, Edit2, Save, AlertCircle, Loader } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import CareBadges from "./CareBadges";
import { formatBRL } from "../../utils/format";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const FINALIZED = new Set(["completed", "cancelled", "no_show"]);

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

  // Resync local draft if the parent passes a different booking in
  useEffect(() => {
    setNotes(booking?.notes || "");
    setEmName(booking?.emergency_name || "");
    setEmPhone(booking?.emergency_phone || "");
    setEditing(false);
  }, [booking?.id]);

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
        </div>

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

        {/* Close */}
        {!editing && (
          <button onClick={onClose} className="btn-outline w-full flex items-center justify-center gap-1.5">
            <MessageSquare size={14} /> {t("client_booking_detail.close")}
          </button>
        )}
      </div>
    </div>
  );
};

export default ClientBookingDetailModal;