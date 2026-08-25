import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Trash2, Clock, X, CalendarDays, RefreshCw, Info } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";

const API     = process.env.REACT_APP_API_URL || "http://localhost:8000";
const TIMES   = Array.from({ length: 32 }, (_, i) => {
  const h = Math.floor(i / 2) + 6;
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});
const DAYS_PT   = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// ── Helpers ───────────────────────────────────────────────────────────────────

const toDateStr = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const firstDayOfMonth = (y, m) => {
  const d = new Date(y, m, 1).getDay(); // 0=Sun
  return d === 0 ? 6 : d - 1;           // shift to Mon=0
};

const today = () => new Date().toISOString().split("T")[0];

// ── Slot Time Modal ────────────────────────────────────────────────────────────

const SlotModal = ({ date, existingSlots, onClose, onAdd, onDelete }) => {
  const [start, setStart] = useState("08:00");
  const [end,   setEnd]   = useState("18:00");
  const [type,  setType]  = useState("available");
  const [saving, setSaving] = useState(false);

  const label = new Date(date + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long",
  });

  const handleAdd = async () => {
    if (start >= end) { toast.error("Horário de fim deve ser após o início."); return; }
    setSaving(true);
    await onAdd({ specific_date: date, start_time: start, end_time: end, type, is_recurring: false });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <p className="font-bold text-navy capitalize">{label}</p>
            <p className="text-xs text-slate-500 mt-0.5">Adicione um ou mais horários para este dia</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Existing slots */}
        {existingSlots.length > 0 && (
          <div className="px-5 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Horários cadastrados</p>
            <div className="space-y-2">
              {existingSlots.map(s => (
                <div key={s.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium
                  ${s.type === "available" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                  <span className="flex items-center gap-2">
                    <Clock size={13} />
                    {s.start_time} – {s.end_time}
                    <span className="text-xs opacity-70">· {s.type === "available" ? "Disponível" : "Bloqueado"}</span>
                  </span>
                  <button onClick={() => onDelete(s.id)} className="hover:opacity-60 transition-opacity">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 mt-4" />
          </div>
        )}

        {/* Add new slot */}
        <div className="p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Adicionar horário</p>

          {/* Type toggle */}
          <div className="flex gap-2">
            {["available", "blocked"].map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors
                  ${type === t
                    ? t === "available" ? "bg-green-500 text-white border-green-500" : "bg-red-500 text-white border-red-500"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                {t === "available" ? "✓ Disponível" : "✗ Bloqueado"}
              </button>
            ))}
          </div>

          {/* Time pickers */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Início</label>
              <select className="form-input" value={start} onChange={e => setStart(e.target.value)}>
                {TIMES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Fim</label>
              <select className="form-input" value={end} onChange={e => setEnd(e.target.value)}>
                {TIMES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Plus size={15} /> {saving ? "Salvando..." : "Adicionar horário"}
            </button>
            <button onClick={onClose} className="btn-outline px-4">Fechar</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Calendar Tab ───────────────────────────────────────────────────────────────

const CalendarTab = ({ userId, profId }) => {
  const navigate = useNavigate();
  const token   = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const now = new Date();
  const [year,         setYear]         = useState(now.getFullYear());
  const [month,        setMonth]        = useState(now.getMonth());
  const [slots,        setSlots]        = useState([]);
  const [bookings,     setBookings]     = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      axios.get(`${API}/api/availability/professional/${userId}`, { headers }),
      profId ? axios.get(`${API}/api/bookings/professional/${profId}`, { headers }).catch(()=>({data:[]})) : Promise.resolve({data:[]}),
    ]).then(([slotsRes, bookRes]) => {
      setSlots(slotsRes.data.slots || []);
      setBookings(Array.isArray(bookRes.data) ? bookRes.data : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [userId, profId]);

  const specificSlots = slots.filter(s => !s.is_recurring);

  const slotsForDate = date => specificSlots.filter(s => s.specific_date === date);

  const handleAddSlot = async (body) => {
    try {
      const { data } = await axios.post(`${API}/api/availability/professional/${userId}`, body, { headers });
      setSlots(prev => [...prev, data]);
      toast.success("Horário adicionado!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao adicionar horário.");
    }
  };

  const handleDeleteSlot = async (slotId) => {
    try {
      await axios.delete(`${API}/api/availability/slots/${slotId}`, { headers });
      setSlots(prev => prev.filter(s => s.id !== slotId));
      toast.success("Horário removido.");
    } catch {
      toast.error("Erro ao remover.");
    }
  };

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const totalDays  = daysInMonth(year, month);
  const startDay   = firstDayOfMonth(year, month);
  const todayStr   = today();

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Info size={14} className="text-blue-400 flex-shrink-0" />
        <p className="text-xs text-slate-500">
          Clique em qualquer data para adicionar horários disponíveis. Datas com horários aparecem em verde.
        </p>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between py-4">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <ChevronLeft size={18} className="text-slate-600" />
        </button>
        <h3 className="font-bold text-navy text-lg">
          {MONTHS_PT[month]} {year}
        </h3>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <ChevronRight size={18} className="text-slate-600" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-2">
        {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(d => (
          <div key={d} className="text-center text-xs font-semibold text-slate-400 py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Carregando...</div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} />;
            const dateStr    = toDateStr(year, month, day);
            const isPast     = dateStr < todayStr;
            const isToday    = dateStr === todayStr;
            const daySlots   = slotsForDate(dateStr);
            const hasAvail   = daySlots.some(s => s.type === "available");
            const hasBlocked = daySlots.some(s => s.type === "blocked");
            const isSelected = selectedDate === dateStr;

            // Booking events for this date
            const dayBookings = bookings.filter(b => b.scheduled_start && b.scheduled_start.startsWith(dateStr));
            const hasConfirmed = dayBookings.some(b => b.status === "accepted");
            const hasPending   = dayBookings.some(b => b.status === "pending");
            const hasActive    = dayBookings.some(b => b.status === "checked_in");

            return (
              <button key={day} disabled={isPast}
                onClick={() => setSelectedDate(dateStr)}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-xl text-sm font-medium transition-all
                  ${isPast ? "text-slate-300 cursor-not-allowed" : "hover:bg-blue-50 cursor-pointer"}
                  ${isToday ? "ring-2 ring-blue-400" : ""}
                  ${isSelected ? "bg-blue-500 text-white hover:bg-blue-500" : ""}
                  ${!isSelected && hasAvail ? "bg-green-50 text-green-700" : ""}
                  ${!isSelected && hasBlocked && !hasAvail ? "bg-red-50 text-red-500" : ""}
                  ${!isSelected && !hasAvail && !hasBlocked && !isPast ? "text-slate-700" : ""}
                `}>
                {day}
                {dayBookings.length > 0 && (
                  <span className="absolute top-0.5 right-1 text-[9px] font-bold text-blue-600 bg-blue-100 rounded-full w-4 h-4 flex items-center justify-center">{dayBookings.length}</span>
                )}
                {daySlots.length > 0 && !isSelected && (
                  <span className={`absolute bottom-1 w-1.5 h-1.5 rounded-full
                    ${hasAvail ? "bg-green-400" : "bg-red-400"}`} />
                )}
                {dayBookings.length > 0 && !isSelected && (
                  <div className="absolute bottom-1 flex gap-0.5">
                    {hasConfirmed && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                    {hasPending && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                    {hasActive && <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100 flex-wrap">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Confirmado
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> Pendente
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-3 h-3 rounded-full bg-purple-500 inline-block" /> Em andamento
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-3 h-3 rounded-full bg-red-400 inline-block" /> Bloqueado
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-3 h-3 rounded-full bg-blue-400 ring-2 ring-blue-400 inline-block" /> Hoje
        </span>
      </div>

      {/* Booking details for selected date */}
      {selectedDate && bookings.filter(b => b.scheduled_start?.startsWith(selectedDate)).length > 0 && (
        <div className="mt-6 p-5 bg-white border border-slate-200 rounded-2xl">
          <h4 className="font-semibold text-navy text-sm mb-3">
            📋 Agendamentos — {new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday:"long", day:"numeric", month:"long" })}
          </h4>
          <div className="space-y-3">
            {bookings.filter(b => b.scheduled_start?.startsWith(selectedDate)).map(b => {
              const statusConfig = {
                pending: { label: "Pendente", color: "bg-yellow-100 text-yellow-700" },
                accepted: { label: "Confirmado", color: "bg-blue-100 text-blue-700" },
                checked_in: { label: "Em andamento", color: "bg-purple-100 text-purple-700" },
                completed: { label: "Concluído", color: "bg-green-100 text-green-700" },
                cancelled: { label: "Cancelado", color: "bg-red-100 text-red-600" },
              };
              const cfg = statusConfig[b.status] || statusConfig.pending;
              return (
                <div key={b.id} className="flex items-start justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-xs text-slate-400">
                        {b.scheduled_start && new Date(b.scheduled_start).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}
                        {b.scheduled_end && ` – ${new Date(b.scheduled_end).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}`}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-navy">{b.service_type || "Atendimento"}</p>
                    {b.total_price && <p className="text-xs text-slate-500 mt-0.5">R$ {Number(b.total_price).toFixed(2)}</p>}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => navigate(`/messages?booking=${b.id}`)} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold">Chat</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming slots summary */}
      {specificSlots.filter(s => s.specific_date >= todayStr).length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Próximas disponibilidades cadastradas</p>
          <div className="space-y-2">
            {specificSlots
              .filter(s => s.specific_date >= todayStr)
              .sort((a, b) => a.specific_date.localeCompare(b.specific_date))
              .map(s => (
                <div key={s.id} className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm
                  ${s.type === "available" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                  <span className="flex items-center gap-2">
                    <CalendarDays size={13} />
                    {new Date(s.specific_date + "T12:00:00").toLocaleDateString("pt-BR", { weekday:"short", day:"numeric", month:"short" })}
                    · <Clock size={11} /> {s.start_time} – {s.end_time}
                  </span>
                  <button onClick={() => handleDeleteSlot(s.id)} className="hover:opacity-60 transition-opacity ml-2">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Date modal — shows bookings first, then add availability */}
      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedDate(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto z-10 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold text-navy">
                {new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday:"long", day:"numeric", month:"long" })}
              </h3>
              <button onClick={() => setSelectedDate(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">✕</button>
            </div>

            {/* Day's bookings — 51f: blocked ranges NEVER shown here */}
            {(() => {
              const dayBookings = bookings.filter(b =>
                b.scheduled_start?.startsWith(selectedDate) &&
                !["cancelled","no_show"].includes(b.status) &&
                b.status !== "blocked"
              );
              return dayBookings.length > 0 ? (
                <div className="mb-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Agendamentos ({dayBookings.length})</p>
                  <div className="space-y-2">
                    {dayBookings.sort((a,b) => (a.scheduled_start||"").localeCompare(b.scheduled_start||"")).map(b => {
                      const statusCfg = {
                        pending:              { label: "Pendente",           color: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-400", border: "border-l-yellow-400" },
                        accepted:             { label: "Confirmado",         color: "bg-blue-100 text-blue-700",     dot: "bg-blue-500",   border: "border-l-blue-500" },
                        professional_arrived:  { label: "Chegou",            color: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500", border: "border-l-indigo-500" },
                        checked_in:           { label: "Em andamento",       color: "bg-purple-100 text-purple-700", dot: "bg-purple-500", border: "border-l-purple-500" },
                        completed:            { label: "Concluído",          color: "bg-green-100 text-green-700",   dot: "bg-green-500",  border: "border-l-green-500" },
                        cancelled:            { label: "Cancelado",          color: "bg-red-100 text-red-600",       dot: "bg-red-400",    border: "border-l-red-400" },
                      };
                      const cfg = statusCfg[b.status] || statusCfg.pending;
                      return (
                        <div key={b.id} className={`p-3 rounded-xl bg-slate-50 border border-slate-100 border-l-4 ${cfg.border} hover:bg-slate-100 transition-colors`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                            </div>
                            <span className="text-xs text-slate-400">
                              {b.scheduled_start && new Date(b.scheduled_start).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}
                              {b.scheduled_end && ` – ${new Date(b.scheduled_end).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-navy">{b.service_type || "Atendimento"}</p>
                          {/* 51a: Client name */}
                          {b.client_name && <p className="text-xs text-slate-500">Cliente: {b.client_name}</p>}
                          {b.total_price && <p className="text-xs text-slate-500">R$ {Number(b.total_price).toFixed(2)}</p>}

                          {/* 51d: Confirm/Decline actions on Pending */}
                          {b.status === "pending" && (
                            <div className="flex gap-2 mt-2">
                              <button onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await axios.patch(`${API}/api/bookings/${b.id}/accept`, {}, { headers: { Authorization: `Bearer ${token}` } });
                                  toast.success("Agendamento aceito!");
                                  window.location.reload();
                                } catch (err) { toast.error(err.response?.data?.detail || "Erro ao aceitar."); }
                              }} className="text-xs px-3 py-1.5 rounded-lg bg-blue-500 text-white font-semibold hover:bg-blue-600">
                                Aceitar
                              </button>
                              <button onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await axios.patch(`${API}/api/bookings/${b.id}/decline`, {}, { headers: { Authorization: `Bearer ${token}` } });
                                  toast.success("Agendamento recusado.");
                                  window.location.reload();
                                } catch (err) { toast.error(err.response?.data?.detail || "Erro ao recusar."); }
                              }} className="text-xs px-3 py-1.5 rounded-lg bg-slate-200 text-slate-600 font-semibold hover:bg-slate-300">
                                Recusar
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mb-5 p-4 bg-slate-50 rounded-xl text-center">
                  <p className="text-sm text-slate-400">Nenhum agendamento neste dia</p>
                </div>
              );
            })()}

            {/* 51e: Section 2 — Existing Available + Blocked ranges */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Disponibilidade e bloqueios</p>
              {(() => {
                const dateSlots = slotsForDate(selectedDate);
                const availSlots = dateSlots.filter(s => s.slot_type === "available" || !s.slot_type);
                const blockedSlots = dateSlots.filter(s => s.slot_type === "blocked");
                return dateSlots.length > 0 ? (
                  <div className="space-y-1.5 mb-3">
                    {availSlots.map(s => (
                      <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg bg-green-50 border border-green-100">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-400" />
                          <span className="text-sm text-green-700 font-medium">{s.start_time} – {s.end_time}</span>
                          <span className="text-[10px] text-green-500">Disponível</span>
                        </div>
                        <button onClick={() => handleDeleteSlot(s.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">Remover</button>
                      </div>
                    ))}
                    {blockedSlots.map(s => (
                      <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg bg-red-50 border border-red-100">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-400" />
                          <span className="text-sm text-red-700 font-medium">{s.start_time} – {s.end_time}</span>
                          <span className="text-[10px] text-red-500">Bloqueado</span>
                        </div>
                        <button onClick={() => handleDeleteSlot(s.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">Remover</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 mb-3">Nenhum horário configurado para este dia.</p>
                );
              })()}
            </div>

            {/* Add availability form — always accessible AFTER listing */}
            <SlotModal
              date={selectedDate}
              existingSlots={slotsForDate(selectedDate)}
              onClose={() => setSelectedDate(null)}
              onAdd={handleAddSlot}
              onDelete={async (id) => { await handleDeleteSlot(id); }}
              embedded={true}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ── Recurring Tab ─────────────────────────────────────────────────────────────

const RecurringTab = ({ userId }) => {
  const token   = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [slots,   setSlots]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(null); // day index being added, or null
  const [form,    setForm]    = useState({ start_time: "08:00", end_time: "18:00", type: "available" });
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    if (!userId) return;
    axios.get(`${API}/api/availability/professional/${userId}`, { headers })
      .then(r => setSlots((r.data.slots || []).filter(s => s.is_recurring)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const handleAdd = async (dow) => {
    if (form.start_time >= form.end_time) { toast.error("Horário de fim deve ser após o início."); return; }
    setSaving(true);
    try {
      const { data } = await axios.post(`${API}/api/availability/professional/${userId}`, {
        is_recurring: true, day_of_week: dow,
        start_time: form.start_time, end_time: form.end_time, type: form.type,
      }, { headers });
      setSlots(prev => [...prev, data]);
      setAdding(null);
      toast.success("Horário padrão adicionado!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao adicionar.");
    } finally { setSaving(false); }
  };

  const handleDelete = async (slotId) => {
    try {
      await axios.delete(`${API}/api/availability/slots/${slotId}`, { headers });
      setSlots(prev => prev.filter(s => s.id !== slotId));
      toast.success("Horário removido.");
    } catch { toast.error("Erro ao remover."); }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Info size={14} className="text-blue-400 flex-shrink-0" />
        <p className="text-xs text-slate-500">
          Horários padrão se repetem toda semana. Datas específicas no calendário sempre têm prioridade sobre estes horários.
        </p>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm text-center py-6">Carregando...</p>
      ) : (
        <div className="space-y-3">
          {DAYS_PT.map((dayName, dow) => {
            const daySlots = slots.filter(s => s.day_of_week === dow);
            const isAdding = adding === dow;

            return (
              <div key={dow} className="border border-slate-200 rounded-xl overflow-hidden">
                {/* Day header */}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
                  <span className="font-semibold text-navy text-sm">{dayName}</span>
                  <button onClick={() => { setAdding(isAdding ? null : dow); setForm({ start_time: "08:00", end_time: "18:00", type: "available" }); }}
                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                    <Plus size={13} /> Adicionar
                  </button>
                </div>

                {/* Slots */}
                {daySlots.length > 0 && (
                  <div className="px-4 py-2 space-y-1.5">
                    {daySlots.map(s => (
                      <div key={s.id} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium
                        ${s.type === "available" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                        <span className="flex items-center gap-2">
                          <Clock size={11} /> {s.start_time} – {s.end_time}
                          <span className="opacity-60">· {s.type === "available" ? "Disponível" : "Bloqueado"}</span>
                        </span>
                        <button onClick={() => handleDelete(s.id)} className="hover:opacity-60 transition-opacity">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty state */}
                {daySlots.length === 0 && !isAdding && (
                  <div className="px-4 py-2">
                    <p className="text-xs text-slate-400">Nenhum horário padrão</p>
                  </div>
                )}

                {/* Inline add form */}
                {isAdding && (
                  <div className="px-4 py-3 border-t border-slate-100 space-y-3">
                    <div className="flex gap-2">
                      {["available", "blocked"].map(t => (
                        <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                            ${form.type === t
                              ? t === "available" ? "bg-green-500 text-white border-green-500" : "bg-red-500 text-white border-red-500"
                              : "border-slate-200 text-slate-500"}`}>
                          {t === "available" ? "✓ Disponível" : "✗ Bloqueado"}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="form-label">Início</label>
                        <select className="form-input text-sm" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}>
                          {TIMES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="form-label">Fim</label>
                        <select className="form-input text-sm" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}>
                          {TIMES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleAdd(dow)} disabled={saving}
                        className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                        <Plus size={12} /> {saving ? "Salvando..." : "Salvar"}
                      </button>
                      <button onClick={() => setAdding(null)} className="btn-outline text-xs px-3 py-1.5">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const AvailabilityPage = () => {
  const navigate = useNavigate();
  const userId   = localStorage.getItem("user_id");
  const [tab,    setTab]    = useState("calendar"); // "calendar" | "recurring"
  const [profId, setProfId] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    axios.get(`${API}/api/professionals/${userId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setProfId(r.data.id))
      .catch(() => {});
  }, [userId]);

  const tabs = [
    { key: "calendar",  label: "Meu Calendário",   icon: <CalendarDays size={16} /> },
    { key: "recurring", label: "Horário Padrão",    icon: <RefreshCw size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" />
        <div className="flex items-center gap-3"><LanguageSwitcher /><ProfileMenu /></div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Page header */}
        <div className="mb-6 flex items-center gap-3">
          <button onClick={() => navigate("/dashboard/professional")}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="font-display text-2xl font-bold text-navy">Minha Agenda</h1>
            <p className="text-sm text-slate-500 mt-0.5">Gerencie seus horários e visualize seus agendamentos</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all
                ${tab === t.key ? "bg-white text-navy shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="card p-6">
          {tab === "calendar"  && <CalendarTab userId={userId} profId={profId} />}
          {tab === "recurring" && <RecurringTab userId={userId} />}
        </div>
      </div>
    </div>
  );
};

export default AvailabilityPage;