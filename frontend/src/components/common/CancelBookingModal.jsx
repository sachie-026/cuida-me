import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, AlertTriangle } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

// Keys for reasons — Portuguese values sent to API, display via t()
const REASON_KEYS = [
  { key: "change_of_plans", api: "Mudança de planos" },
  { key: "health_issue", api: "Problema de saúde" },
  { key: "pro_unavailable", api: "Profissional indisponível" },
  { key: "found_another", api: "Encontrei outro profissional" },
  { key: "booking_error", api: "Erro no agendamento" },
  { key: "financial", api: "Problema financeiro" },
  { key: "personal_emergency", api: "Emergência pessoal" },
  { key: "other", api: "Outro" },
];

const CancelBookingModal = ({ booking, cancelledBy = "client", onClose, onCancelled }) => {
  const { t } = useTranslation();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [selectedKey, setSelectedKey] = useState("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  // Calculate refund preview
  const now = new Date();
  const start = booking.scheduled_start ? new Date(booking.scheduled_start) : null;
  const hoursUntil = start ? (start - now) / 1000 / 60 / 60 : 999;
  const created = booking.created_at ? new Date(booking.created_at) : null;
  const minutesSinceCreation = created ? (now - created) / 1000 / 60 : 999;
  const isGrace = minutesSinceCreation <= 10 && booking.status === "pending" && hoursUntil > 7;

  let refundPct = 0;
  let policyKey = "";
  if (isGrace) { refundPct = 100; policyKey = "grace"; }
  else if (hoursUntil > 7) { refundPct = 100; policyKey = "over_7h"; }
  else if (hoursUntil >= 2) { refundPct = 50; policyKey = "2_to_7h"; }
  else { refundPct = 0; policyKey = "under_2h"; }

  const handleCancel = async () => {
    if (!selectedKey) { toast.error(t("cancel_booking.select_reason")); return; }
    const reasonObj = REASON_KEYS.find(r => r.key === selectedKey);
    setSubmitting(true);
    try {
      const { data } = await axios.post(`${API}/api/bookings/${booking.id}/cancel`, {
        reason: reasonObj.api, detail: detail.trim() || null, cancelled_by: cancelledBy,
      }, { headers });
      setResult(data);
      toast.success(t("cancel_booking.cancelled_success"));
      onCancelled?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("cancel_booking.cancel_error"));
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" />
            <h3 className="font-display text-lg font-bold text-navy">{t("cancel_booking.title")}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {result ? (
          <div>
            <div className={`p-4 rounded-xl mb-4 ${result.refund?.refund_pct > 0 ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
              <p className="text-sm font-semibold text-navy mb-1">{t("cancel_booking.booking_cancelled")}</p>
              <p className="text-xs text-slate-600">{result.policy}</p>
              {result.refund && result.refund.refund_amount > 0 && (
                <p className="text-sm font-bold text-green-700 mt-2">
                  {t("cancel_booking.refund_label")} R$ {result.refund.refund_amount.toFixed(2)} ({result.refund.refund_pct}%)
                </p>
              )}
            </div>
            <button onClick={onClose} className="btn-primary w-full">{t("cancel_booking.close")}</button>
          </div>
        ) : (
          <>
            {/* Refund policy preview */}
            <div className={`p-3 rounded-xl mb-4 ${refundPct === 100 ? "bg-green-50 border border-green-200" : refundPct === 50 ? "bg-amber-50 border border-amber-200" : "bg-red-50 border border-red-200"}`}>
              <p className="text-xs font-semibold text-slate-600 uppercase mb-1">{t("cancel_booking.refund_policy")}</p>
              <p className="text-sm font-medium text-navy">{t(`cancel_booking.policy.${policyKey}`)}</p>
              {booking.total_price && refundPct > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  {t("cancel_booking.estimated_refund")} R$ {(booking.total_price * refundPct / 100).toFixed(2)}
                </p>
              )}
            </div>

            {/* Reason selection */}
            <div className="mb-4">
              <p className="form-label">{t("cancel_booking.reason_label")}</p>
              <div className="space-y-2">
                {REASON_KEYS.map(r => (
                  <label key={r.key} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedKey === r.key ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <input type="radio" name="reason" checked={selectedKey === r.key} onChange={() => setSelectedKey(r.key)} className="accent-blue-500" />
                    <span className="text-sm text-slate-700">{t(`cancel_booking.reasons.${r.key}`)}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Detail for "other" */}
            {selectedKey === "other" && (
              <div className="mb-4">
                <label className="form-label">{t("cancel_booking.details")}</label>
                <textarea className="form-input min-h-[60px]" value={detail} onChange={e => setDetail(e.target.value)}
                  placeholder={t("cancel_booking.describe_reason")} />
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={onClose} className="btn-outline flex-1">{t("cancel_booking.back")}</button>
              <button onClick={handleCancel} disabled={!selectedKey || submitting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors">
                {submitting ? t("cancel_booking.cancelling") : t("cancel_booking.confirm_cancel")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CancelBookingModal;