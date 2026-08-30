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
  urgent_surcharge_pct: "Taxa de urgência (%)", urgent_booking_enabled: "Urgência habilitada",
  urgent_fee_method: "Método taxa urgente", urgent_fixed_amount: "Valor fixo urgência (R$)",
  refund_full_hours: "Reembolso total (antes de)",
  refund_partial_hours: "Reembolso parcial (antes de)", refund_partial_pct: "% reembolso parcial",
  grace_period_minutes: "Período de graça", grace_max_uses_30d: "Usos do grace (30 dias)",
  penalty_reset_days: "Reset de penalidades", late_arrival_tolerance_min: "Tolerância atraso",
  late_arrival_public_threshold: "Atraso afeta rating após", gps_radius_meters: "Raio GPS check-in",
  checkin_reminder_minutes: "Lembrete check-in", client_confirm_timeout_hours: "Timeout confirmação",
  day_start_hour: "Início período diurno", night_start_hour: "Início período noturno",
  rest_after_24h_hours: "Descanso após 24h", platform_commission_pct: "Comissão plataforma",
  holiday_surcharge_pct: "Taxa feriado (%)", holiday_pricing_enabled: "Precificação feriado habilitada",
  holiday_pricing_method: "Método feriado", holiday_specific_rate: "Taxa fixa feriado (R$)",
  holiday_dates: "Datas de feriados",
  standard_response_hours: "Resposta padrão",
  urgent_response_minutes: "Resposta urgente", max_match_batch: "Profissionais por lote",
  eval_window_days: "Janela de avaliação",
  // 50d: Payment
  payment_methods_enabled: "Métodos habilitados", auto_release_after_hours: "Liberação automática",
  dispute_review_hours: "Prazo revisão disputa",
  // 50b: Categories
  enabled_categories: "Categorias habilitadas", min_booking_duration_minutes: "Duração mínima agendamento",
  category_active_caregiver: "Cuidador ativo", category_active_nursing_assistant: "Auxiliar ativo",
  category_active_technician: "Técnico ativo", category_active_nurse: "Enfermeiro ativo",
  // 50d: Content
  platform_name: "Nome da plataforma", support_email: "E-mail suporte", support_whatsapp: "WhatsApp suporte",
  // 50d: General
  maintenance_mode: "Modo manutenção", allow_new_registrations: "Permitir cadastros",
  // 50-4: Weekend
  weekend_pricing_enabled: "Precificação fim de semana", weekend_saturday_applies: "Sábado aplica",
  weekend_sunday_applies: "Domingo aplica", weekend_pricing_method: "Método",
  weekend_surcharge_pct: "Taxa fim de semana", weekend_specific_rate: "Taxa fixa (R$)",
  // 50-6: Min prices
  min_price_caregiver: "Preço mín. Cuidador", min_price_nursing_assistant: "Preço mín. Auxiliar",
  min_price_technician: "Preço mín. Técnico", min_price_nurse: "Preço mín. Enfermeiro",
  // 50-12: Travel
  travel_fee_enabled: "Taxa deslocamento", travel_free_distance_km: "Distância grátis",
  travel_fee_method: "Método cálculo", travel_fee_rate: "Valor por km",
  // 50-14: Client fee
  client_service_fee_enabled: "Taxa serviço cliente", client_service_fee_method: "Método taxa",
  client_service_fee_pct: "Taxa cliente (%)", client_service_fee_fixed: "Taxa fixa (R$)",
  // 50-15: Payout
  professional_payout_pct: "Payout profissional",
  // 50-22-25: Limits
  max_booking_duration_enabled: "Duração máxima habilitada", max_booking_duration_hours: "Duração máxima",
  max_future_booking_days: "Máx. dias futuro", max_active_bookings_per_client: "Máx. agendamentos ativos",
  max_consecutive_work_hours: "Máx. horas consecutivas",
  // 50-26: Cancel tiers
  cancel_tier1_hours: "Tier 1: horas antes", cancel_tier1_refund_pct: "Tier 1: reembolso (%)",
  cancel_tier1_pro_pct: "Tier 1: compensação pro (%)", cancel_tier2_hours: "Tier 2: horas antes",
  cancel_tier2_refund_pct: "Tier 2: reembolso (%)", cancel_tier2_pro_pct: "Tier 2: compensação pro (%)",
  cancel_tier3_refund_pct: "Tier 3: reembolso (%)", cancel_tier3_pro_pct: "Tier 3: compensação pro (%)",
  cancel_noshow_refund_pct: "No-show: reembolso (%)", cancel_noshow_pro_pct: "No-show: compensação pro (%)",
  // 50-28: Pro penalties
  pro_cancel_warning_threshold: "Aviso após N cancelamentos", pro_cancel_suspend_days_first: "Suspensão 1ª vez (dias)",
  pro_cancel_suspend_days_repeat: "Suspensão reincidência (dias)", pro_cancel_review_threshold: "Revisão após N cancelamentos",
};
const FIELD_UNITS = {
  min_advance_hours: "h", min_booking_hours: "h", urgent_window_start_hours: "h",
  urgent_window_end_hours: "h", urgent_surcharge_pct: "%", refund_full_hours: "h",
  refund_partial_hours: "h", refund_partial_pct: "%", grace_period_minutes: "min",
  penalty_reset_days: "dias", late_arrival_tolerance_min: "min", gps_radius_meters: "m",
  checkin_reminder_minutes: "min", client_confirm_timeout_hours: "h", day_start_hour: "h",
  night_start_hour: "h", rest_after_24h_hours: "h", platform_commission_pct: "%",
  holiday_surcharge_pct: "%", standard_response_hours: "h", urgent_response_minutes: "min",
  eval_window_days: "dias", auto_release_after_hours: "h", dispute_review_hours: "h",
  min_booking_duration_minutes: "min",
};

const AdminSettings = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [tab, setTab] = useState("pricing");
  const [settings, setSettings] = useState({});
  const [defaults, setDefaults] = useState({});
  const [groups, setGroups] = useState({});
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState({});
  const [loadError, setLoadError] = useState("");
  const [configVersion, setConfigVersion] = useState(0);

  useEffect(() => {
    setLoadError("");
    axios.get(`${API}/api/settings`, { headers })
      .then(r => {
        setSettings(r.data.settings);
        setDefaults(r.data.defaults);
        setGroups(r.data.groups);
        setConfigVersion(r.data.settings?._version || 0);
      })
      .catch(() => setLoadError("Não foi possível carregar as configurações."))
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
    updates._loaded_version = configVersion;

    setSaving(true);
    try {
      const { data } = await axios.patch(`${API}/api/settings`, { updates }, { headers });
      toast.success("Configurações salvas!");
      setDirty({});
      if (data.version) setConfigVersion(data.version);
    } catch (err) {
      const status = err.response?.status;
      if (status === 409) { toast.error("Configurações foram alteradas por outro admin. Recarregue a página."); }
      else if (status === 403) { toast.error("Você não tem permissão para alterar estas configurações."); }
      else { toast.error(err.response?.data?.detail || "Erro ao salvar. As configurações anteriores permanecem ativas."); }
    } finally { setSaving(false); }
  };

  const tabs = [
    { id: "pricing", label: "Precificação", icon: <DollarSign size={14}/> },
    { id: "commission", label: "Comissão", icon: <DollarSign size={14}/> },
    { id: "payout", label: "Payout", icon: <DollarSign size={14}/> },
    { id: "client_fee", label: "Taxa cliente", icon: <DollarSign size={14}/> },
    { id: "min_prices", label: "Preço mínimo", icon: <DollarSign size={14}/> },
    { id: "weekend", label: "Fim de semana", icon: <Clock size={14}/> },
    { id: "travel", label: "Deslocamento", icon: <Clock size={14}/> },
    { id: "booking", label: "Agendamento", icon: <Clock size={14}/> },
    { id: "booking_limits", label: "Limites", icon: <Clock size={14}/> },
    { id: "cancellation", label: "Cancelamento", icon: <Shield size={14}/> },
    { id: "cancel_tiers", label: "Tiers reembolso", icon: <Shield size={14}/> },
    { id: "pro_penalties", label: "Penalidades pro", icon: <Shield size={14}/> },
    { id: "categories", label: "Categorias", icon: <Shield size={14}/> },
    { id: "arrival_gps", label: "GPS", icon: <Shield size={14}/> },
    { id: "time_ranges", label: "Horários", icon: <Clock size={14}/> },
    { id: "matching", label: "Matching", icon: <Clock size={14}/> },
    { id: "evaluation", label: "Avaliação", icon: <Clock size={14}/> },
    { id: "payment", label: "Pagamento", icon: <DollarSign size={14}/> },
    { id: "content", label: "Conteúdo", icon: <Clock size={14}/> },
    { id: "general", label: "Geral", icon: <Shield size={14}/> },
    { id: "audit", label: "Auditoria", icon: <History size={14}/> },
  ];

  const SettingRow = ({ field }) => {
    const label = FIELD_LABELS[field] || field;
    const unit = FIELD_UNITS[field] || "";
    const value = settings[field] ?? "";
    const defaultVal = defaults[field];
    const isDirty = dirty[field];
    const isRate = field.includes("_fee_") || field.includes("_rate_");
    const isText = typeof defaultVal === "string" && !unit && !isRate && isNaN(Number(defaultVal));
    const isBool = defaultVal === "true" || defaultVal === "false" || typeof defaultVal === "boolean";

    return (
      <div className={`flex items-center justify-between py-3 border-b border-slate-100 ${isDirty ? "bg-amber-50 -mx-2 px-2 rounded-lg" : ""}`}>
        <div>
          <span className="text-sm text-slate-700">{label}</span>
          {defaultVal !== undefined && !isBool && <span className="text-[10px] text-slate-400 ml-2">(padrão: {String(defaultVal).substring(0,30)}{unit})</span>}
        </div>
        <div className="flex items-center gap-2">
          {isBool ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={String(value) === "true"} onChange={e => handleChange(field, String(e.target.checked))} className="accent-blue-500 w-4 h-4" />
              <span className="text-xs text-slate-500">{String(value) === "true" ? "Sim" : "Não"}</span>
            </label>
          ) : isText ? (
            <input type="text" className="form-input w-48 text-sm" value={value} onChange={e => handleChange(field, e.target.value)} />
          ) : (
            <>
              {isRate && <span className="text-xs text-slate-400">R$</span>}
              <input type="number" step={isRate ? "0.01" : "1"} className="form-input w-24 text-sm text-right"
                value={value} onChange={e => handleChange(field, e.target.value)} />
              {unit && !isRate && <span className="text-xs text-slate-400 w-8">{unit}</span>}
            </>
          )}
          {isDirty && <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Alterado" />}
        </div>
      </div>
    );
  };

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-slate-400">Carregando...</p></div>;

  if (loadError) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-sm text-red-600 mb-3">{loadError}</p>
        <button onClick={() => window.location.reload()} className="btn-primary text-sm">Tentar novamente</button>
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

        {/* Save / Cancel / Discard */}
        {tab !== "audit" && (
          <div className="mt-6">
            {Object.keys(dirty).length > 0 && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-3">
                <AlertTriangle size={14} className="text-amber-500" />
                <p className="text-xs text-amber-700">{Object.keys(dirty).length} campo(s) alterado(s)</p>
              </div>
            )}
            <div className="flex gap-2">
              {Object.keys(dirty).length > 0 && (
                <button onClick={() => { setSettings({...settings, ...Object.fromEntries(Object.keys(dirty).map(k => [k, defaults[k]]))}); setDirty({}); toast("Alterações descartadas."); }}
                  className="btn-outline flex-1 text-sm">Descartar</button>
              )}
              <button onClick={handleSave} disabled={saving || Object.keys(dirty).length === 0}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                <Save size={16}/> {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSettings;