import { useState, useEffect } from "react";
import { Plus, Trash2, Clock, RefreshCw, Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import toast from "react-hot-toast";

const API     = process.env.REACT_APP_API_URL || "http://localhost:8000";
const TIMES   = Array.from({length:48},(_,i)=>{const h=Math.floor(i/2);const m=i%2===0?"00":"30";return `${String(h).padStart(2,"0")}:${m}`;});

const AvailabilityCalendar = ({ userId }) => {
  const { t } = useTranslation();
  const token   = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const DAYS = [
    t("availability_calendar.days.mon"), t("availability_calendar.days.tue"),
    t("availability_calendar.days.wed"), t("availability_calendar.days.thu"),
    t("availability_calendar.days.fri"), t("availability_calendar.days.sat"),
    t("availability_calendar.days.sun"),
  ];

  const [slots,     setSlots]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState({
    type: "available", is_recurring: true,
    day_of_week: 0, specific_date: "", start_time: "08:00", end_time: "18:00",
  });

  useEffect(() => {
    axios.get(`${API}/api/availability/professional/${userId}`, { headers })
      .then(r => setSlots(r.data.slots || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const handleAdd = async () => {
    try {
      const body = { ...form };
      if (form.is_recurring) delete body.specific_date;
      else { delete body.day_of_week; }
      const { data } = await axios.post(`${API}/api/availability/professional/${userId}`, body, { headers });
      setSlots(prev => [...prev, data]);
      setShowForm(false);
      toast.success(t("availability_calendar.slot_added"));
    } catch (err) {
      toast.error(err.response?.data?.detail || t("availability_calendar.slot_add_error"));
    }
  };

  const handleDelete = async (slotId) => {
    try {
      await axios.delete(`${API}/api/availability/slots/${slotId}`, { headers });
      setSlots(prev => prev.filter(s => s.id !== slotId));
      toast.success(t("availability_calendar.slot_removed"));
    } catch {
      toast.error(t("availability_calendar.slot_remove_error"));
    }
  };

  const recurring = slots.filter(s => s.is_recurring);
  const specific  = slots.filter(s => !s.is_recurring);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-navy">{t("availability_calendar.title")}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{t("availability_calendar.subtitle")}</p>
        </div>
        <button onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
          <Plus size={15} /> {t("availability_calendar.add_slot")}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="mb-5 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <div className="flex gap-3">
            <button onClick={() => setForm(f => ({...f, is_recurring: true}))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                form.is_recurring ? "bg-blue-500 text-white border-blue-500" : "border-slate-200 text-slate-600"}`}>
              <RefreshCw size={13} /> {t("availability_calendar.recurring")}
            </button>
            <button onClick={() => setForm(f => ({...f, is_recurring: false}))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                !form.is_recurring ? "bg-blue-500 text-white border-blue-500" : "border-slate-200 text-slate-600"}`}>
              <Calendar size={13} /> {t("availability_calendar.specific_date")}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {form.is_recurring ? (
              <div>
                <label className="form-label">{t("availability_calendar.day_of_week")}</label>
                <select className="form-input" value={form.day_of_week} onChange={e => setForm(f => ({...f, day_of_week: parseInt(e.target.value)}))}>
                  {DAYS.map((d,i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="form-label">{t("availability_calendar.date")}</label>
                <input className="form-input" type="date" value={form.specific_date}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={e => setForm(f => ({...f, specific_date: e.target.value}))} />
              </div>
            )}
            <div>
              <label className="form-label">{t("availability_calendar.start")}</label>
              <select className="form-input" value={form.start_time} onChange={e => setForm(f => ({...f, start_time: e.target.value}))}>
                {TIMES.map(tm => <option key={tm}>{tm}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">{t("availability_calendar.end")}</label>
              <select className="form-input" value={form.end_time} onChange={e => setForm(f => ({...f, end_time: e.target.value}))}>
                {TIMES.map(tm => <option key={tm}>{tm}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setForm(f => ({...f, type: "available"}))}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${form.type === "available" ? "bg-green-500 text-white border-green-500" : "border-slate-200 text-slate-600"}`}>
              ✓ {t("availability_calendar.available")}
            </button>
            <button onClick={() => setForm(f => ({...f, type: "blocked"}))}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${form.type === "blocked" ? "bg-red-500 text-white border-red-500" : "border-slate-200 text-slate-600"}`}>
              ✗ {t("availability_calendar.blocked")}
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={handleAdd} className="btn-primary text-sm px-4 py-2">{t("availability_calendar.save_slot")}</button>
            <button onClick={() => setShowForm(false)} className="btn-outline text-sm px-4 py-2">{t("availability_calendar.cancel")}</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400 text-sm">{t("availability_calendar.loading")}</p>
      ) : slots.length === 0 ? (
        <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <Clock size={32} className="mx-auto text-slate-300 mb-2" />
          <p className="text-slate-500 text-sm font-medium">{t("availability_calendar.no_slots")}</p>
          <p className="text-slate-400 text-xs mt-1">{t("availability_calendar.no_slots_subtitle")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Recurring slots */}
          {recurring.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <RefreshCw size={12} /> {t("availability_calendar.recurring_slots")}
              </p>
              <div className="space-y-2">
                {[0,1,2,3,4,5,6].map(dow => {
                  const daySlots = recurring.filter(s => s.day_of_week === dow);
                  if (!daySlots.length) return null;
                  return (
                    <div key={dow} className="flex items-start gap-3">
                      <span className="text-xs font-semibold text-slate-600 w-16 pt-1.5 flex-shrink-0">{DAYS[dow]}</span>
                      <div className="flex flex-wrap gap-2 flex-1">
                        {daySlots.map(slot => (
                          <div key={slot.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
                            slot.type === "available" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                            <Clock size={11} />
                            {slot.start_time} – {slot.end_time}{slot.start_time > slot.end_time ? " 🌙" : ""}
                            <button onClick={() => handleDelete(slot.id)} className="hover:text-red-500 transition-colors ml-1">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Specific date slots */}
          {specific.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Calendar size={12} /> {t("availability_calendar.specific_dates")}
              </p>
              <div className="space-y-2">
                {specific.map(slot => (
                  <div key={slot.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium ${
                    slot.type === "available" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                    <span className="flex items-center gap-2">
                      <Calendar size={11} />
                      {new Date(slot.specific_date + "T12:00:00").toLocaleDateString("pt-BR")}
                      · {slot.start_time} – {slot.end_time}{slot.start_time > slot.end_time ? " 🌙" : ""}
                      · {slot.type === "available" ? t("availability_calendar.available") : t("availability_calendar.blocked")}{slot.start_time > slot.end_time ? ` (${t("availability_calendar.overnight")})` : ""}
                    </span>
                    <button onClick={() => handleDelete(slot.id)} className="hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AvailabilityCalendar;