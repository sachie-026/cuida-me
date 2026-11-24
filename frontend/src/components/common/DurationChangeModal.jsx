// Item 6 (24/11/2026) — Client changes the booking duration (before start).
//
// Split UI: Aumentar / Reduzir tabs, each shows 30-min-increment options
// with the exact price delta (+R$ or -R$). The backend caps increase by
// travel gap, and locks decrease if less than min_notice_reduce_hours
// before start (currently 2h).
import { useEffect, useState } from "react";
import { X, Clock, Loader, CheckCircle2, AlertCircle, Plus, Minus } from "lucide-react";
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

const DurationChangeModal = ({ booking, onClose, onUpdated }) => {
  const { t } = useTranslation();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [direction, setDirection] = useState("increase");
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setLoadError(null);
    axios.get(`${API}/api/bookings/${booking.id}/duration-change-options`, { headers })
      .then((r) => {
        if (!alive) return;
        setData(r.data);
        const incList = r.data?.increase_options || [];
        const decList = r.data?.decrease_options || [];
        if (incList.length > 0) { setDirection("increase"); setSelected(incList[0].minutes); }
        else if (decList.length > 0) { setDirection("decrease"); setSelected(decList[0].minutes); }
      })
      .catch((err) => {
        if (!alive) return;
        const d = err?.response?.data?.detail;
        setLoadError((d && typeof d === "object" && d.message)
                     || (typeof d === "string" ? d : t("duration_change.load_error")));
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [booking?.id]);

  const options = direction === "increase" ? (data?.increase_options || []) : (data?.decrease_options || []);
  const selectedOpt = options.find((o) => o.minutes === selected) || null;

  const handleSubmit = async () => {
    if (!selectedOpt || submitting) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/bookings/${booking.id}/duration-change-request`,
        { direction, minutes: selectedOpt.minutes }, { headers });
      toast.success(t("duration_change.request_sent"));
      onUpdated?.({ ...booking, duration_change_status: "requested" });
      onClose?.();
    } catch (err) {
      const d = err?.response?.data?.detail;
      const msg = (d && typeof d === "object" && d.message)
                  || (typeof d === "string" ? d : t("duration_change.request_error"));
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const decreaseAllowed = Boolean(data?.decrease_allowed);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
         onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/0" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-100">
          <X size={16} className="text-slate-400" />
        </button>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Clock size={20} className="text-blue-500" />
          </div>
          <div>
            <h3 className="font-bold text-navy text-base leading-tight">{t("duration_change.title")}</h3>
            <p className="text-xs text-slate-500 mt-1 leading-snug">{t("duration_change.subtitle")}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader size={20} className="animate-spin text-slate-400" /></div>
        ) : loadError ? (
          <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 leading-snug">{loadError}</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-4">
              <button onClick={() => { setDirection("increase"); setSelected((data?.increase_options?.[0]?.minutes) ?? null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold
                  ${direction === "increase" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600"}`}>
                <Plus size={14} /> {t("duration_change.increase")}
              </button>
              <button onClick={() => { if (decreaseAllowed) { setDirection("decrease"); setSelected((data?.decrease_options?.[0]?.minutes) ?? null); } }}
                disabled={!decreaseAllowed}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed
                  ${direction === "decrease" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600"}`}>
                <Minus size={14} /> {t("duration_change.decrease")}
              </button>
            </div>

            {direction === "decrease" && !decreaseAllowed && (
              <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-2">
                <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-snug">{data?.decrease_locked_reason}</p>
              </div>
            )}

            {options.length === 0 ? (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2">
                <AlertCircle size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-700 leading-snug">
                  {direction === "increase" ? t("duration_change.no_increase_options") : t("duration_change.no_decrease_options")}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2 mb-3 max-h-60 overflow-y-auto">
                  {options.map((o) => {
                    const active = o.minutes === selected;
                    const positive = (o.delta || 0) >= 0;
                    return (
                      <button key={o.minutes} onClick={() => setSelected(o.minutes)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all
                          ${active ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                                   : "border-slate-200 bg-white hover:border-slate-300"}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0
                            ${active ? "border-blue-500" : "border-slate-300"}`}>
                            {active && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                          </div>
                          <span className="text-sm font-semibold text-navy">
                            {direction === "increase" ? "+" : "−"} {fmtMinutes(o.minutes)}
                          </span>
                        </div>
                        <span className={`text-sm font-bold ${positive ? "text-green-700" : "text-blue-700"}`}>
                          {positive ? "+" : "−"} {formatBRL(Math.abs(o.delta || 0))}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 leading-snug mb-4">
                  {direction === "increase" ? t("duration_change.cost_note_increase") : t("duration_change.cost_note_decrease")}
                </p>
                <button onClick={handleSubmit} disabled={submitting || !selectedOpt}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 disabled:opacity-60">
                  {submitting ? <Loader size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  {t("duration_change.confirm")}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DurationChangeModal;