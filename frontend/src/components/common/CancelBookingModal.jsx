import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const REASONS = [
  "Mudança de planos",
  "Problema de saúde",
  "Profissional indisponível",
  "Encontrei outro profissional",
  "Erro no agendamento",
  "Problema financeiro",
  "Emergência pessoal",
  "Outro",
];

const CancelBookingModal = ({ booking, cancelledBy = "client", onClose, onCancelled }) => {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  // Calculate refund preview
  const now = new Date();
  const start = booking.scheduled_start ? new Date(booking.scheduled_start) : null;
  const hoursUntil = start ? (start - now) / 1000 / 60 / 60 : 999;
  const created = booking.created_at ? new Date(booking.created_at) : null;
  const minutesSinceCreation = created ? (now - created) / 1000 / 60 : 999;
  const isGrace = minutesSinceCreation <= 10 && booking.status === "pending" && hoursUntil > 12;

  let refundPct = 0;
  let policyText = "";
  if (isGrace) { refundPct = 100; policyText = "Período de graça (10 min): reembolso total"; }
  else if (hoursUntil > 12) { refundPct = 100; policyText = "Mais de 12h antes: reembolso de 100%"; }
  else if (hoursUntil >= 2) { refundPct = 50; policyText = "Entre 2-12h antes: reembolso de 50%"; }
  else { refundPct = 0; policyText = "Menos de 2h antes: sem reembolso"; }

  const handleCancel = async () => {
    if (!reason) { toast.error("Selecione um motivo."); return; }
    setSubmitting(true);
    try {
      const { data } = await axios.post(`${API}/api/bookings/${booking.id}/cancel`, {
        reason, detail: detail.trim() || null, cancelled_by: cancelledBy,
      }, { headers });
      setResult(data);
      toast.success("Agendamento cancelado.");
      onCancelled?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao cancelar.");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" />
            <h3 className="font-display text-lg font-bold text-navy">Cancelar agendamento</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {result ? (
          <div>
            <div className={`p-4 rounded-xl mb-4 ${result.refund?.refund_pct > 0 ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
              <p className="text-sm font-semibold text-navy mb-1">Agendamento cancelado</p>
              <p className="text-xs text-slate-600">{result.policy}</p>
              {result.refund && result.refund.refund_amount > 0 && (
                <p className="text-sm font-bold text-green-700 mt-2">
                  Reembolso: R$ {result.refund.refund_amount.toFixed(2)} ({result.refund.refund_pct}%)
                </p>
              )}
            </div>
            <button onClick={onClose} className="btn-primary w-full">Fechar</button>
          </div>
        ) : (
          <>
            {/* Refund policy preview */}
            <div className={`p-3 rounded-xl mb-4 ${refundPct === 100 ? "bg-green-50 border border-green-200" : refundPct === 50 ? "bg-amber-50 border border-amber-200" : "bg-red-50 border border-red-200"}`}>
              <p className="text-xs font-semibold text-slate-600 uppercase mb-1">Política de reembolso</p>
              <p className="text-sm font-medium text-navy">{policyText}</p>
              {booking.total_price && refundPct > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  Reembolso estimado: R$ {(booking.total_price * refundPct / 100).toFixed(2)}
                </p>
              )}
            </div>

            {/* Reason selection */}
            <div className="mb-4">
              <p className="form-label">Motivo do cancelamento *</p>
              <div className="space-y-2">
                {REASONS.map(r => (
                  <label key={r} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    reason === r ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-blue-500" />
                    <span className="text-sm text-slate-700">{r}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Detail for "Outro" */}
            {reason === "Outro" && (
              <div className="mb-4">
                <label className="form-label">Detalhes</label>
                <textarea className="form-input min-h-[60px]" value={detail} onChange={e => setDetail(e.target.value)}
                  placeholder="Descreva o motivo..." />
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={onClose} className="btn-outline flex-1">Voltar</button>
              <button onClick={handleCancel} disabled={!reason || submitting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors">
                {submitting ? "Cancelando..." : "Confirmar cancelamento"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CancelBookingModal;