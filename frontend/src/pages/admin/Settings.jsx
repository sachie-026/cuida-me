import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Save, DollarSign, Clock, Shield, AlertTriangle, History, MessageSquare, Plus, Trash2 } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const ROLES = ["caregiver", "nursing_assistant", "technician", "nurse"];

const FIELD_UNIT_KEYS = {
  min_advance_hours: "h", min_booking_hours: "h", urgent_window_start_hours: "h",
  urgent_window_end_hours: "h", urgent_surcharge_pct: "%", refund_full_hours: "h",
  refund_partial_hours: "h", refund_partial_pct: "%", grace_period_minutes: "min",
  penalty_reset_days: "days", late_arrival_tolerance_min: "min", gps_radius_meters: "m",
  checkin_reminder_minutes: "min", client_confirm_timeout_hours: "h", day_start_hour: "h",
  night_start_hour: "h", rest_after_24h_hours: "h", platform_commission_pct: "%",
  holiday_surcharge_pct: "%", standard_response_hours: "h", urgent_response_minutes: "min",
  eval_window_days: "days", auto_release_after_hours: "h", dispute_review_hours: "h",
  min_booking_duration_minutes: "min",
};

const AdminSettings = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
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
      .catch(() => setLoadError(t("admin_settings.load_error")))
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
    if (Object.keys(updates).length === 0) { toast(t("admin_settings.no_changes")); return; }
    updates._loaded_version = configVersion;

    setSaving(true);
    try {
      const { data } = await axios.patch(`${API}/api/settings`, { updates }, { headers });
      toast.success(t("admin_settings.save_success"));
      setDirty({});
      if (data.version) setConfigVersion(data.version);
    } catch (err) {
      const status = err.response?.status;
      if (status === 409) { toast.error(t("admin_settings.conflict_error")); }
      else if (status === 403) { toast.error(t("admin_settings.permission_error")); }
      else { toast.error(err.response?.data?.detail || t("admin_settings.save_error")); }
    } finally { setSaving(false); }
  };

  const tabs = [
    { id: "pricing", label: t("admin_settings.tabs.pricing"), icon: <DollarSign size={14}/> },
    { id: "commission", label: t("admin_settings.tabs.commission"), icon: <DollarSign size={14}/> },
    { id: "payout", label: t("admin_settings.tabs.payout"), icon: <DollarSign size={14}/> },
    { id: "client_fee", label: t("admin_settings.tabs.client_fee"), icon: <DollarSign size={14}/> },
    { id: "min_prices", label: t("admin_settings.tabs.min_prices"), icon: <DollarSign size={14}/> },
    { id: "weekend", label: t("admin_settings.tabs.weekend"), icon: <Clock size={14}/> },
    { id: "travel", label: t("admin_settings.tabs.travel"), icon: <Clock size={14}/> },
    { id: "booking", label: t("admin_settings.tabs.booking"), icon: <Clock size={14}/> },
    { id: "booking_limits", label: t("admin_settings.tabs.booking_limits"), icon: <Clock size={14}/> },
    { id: "cancellation", label: t("admin_settings.tabs.cancellation"), icon: <Shield size={14}/> },
    { id: "cancel_tiers", label: t("admin_settings.tabs.cancel_tiers"), icon: <Shield size={14}/> },
    { id: "pro_penalties", label: t("admin_settings.tabs.pro_penalties"), icon: <Shield size={14}/> },
    { id: "categories", label: t("admin_settings.tabs.categories"), icon: <Shield size={14}/> },
    { id: "arrival_gps", label: t("admin_settings.tabs.arrival_gps"), icon: <Shield size={14}/> },
    { id: "time_ranges", label: t("admin_settings.tabs.time_ranges"), icon: <Clock size={14}/> },
    { id: "matching", label: t("admin_settings.tabs.matching"), icon: <Clock size={14}/> },
    { id: "evaluation", label: t("admin_settings.tabs.evaluation"), icon: <Clock size={14}/> },
    { id: "payment", label: t("admin_settings.tabs.payment"), icon: <DollarSign size={14}/> },
    { id: "content", label: t("admin_settings.tabs.content"), icon: <Clock size={14}/> },
    { id: "general", label: t("admin_settings.tabs.general"), icon: <Shield size={14}/> },
    { id: "messages", label: t("admin_settings.tabs.messages"), icon: <MessageSquare size={14}/> },
    { id: "audit", label: t("admin_settings.tabs.audit"), icon: <History size={14}/> },
  ];

  // Quick messages management
  const DEFAULT_REJECT_MSGS = t("admin_settings.default_reject_msgs", { returnObjects: true });
  const DEFAULT_RESEND_MSGS = t("admin_settings.default_resend_msgs", { returnObjects: true });

  const getQuickMessages = (key, defaults) => {
    const val = settings[key];
    if (Array.isArray(val)) return val;
    if (typeof val === "string") try { return JSON.parse(val); } catch { return defaults; }
    return defaults;
  };

  const addQuickMsg = (key, defaults) => {
    const msgs = [...getQuickMessages(key, defaults), ""];
    handleChange(key, JSON.stringify(msgs));
  };

  const updateQuickMsg = (key, defaults, idx, value) => {
    const msgs = [...getQuickMessages(key, defaults)];
    msgs[idx] = value;
    handleChange(key, JSON.stringify(msgs));
  };

  const removeQuickMsg = (key, defaults, idx) => {
    const msgs = getQuickMessages(key, defaults).filter((_, i) => i !== idx);
    handleChange(key, JSON.stringify(msgs));
  };

  const SettingRow = ({ field }) => {
    const label = t(`admin_settings.field_labels.${field}`, { defaultValue: field });
    const unitKey = FIELD_UNIT_KEYS[field] || "";
    const unit = unitKey ? t(`admin_settings.units.${unitKey}`) : "";
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
          {defaultVal !== undefined && !isBool && <span className="text-[10px] text-slate-400 ml-2">{t("admin_settings.default_value", { value: String(defaultVal).substring(0,30) + unit })}</span>}
        </div>
        <div className="flex items-center gap-2">
          {isBool ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={String(value) === "true"} onChange={e => handleChange(field, String(e.target.checked))} className="accent-blue-500 w-4 h-4" />
              <span className="text-xs text-slate-500">{String(value) === "true" ? t("admin_settings.yes") : t("admin_settings.no")}</span>
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
          {isDirty && <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title={t("admin_settings.changed")} />}
        </div>
      </div>
    );
  };

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-slate-400">{t("admin_settings.loading")}</p></div>;

  if (loadError) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-sm text-red-600 mb-3">{loadError}</p>
        <button onClick={() => window.location.reload()} className="btn-primary text-sm">{t("admin_settings.try_again")}</button>
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
            <h1 className="font-display text-2xl font-bold text-navy">{t("admin_settings.page_title")}</h1>
            <p className="text-xs text-slate-500">{t("admin_settings.page_subtitle")}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {tabs.map(tb => (
            <button key={tb.id} onClick={() => { setTab(tb.id); if (tb.id === "audit") loadAudit(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                tab === tb.id ? "bg-blue-500 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"}`}>
              {tb.icon} {tb.label}
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
                <h3 className="font-semibold text-navy mb-3">{t(`admin_settings.role_labels.${role}`)}</h3>
                <SettingRow field={`initial_fee_${role}`} />
                <SettingRow field={`day_rate_${role}`} />
                <SettingRow field={`night_rate_${role}`} />
              </div>
            ))}
          </div>
        )}

        {/* Quick messages editor */}
        {tab === "messages" && (
          <div className="space-y-6">
            {/* Verification complete template */}
            <div className="card p-5">
              <h3 className="font-semibold text-navy mb-2">{t("admin_settings.messages.verification_complete")}</h3>
              <p className="text-xs text-slate-500 mb-3">{t("admin_settings.messages.verification_hint")}</p>
              <textarea className="form-input text-sm w-full min-h-[80px]"
                value={settings.verification_complete_msg || t("admin_settings.messages.verification_default")}
                onChange={e => handleChange("verification_complete_msg", e.target.value)} />
            </div>

            {/* Resend quick messages */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-navy">{t("admin_settings.messages.resend_title")}</h3>
                <button onClick={() => addQuickMsg("quick_messages_resend", DEFAULT_RESEND_MSGS)}
                  className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-semibold">
                  <Plus size={12} /> {t("admin_settings.add")}
                </button>
              </div>
              <div className="space-y-2">
                {getQuickMessages("quick_messages_resend", DEFAULT_RESEND_MSGS).map((msg, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" className="form-input text-sm flex-1" value={msg}
                      onChange={e => updateQuickMsg("quick_messages_resend", DEFAULT_RESEND_MSGS, i, e.target.value)} />
                    <button onClick={() => removeQuickMsg("quick_messages_resend", DEFAULT_RESEND_MSGS, i)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Reject quick messages */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-navy">{t("admin_settings.messages.reject_title")}</h3>
                <button onClick={() => addQuickMsg("quick_messages_reject", DEFAULT_REJECT_MSGS)}
                  className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-semibold">
                  <Plus size={12} /> {t("admin_settings.add")}
                </button>
              </div>
              <div className="space-y-2">
                {getQuickMessages("quick_messages_reject", DEFAULT_REJECT_MSGS).map((msg, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" className="form-input text-sm flex-1" value={msg}
                      onChange={e => updateQuickMsg("quick_messages_reject", DEFAULT_REJECT_MSGS, i, e.target.value)} />
                    <button onClick={() => removeQuickMsg("quick_messages_reject", DEFAULT_REJECT_MSGS, i)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Audit log */}
        {tab === "audit" && (
          <div className="card p-6">
            <h3 className="font-semibold text-navy mb-4">{t("admin_settings.audit.title")}</h3>
            {auditLog.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">{t("admin_settings.audit.empty")}</p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {auditLog.map(log => (
                  <div key={log.id} className="flex items-start justify-between p-3 rounded-xl bg-slate-50 text-sm">
                    <div>
                      <p className="font-medium text-navy">{t(`admin_settings.field_labels.${log.field}`, { defaultValue: log.field })}</p>
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
                <p className="text-xs text-amber-700">{t("admin_settings.fields_changed", { count: Object.keys(dirty).length })}</p>
              </div>
            )}
            <div className="flex gap-2">
              {Object.keys(dirty).length > 0 && (
                <button onClick={() => { setSettings({...settings, ...Object.fromEntries(Object.keys(dirty).map(k => [k, defaults[k]]))}); setDirty({}); toast(t("admin_settings.changes_discarded")); }}
                  className="btn-outline flex-1 text-sm">{t("admin_settings.discard")}</button>
              )}
              <button onClick={handleSave} disabled={saving || Object.keys(dirty).length === 0}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                <Save size={16}/> {saving ? t("admin_settings.saving") : t("admin_settings.save")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSettings;