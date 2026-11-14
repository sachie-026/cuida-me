import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Calendar, Repeat, Clock, Ban, Loader } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

// 0=Mon ... 6=Sun (matches backend convention)
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const AdminAvailabilityModal = ({ professional, onClose }) => {
  const { t } = useTranslation();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [loading, setLoading] = useState(true);
  const [recurring, setRecurring] = useState([]);
  const [specific, setSpecific] = useState([]);

  useEffect(() => {
    if (!professional?.user_id) return;
    setLoading(true);
    axios.get(`${API}/api/availability/professional/${professional.user_id}`, { headers })
      .then(r => {
        setRecurring(r.data.recurring || []);
        setSpecific(r.data.specific || []);
      })
      .catch(err => {
        toast.error(err.response?.data?.detail || t("admin_availability.load_error"));
      })
      .finally(() => setLoading(false));
  }, [professional?.user_id]);

  if (!professional) return null;

  const dayLabel = (idx) => t(`admin_availability.days.${DAY_KEYS[idx]}`);

  // Order recurring slots by weekday then start time
  const recurringSorted = [...recurring].sort((a, b) =>
    (a.day_of_week ?? 99) - (b.day_of_week ?? 99)
    || (a.start_time || "").localeCompare(b.start_time || ""));

  // Specific slots grouped by date, upcoming first
  const specificSorted = [...specific].sort((a, b) =>
    (a.specific_date || "").localeCompare(b.specific_date || "")
    || (a.start_time || "").localeCompare(b.start_time || ""));

  const slotTone = (type) =>
    type === "blocked"
      ? "bg-red-50 border-red-100 text-red-700"
      : "bg-green-50 border-green-100 text-green-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="font-display text-lg font-bold text-navy flex items-center gap-2">
              <Calendar size={18} className="text-blue-500" />
              {t("admin_availability.title")}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {professional.full_name}
              {professional.email && <span className="text-slate-400"> · {professional.email}</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader size={20} className="animate-spin text-blue-400" />
          </div>
        ) : (
          <>
            {/* Recurring weekly slots */}
            <div className="mb-6">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Repeat size={12} /> {t("admin_availability.recurring")}
              </p>
              {recurringSorted.length === 0 ? (
                <p className="text-sm text-slate-400 italic">{t("admin_availability.no_recurring")}</p>
              ) : (
                <div className="space-y-2">
                  {recurringSorted.map(s => (
                    <div key={s.id} className={`flex items-center justify-between p-3 rounded-xl border ${slotTone(s.type)}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold w-20">
                          {s.day_of_week !== null && s.day_of_week !== undefined ? dayLabel(s.day_of_week) : "—"}
                        </span>
                        <span className="flex items-center gap-1 text-sm font-medium">
                          <Clock size={12} /> {s.start_time} – {s.end_time}
                        </span>
                        {s.type === "blocked" && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100">
                            <Ban size={10} /> {t("admin_availability.blocked")}
                          </span>
                        )}
                      </div>
                      {s.notes && <span className="text-xs text-slate-500 truncate max-w-[200px]">{s.notes}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Specific-date slots / overrides */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Calendar size={12} /> {t("admin_availability.specific")}
              </p>
              {specificSorted.length === 0 ? (
                <p className="text-sm text-slate-400 italic">{t("admin_availability.no_specific")}</p>
              ) : (
                <div className="space-y-2">
                  {specificSorted.map(s => (
                    <div key={s.id} className={`flex items-center justify-between p-3 rounded-xl border ${slotTone(s.type)}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold w-24">
                          {s.specific_date ? new Date(s.specific_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                        </span>
                        <span className="flex items-center gap-1 text-sm font-medium">
                          <Clock size={12} /> {s.start_time} – {s.end_time}
                        </span>
                        {s.type === "blocked" && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100">
                            <Ban size={10} /> {t("admin_availability.blocked")}
                          </span>
                        )}
                      </div>
                      {s.notes && <span className="text-xs text-slate-500 truncate max-w-[200px]">{s.notes}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Summary counts */}
            <div className="flex gap-2 text-xs text-slate-500 border-t border-slate-100 pt-3">
              <span>{t("admin_availability.count_recurring", { n: recurring.length })}</span>
              <span>·</span>
              <span>{t("admin_availability.count_specific", { n: specific.length })}</span>
            </div>
          </>
        )}

        <button onClick={onClose} className="btn-outline w-full mt-4">{t("admin_availability.close")}</button>
      </div>
    </div>
  );
};

export default AdminAvailabilityModal;