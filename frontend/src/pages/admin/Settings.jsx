import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Save, DollarSign, Clock, Shield, Users, Bell } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const ROLES = ["caregiver", "nursing_assistant", "technician", "nurse"];
const ROLE_LABELS = { caregiver: "Cuidador(a)", nursing_assistant: "Auxiliar de Enfermagem", technician: "Técnico(a)", nurse: "Enfermeiro(a)" };

const AdminSettings = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [tab, setTab] = useState("pricing");
  const [pricing, setPricing] = useState({});
  const [rules, setRules] = useState({
    min_booking_hours: 2, min_advance_hours: 5, standard_response_hours: 3,
    urgent_response_minutes: 90, max_match_batch: 5, platform_fee_pct: 12,
    urgent_surcharge_pct: 20, holiday_surcharge_pct: 20, grace_period_minutes: 10,
    grace_max_uses_30d: 3, rest_after_24h_hours: 11, gps_radius_meters: 500,
    arrival_wait_minutes: 15, late_arrival_tolerance_minutes: 10,
    checkin_reminder_minutes: 25, client_confirm_timeout_hours: 24,
    eval_window_days: 7, penalty_reset_days: 90,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get(`${API}/api/admin/pricing`, { headers })
      .then(r => setPricing(r.data))
      .catch(() => {});
  }, []);

  const updatePricing = async (role, field, value) => {
    try {
      await axios.patch(`${API}/api/admin/pricing/${role}/${field}?value=${value}`, {}, { headers });
      setPricing(prev => ({ ...prev, [role]: { ...prev[role], [field]: value } }));
      toast.success(`${ROLE_LABELS[role]} — ${field} atualizado!`);
    } catch { toast.error("Erro ao atualizar."); }
  };

  const tabs = [
    { id: "pricing", label: "Precificação", icon: <DollarSign size={14}/> },
    { id: "booking", label: "Regras de Agendamento", icon: <Clock size={14}/> },
    { id: "cancellation", label: "Cancelamento", icon: <Shield size={14}/> },
    { id: "gps", label: "GPS e Check-in", icon: <Shield size={14}/> },
    { id: "notifications", label: "Notificações", icon: <Bell size={14}/> },
  ];

  const RuleInput = ({ label, value, field, suffix = "" }) => (
    <div className="flex items-center justify-between py-2 border-b border-slate-100">
      <span className="text-sm text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <input type="number" className="form-input w-20 text-sm text-right" value={rules[field]}
          onChange={e => setRules(p => ({ ...p, [field]: Number(e.target.value) }))} />
        {suffix && <span className="text-xs text-slate-400">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" /><ProfileMenu />
      </nav>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate("/admin")} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft size={20}/></button>
          <h1 className="font-display text-2xl font-bold text-navy">Configurações da Plataforma</h1>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                tab === t.id ? "bg-blue-500 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Pricing tab */}
        {tab === "pricing" && (
          <div className="space-y-4">
            {ROLES.map(role => (
              <div key={role} className="card p-5">
                <h3 className="font-semibold text-navy mb-3">{ROLE_LABELS[role]}</h3>
                <div className="grid grid-cols-3 gap-3">
                  {["initial_fee", "day_rate", "night_rate"].map(field => (
                    <div key={field}>
                      <label className="text-xs text-slate-500 block mb-1">
                        {field === "initial_fee" ? "Taxa inicial" : field === "day_rate" ? "Hora diurna" : "Hora noturna"}
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-400">R$</span>
                        <input type="number" step="0.01" className="form-input text-sm w-full"
                          value={pricing[role]?.[field] || ""}
                          onChange={e => setPricing(p => ({ ...p, [role]: { ...p[role], [field]: Number(e.target.value) } }))}
                          onBlur={e => updatePricing(role, field, Number(e.target.value))} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="card p-5">
              <h3 className="font-semibold text-navy mb-3">Taxas adicionais</h3>
              <RuleInput label="Taxa da plataforma" field="platform_fee_pct" suffix="%" />
              <RuleInput label="Urgência" field="urgent_surcharge_pct" suffix="%" />
              <RuleInput label="Feriado" field="holiday_surcharge_pct" suffix="%" />
            </div>
          </div>
        )}

        {/* Booking rules */}
        {tab === "booking" && (
          <div className="card p-5">
            <h3 className="font-semibold text-navy mb-3">Regras de agendamento</h3>
            <RuleInput label="Duração mínima" field="min_booking_hours" suffix="horas" />
            <RuleInput label="Antecedência mínima" field="min_advance_hours" suffix="horas" />
            <RuleInput label="Tempo de resposta (padrão)" field="standard_response_hours" suffix="horas" />
            <RuleInput label="Tempo de resposta (urgente)" field="urgent_response_minutes" suffix="min" />
            <RuleInput label="Profissionais por lote (Smart Match)" field="max_match_batch" />
            <RuleInput label="Descanso após 24h" field="rest_after_24h_hours" suffix="horas" />
            <RuleInput label="Janela de avaliação" field="eval_window_days" suffix="dias" />
          </div>
        )}

        {/* Cancellation */}
        {tab === "cancellation" && (
          <div className="card p-5">
            <h3 className="font-semibold text-navy mb-3">Política de cancelamento</h3>
            <RuleInput label="Período de graça" field="grace_period_minutes" suffix="min" />
            <RuleInput label="Usos de graça (30 dias)" field="grace_max_uses_30d" />
            <RuleInput label="Reset de penalidades" field="penalty_reset_days" suffix="dias" />
            <div className="mt-4 p-3 bg-slate-50 rounded-xl text-xs text-slate-500">
              <p className="font-semibold mb-1">Regras fixas (não configuráveis):</p>
              <p>• Mais de 7h: 100% reembolso</p>
              <p>• Entre 2-7h: 50% reembolso</p>
              <p>• Menos de 2h: sem reembolso</p>
            </div>
          </div>
        )}

        {/* GPS */}
        {tab === "gps" && (
          <div className="card p-5">
            <h3 className="font-semibold text-navy mb-3">GPS e Check-in</h3>
            <RuleInput label="Raio de check-in" field="gps_radius_meters" suffix="metros" />
            <RuleInput label="Espera antes do no-show" field="arrival_wait_minutes" suffix="min" />
            <RuleInput label="Tolerância atraso" field="late_arrival_tolerance_minutes" suffix="min" />
            <RuleInput label="Lembrete de check-in" field="checkin_reminder_minutes" suffix="min" />
            <RuleInput label="Timeout confirmação cliente" field="client_confirm_timeout_hours" suffix="horas" />
          </div>
        )}

        {/* Notifications */}
        {tab === "notifications" && (
          <div className="card p-5">
            <h3 className="font-semibold text-navy mb-3">Notificações</h3>
            <p className="text-sm text-slate-500 mb-4">Configuração de templates de notificação será implementada em versão futura.</p>
            <div className="space-y-2">
              {["Push (mobile)", "In-app", "E-mail", "WhatsApp"].map(ch => (
                <label key={ch} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                  <span className="text-sm text-slate-600">{ch}</span>
                  <input type="checkbox" defaultChecked={ch !== "WhatsApp"} className="accent-blue-500 w-4 h-4" />
                </label>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => toast.success("Configurações salvas!")}
          className="btn-primary w-full mt-6 flex items-center justify-center gap-2">
          <Save size={16}/> Salvar todas as configurações
        </button>
      </div>
    </div>
  );
};

export default AdminSettings;