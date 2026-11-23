// Rule #5 (23/11/2026) — Client-initiated service extension picker.
//
// Flow:
//   1. Mounts with a booking prop. On open, GET /extension-options to fetch
//      the allowed 30-min increments (server-capped by the pro's next
//      commitment's travel buffer).
//   2. Client picks one of the options. Each row shows the duration and
//      the exact additional cost.
//   3. On Confirm, POST /request-extension with additional_minutes. The pro
//      then accepts or declines (payment is attempted on accept).
//
// The parent passes `onUpdated(bookingPartial)` so the parent can reflect
// the pending state ("Aguardando resposta do profissional") immediately.
import { useState, useEffect } from "react";
import { X, Clock, Loader, CheckCircle2, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import toast from "react-hot-toast";
import { formatBRL } from "../../utils/format";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const fmtMinutes = (m) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm} min`;
  if (mm === 0) return `${h}h`;
  return `${h}h${String(mm).padStart(2, "0")}`;
};

const ExtendServiceModal = ({ booking, onClose, onUpdated }) => {
  const { t } = useTranslation();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null); // minutes value
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    axios.get(`${API}/api/bookings/${booking.id}/extension-options`, { headers })
      .then(r => {
        if (!alive) return;
        const list = Array.isArray(r.data?.options) ? r.data.options : [];
        setOptions(list);
        if (list.length > 0) setSelected(list[0].minutes);
      })
      .catch(err => {
        if (!alive) return;
        const detail = err?.response?.data?.detail;
        setLoadError(
          (detail && typeof detail === "object" && detail.message)
          || (typeof detail === "string" ? detail : t("extend_service.load_error"))
        );
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id]);

  const selectedOption = options.find(o => o.minutes === selected) || null;

  const handleConfirm = async () => {
    if (!selectedOption || submitting) return;
    setSubmitting(true);
    try {
      const { data } = await axios.post(
        `${API}/api/bookings/${booking.id}/request-extension`,
        { additional_minutes: selectedOption.minutes },
        { headers }
      );
      toast.success(t("extend_service.request_sent"));
      onUpdated?.({
        ...booking,
        extension_status: "requested",
        extension_new_end: data?.new_end,
        extension_additional_cost: data?.additional_cost,
        extension_requested_by: "client",
      });
      onClose?.();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const msg = (detail && typeof detail === "object" && detail.message)
        || (typeof detail === "string" ? detail : t("extend_service.request_error"));
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5"
           onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-100">
          <X size={16} className="text-slate-400" />
        </button>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Clock size={20} className="text-blue-500" />
          </div>
          <div>
            <h3 className="font-bold text-navy text-base leading-tight">
              {t("extend_service.title")}
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-snug">
              {t("extend_service.subtitle")}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader size={20} className="animate-spin text-slate-400" />
          </div>
        ) : loadError ? (
          <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 leading-snug">{loadError}</p>
          </div>
        ) : options.length === 0 ? (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-snug">
              {t("extend_service.no_options")}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-3 max-h-72 overflow-y-auto">
              {options.map(o => {
                const active = o.minutes === selected;
                return (
                  <button
                    key={o.minutes}
                    onClick={() => setSelected(o.minutes)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all
                      ${active
                        ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                        : "border-slate-200 bg-white hover:border-slate-300"}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0
                        ${active ? "border-blue-500" : "border-slate-300"}`}>
                        {active && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                      </div>
                      <span className="text-sm font-semibold text-navy">
                        + {fmtMinutes(o.minutes)}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-green-700">
                      + {formatBRL(o.additional_cost || 0)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 leading-snug mb-4">
              {t("extend_service.cost_note")}
            </p>
            <button
              onClick={handleConfirm}
              disabled={submitting || !selectedOption}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 disabled:opacity-60">
              {submitting
                ? <Loader size={14} className="animate-spin" />
                : <CheckCircle2 size={14} />}
              {selectedOption
                ? t("extend_service.confirm_with_cost", { cost: formatBRL(selectedOption.additional_cost || 0) })
                : t("extend_service.confirm")}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ExtendServiceModal;