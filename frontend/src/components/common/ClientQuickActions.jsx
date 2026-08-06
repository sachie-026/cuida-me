import { useState } from "react";
import { CheckCircle, AlertTriangle, MessageSquare } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const ClientQuickActions = ({ booking, onUpdate }) => {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const [loading, setLoading] = useState(false);

  const isArrived = booking.status === "professional_arrived";
  const isInProgress = booking.status === "checked_in";
  const isCompleted = booking.status === "completed";

  const sendQuickMessage = async (text) => {
    try {
      await axios.post(`${API}/api/messages`, { booking_id: booking.id, content: text }, { headers });
      toast.success("Mensagem enviada!");
    } catch { toast.error("Erro ao enviar."); }
  };

  const confirmStart = async () => {
    setLoading(true);
    try {
      await axios.patch(`${API}/api/bookings/${booking.id}/confirm-checkin`, {}, { headers });
      toast.success("Início do atendimento confirmado!");
      onUpdate?.();
    } catch { toast.error("Erro ao confirmar."); }
    finally { setLoading(false); }
  };

  const confirmEnd = async () => {
    setLoading(true);
    try {
      await axios.patch(`${API}/api/bookings/${booking.id}/confirm-checkout`, {}, { headers });
      toast.success("Conclusão confirmada! Pagamento será processado.");
      onUpdate?.();
    } catch { toast.error("Erro ao confirmar."); }
    finally { setLoading(false); }
  };

  const reportIssue = async () => {
    const reason = prompt("Descreva o problema:");
    if (!reason) return;
    setLoading(true);
    try {
      await axios.post(`${API}/api/bookings/${booking.id}/report-issue?reason=${encodeURIComponent(reason)}`, {}, { headers });
      toast.success("Problema reportado. Equipe irá analisar.");
      onUpdate?.();
    } catch { toast.error("Erro ao reportar."); }
    finally { setLoading(false); }
  };

  if (!isArrived && !isInProgress && !isCompleted) return null;

  return (
    <div className="p-4 rounded-xl border border-green-200 bg-green-50 space-y-3">
      {/* Quick messages for client */}
      {(booking.status === "accepted") && (
        <button onClick={() => sendQuickMessage("✅ Pode vir! Estou esperando.")}
          className="w-full text-xs py-2 rounded-lg bg-blue-100 text-blue-700 font-semibold hover:bg-blue-200 transition-colors">
          ✅ Pode vir — Estou esperando
        </button>
      )}

      {/* Professional arrived — confirm start */}
      {isArrived && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-navy">Profissional chegou!</p>
          <p className="text-xs text-slate-500">Confirme que o atendimento pode começar.</p>
          <div className="flex gap-2">
            <button onClick={confirmStart} disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm disabled:opacity-50">
              <CheckCircle size={14} /> Confirmar início
            </button>
            <button onClick={reportIssue} disabled={loading}
              className="flex-1 py-2 rounded-xl bg-red-50 text-red-500 text-sm font-semibold hover:bg-red-100 disabled:opacity-50">
              Reportar problema
            </button>
          </div>
        </div>
      )}

      {/* Service completed — confirm end */}
      {isCompleted && !booking.client_confirmed_end && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-navy">Atendimento finalizado</p>
          <p className="text-xs text-slate-500">O profissional marcou o atendimento como concluído. Confirme para liberar o pagamento.</p>
          <div className="flex gap-2">
            <button onClick={confirmEnd} disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm disabled:opacity-50">
              <CheckCircle size={14} /> Confirmar conclusão
            </button>
            <button onClick={reportIssue} disabled={loading}
              className="flex-1 py-2 rounded-xl bg-red-50 text-red-500 text-sm font-semibold hover:bg-red-100 disabled:opacity-50">
              Reportar problema
            </button>
          </div>
        </div>
      )}

      {/* In progress — quick message */}
      {isInProgress && (
        <button onClick={() => sendQuickMessage("Estou disponível se precisar de algo.")}
          className="w-full text-xs py-2 rounded-lg bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200 transition-colors">
          💬 Enviar mensagem ao profissional
        </button>
      )}
    </div>
  );
};

export default ClientQuickActions;