import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Save, DollarSign, Clock, Shield, AlertTriangle, History } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const ROLES = ["caregiver", "nursing_assistant", "technician", "nurse"];
const ROLE_LABELS = { caregiver: "Cuidador(a)", nursing_assistant: "Auxiliar de Enfermagem", technician: "Técnico(a)", nurse: "Enfermeiro(a)" };

const FIELD_LABELS = {
  min_advance_hours: "Antecedência mínima", min_booking_hours: "Duração mínima",
  urgent_window_start_hours: "Urgência: início", urgent_window_end_hours: "Urgência: fim",
  urgent_surcharge_pct: "Taxa de urgência", refund_full_hours: "Reembolso total (antes de)",
  refund_partial_hours: "Reembolso parcial (antes de)", refund_partial_pct: "% reembolso parcial",
  grace_period_minutes: "Período de graça", grace_max_uses_30d: "Usos do grace (30 dias)",
  penalty_reset_days: "Reset de penalidades", late_arrival_tolerance_min: "Tolerância atraso",
  late_arrival_public_threshold: "Atraso afeta rating após", gps_radius_meters: "Raio GPS check-in",
  checkin_reminder_minutes: "Lembrete check-in", client_confirm_timeout_hours: "Timeout confirmação",
  day_start_hour: "Início período diurno", night_start_hour: "Início período noturno",
  rest_after_24h_hours: "Descanso após 24h", platform_commission_pct: "Comissão plataforma",
  holiday_surcharge_pct: "Taxa feriado", standard_response_hours: "Resposta padrão",
  urgent_response_minutes: "Resposta urgente", max_match_batch: "Profissionais por lote",
  eval_window_days: "Janela de avaliação",
};
const FIELD_UNITS = {
  min_advance_hours: "h", min_booking_hours: "h", urgent_window_start_hours: "h",
  urgent_window_end_hours: "h", urgent_surcharge_pct: "%", refund_full_hours: "h",
  refund_partial_hours: "h", refund_partial_pct: "%", grace_period_minutes: "min",
  penalty_reset_days: "dias", late_arrival_tolerance_min: "min", gps_radius_meters: "m",
  checkin_reminder_minutes: "min", client_confirm_timeout_hours: "h", day_start_hour: "h",
  night_start_hour: "h", rest_after_24h_hours: "h", platform_commission_pct: "%",
  holiday_surcharge_pct: "%", standard_response_hours: "h", urgent_response_minutes: "min",
  eval_window_days: "dias",
};

const AdminSettings = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [tab, setTab] = useState("booking");
  const [settings, setSettings] = useState({});
  const [defaults, setDefaults] = useState({});
  const [groups, setGroups] = useState({});
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState({});

  useEffect(() => {
    axios.get(`${API}/api/settings`, { headers })
      .then(r => {
        setSettings(r.data.settings);
        setDefaults(r.data.defaults);
        setGroups(r.data.groups);
      })
      .catch(() => toast.error("Erro ao carregar configurações."))
      .finally(() => setLoading(false));
  }, []);

  const loadAudit = () => {
    axios.get(`${API}/api/settings/audit-log`, { headers })
      .then(r => setAuditLog(r.data))
      .catch(() => {});
  };

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setDirty(prev => ({ ...prev, [field]: true }));
  };

  const handleSave = async () => {
    const updates = {};
    for (const [field, isDirty] of Object.entries(dirty)) {
      if (isDirty) updates[field] = settings[field];
    }
    if (Object.keys(updates).length === 0) { toast("Nenhuma alteração."); return; }

    setSaving(true);
    try {
      await axios.patch(`${API}/api/settings`, { updates }, { headers });
      toast.success("Configurações salvas!");
      setDirty({});
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao salvar.");
    } finally { setSaving(false); }
  };

  const tabs = [
    { id: "booking", label: "Agendamento", icon: <Clock size={14}/> },
    { id: "cancellation", label: "Cancelamento", icon: <Shield size={14}/> },
    { id: "pricing", label: "Precificação", icon: <DollarSign size={14}/> },
    { id: "arrival_gps", label: "GPS e Check-in", icon: <Shield size={14}/> },
    { id: "time_ranges", label: "Horários", icon: <Clock size={14}/> },
    { id: "commission", label: "Comissão", icon: <DollarSign size={14}/> },
    { id: "matching", label: "Matching", icon: <Clock size={14}/> },
    { id: "evaluation", label: "Avaliação", icon: <Clock size={14}/> },
    { id: "audit", label: "Auditoria", icon: <History size={14}/> },
  ];

  const SettingRow = ({ field }) => {
    const label = FIELD_LABELS[field] || field;
    const unit = FIELD_UNITS[field] || "";
    const value = settings[field] ?? "";
    const defaultVal = defaults[field];
    const isDirty = dirty[field];
    const isRate = field.includes("_fee_") || field.includes("_rate_");

    return (
      <div className={`flex items-center justify-between py-3 border-b border-slate-100 ${isDirty ? "bg-amber-50 -mx-2 px-2 rounded-lg" : ""}`}>
        <div>
          <span className="text-sm text-slate-700">{label}</span>
          {defaultVal !== undefined && <span className="text-[10px] text-slate-400 ml-2">(padrão: {defaultVal}{unit})</span>}
        </div>
        <div className="flex items-center gap-2">
          {isRate && <span className="text-xs text-slate-400">R$</span>}
          <input type="number" step={isRate ? "0.01" : "1"} className="form-input w-24 text-sm text-right"
            value={value} onChange={e => handleChange(field, e.target.value)} />
          {unit && !isRate && <span className="text-xs text-slate-400 w-8">{unit}</span>}
          {isDirty && <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Alterado" />}
        </div>
      </div>
    );
  };

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-slate-400">Carregando...</p></div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" /><ProfileMenu />
      </nav>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate("/admin")} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft size={20}/></button>
          <div>
            <h1 className="font-display text-2xl font-bold text-navy">Parâmetros Operacionais</h1>
            <p className="text-xs text-slate-500">Alterações aplicadas imediatamente, sem redeploy</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === "audit") loadAudit(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                tab === t.id ? "bg-blue-500 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Settings groups */}
        {tab !== "audit" && tab !== "pricing" && groups[tab] && (
          <div className="card p-6">
            {groups[tab].map(field => <SettingRow key={field} field={field} />)}
          </div>
        )}

        {/* Pricing — special layout with role grouping */}
        {tab === "pricing" && (
          <div className="space-y-4">
            {ROLES.map(role => (
              <div key={role} className="card p-5">
                <h3 className="font-semibold text-navy mb-3">{ROLE_LABELS[role]}</h3>
                <SettingRow field={`initial_fee_${role}`} />
                <SettingRow field={`day_rate_${role}`} />
                <SettingRow field={`night_rate_${role}`} />
              </div>
            ))}
          </div>
        )}

        {/* Audit log */}
        {tab === "audit" && (
          <div className="card p-6">
            <h3 className="font-semibold text-navy mb-4">Log de auditoria</h3>
            {auditLog.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Nenhuma alteração registrada.</p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {auditLog.map(log => (
                  <div key={log.id} className="flex items-start justify-between p-3 rounded-xl bg-slate-50 text-sm">
                    <div>
                      <p className="font-medium text-navy">{FIELD_LABELS[log.field] || log.field}</p>
                      <p className="text-xs text-slate-500">
                        {log.old_value} → <span className="font-semibold text-blue-600">{log.new_value}</span>
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-400 flex-shrink-0">
                      <p>{log.admin_name}</p>
                      <p>{log.created_at && new Date(log.created_at).toLocaleString("pt-BR")}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Save button */}
        {tab !== "audit" && (
          <div className="mt-6">
            {Object.keys(dirty).length > 0 && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-3">
                <AlertTriangle size={14} className="text-amber-500" />
                <p className="text-xs text-amber-700">{Object.keys(dirty).length} campo(s) alterado(s) — clique em Salvar para aplicar</p>
              </div>
            )}
            <button onClick={handleSave} disabled={saving || Object.keys(dirty).length === 0}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              <Save size={16}/> {saving ? "Salvando..." : "Salvar configurações"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSettings;