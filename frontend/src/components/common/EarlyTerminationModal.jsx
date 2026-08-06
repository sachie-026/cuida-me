import { useState } from "react";
import { X, AlertTriangle, Clock, Upload } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const CLIENT_REASONS = [
  "Cuidado não é mais necessário", "Paciente hospitalizado", "Decisão familiar",
  "Conflito de agenda", "Motivos financeiros", "Paciente faleceu", "Outro",
];
const SERIOUS_REASONS = [
  "Negligência profissional", "Prática clínica insegura", "Qualidade de cuidado ruim",
  "Conduta inadequada", "Comportamento desrespeitoso", "Profissional sob efeito de substâncias",
  "Profissional abandonou o serviço", "Profissional recusou deveres acordados",
  "Comportamento fraudulento", "Conduta criminosa", "Violação ética grave", "Outra queixa grave",
];
const PRO_REASONS = [
  "Emergência médica", "Emergência pessoal", "Ambiente de trabalho inseguro",
  "Agressão do cliente", "Abuso verbal", "Violência física",
  "Condições inseguras", "Cliente solicitou encerramento", "Outro",
];

const EarlyTerminationModal = ({ booking, role = "client", onClose, onTerminated }) => {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [step, setStep] = useState(1); // 1=summary, 2=reason, 3=serious-confirm, 4=done
  const [category, setCategory] = useState("general"); // general, serious, professional
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [confirmTruthful, setConfirmTruthful] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isClient = role === "client";
  const reasons = category === "serious" ? SERIOUS_REASONS : isClient ? CLIENT_REASONS : PRO_REASONS;

  // Calculate worked time
  const checkinTime = booking.actual_checkin ? new Date(booking.actual_checkin) : null;
  const now = new Date();
  const workedMin = checkinTime ? Math.round((now - checkinTime) / 60000) : 0;
  const workedHours = Math.floor(workedMin / 60);
  const workedMins = workedMin % 60;
  const scheduledMin = booking.scheduled_start && booking.scheduled_end
    ? Math.round((new Date(booking.scheduled_end) - new Date(booking.scheduled_start)) / 60000) : 0;
  const pctComplete = scheduledMin > 0 ? Math.round((workedMin / scheduledMin) * 100) : 0;

  const handleSubmit = async () => {
    if (!reason) { toast.error("Selecione um motivo."); return; }
    if (category === "serious" && detail.length < 100) { toast.error("Descreva o incidente com pelo menos 100 caracteres."); return; }
    if (category === "serious" && !confirmTruthful) { toast.error("Confirme que as informações são verdadeiras."); return; }

    setSubmitting(true);
    try {
      let gps = { latitude: null, longitude: null };
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
        gps = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch {}

      const { data } = await axios.post(`${API}/api/bookings/${booking.id}/terminate-early`, {
        reason, reason_category: category, detail: detail || null,
        is_serious: category === "serious", ...gps,
      }, { headers });

      setStep(4);
      toast.success(data.message);
      onTerminated?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao encerrar.");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-500" />
            <h3 className="font-display text-lg font-bold text-navy">Encerrar atendimento antecipadamente</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} className="text-slate-400" /></button>
        </div>

        {/* Step 1: Booking summary */}
        {step === 1 && (
          <div>
            <div className="p-4 bg-slate-50 rounded-xl mb-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Início programado</span><span className="font-medium">{booking.scheduled_start && new Date(booking.scheduled_start).toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"})}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Término programado</span><span className="font-medium">{booking.scheduled_end && new Date(booking.scheduled_end).toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"})}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Hora atual</span><span className="font-medium">{now.toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"})}</span></div>
              <div className="border-t border-slate-200 pt-2 mt-2">
                <div className="flex justify-between"><span className="text-slate-500">Horas trabalhadas</span><span className="font-bold text-navy">{workedHours}h{workedMins > 0 ? `${workedMins}min` : ""}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Progresso</span><span className="font-medium">{pctComplete}%</span></div>
              </div>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4">
              <p className="text-xs text-amber-700">Encerrar o serviço antecipadamente pode afetar o pagamento, o reembolso e o status do agendamento. Após enviado, não pode ser revertido sem abrir uma disputa.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-outline flex-1">Cancelar</button>
              <button onClick={() => setStep(2)} className="btn-primary flex-1">Continuar</button>
            </div>
          </div>
        )}

        {/* Step 2: Reason selection */}
        {step === 2 && (
          <div>
            {isClient && (
              <div className="flex gap-2 mb-4">
                <button onClick={() => setCategory("general")} className={`flex-1 py-2 rounded-lg text-xs font-semibold border ${category === "general" ? "bg-blue-50 border-blue-300 text-blue-700" : "border-slate-200 text-slate-500"}`}>Motivo geral</button>
                <button onClick={() => setCategory("serious")} className={`flex-1 py-2 rounded-lg text-xs font-semibold border ${category === "serious" ? "bg-red-50 border-red-300 text-red-600" : "border-slate-200 text-slate-500"}`}>Queixa grave</button>
              </div>
            )}

            {category === "serious" && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-3">
                <p className="text-xs text-red-700">⚠️ Você está reportando um problema grave de conduta profissional. Esta opção deve ser selecionada apenas quando a segurança do paciente, a ética profissional ou a qualidade do cuidado foram comprometidas. Relatos falsos podem resultar em penalidades.</p>
              </div>
            )}

            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {reasons.map(r => (
                <label key={r} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer text-sm ${reason === r ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}>
                  <input type="radio" name="term_reason" checked={reason === r} onChange={() => setReason(r)} className="accent-blue-500" />
                  {r}
                </label>
              ))}
            </div>

            {(reason === "Outro" || reason === "Outra queixa grave" || category === "serious") && (
              <div className="mb-4">
                <textarea className="form-input min-h-[80px] text-sm" placeholder={category === "serious" ? "Descreva o incidente em detalhes (mínimo 100 caracteres)..." : "Descreva o motivo..."} value={detail} onChange={e => setDetail(e.target.value)} />
                {category === "serious" && <p className="text-xs text-slate-400 text-right">{detail.length}/100 mín.</p>}
              </div>
            )}

            {category === "serious" && (
              <label className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl mb-4 cursor-pointer">
                <input type="checkbox" checked={confirmTruthful} onChange={e => setConfirmTruthful(e.target.checked)} className="accent-blue-500 mt-0.5" />
                <span className="text-xs text-slate-600">Confirmo que as informações fornecidas são verdadeiras.</span>
              </label>
            )}

            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="btn-outline flex-1">Voltar</button>
              <button onClick={handleSubmit} disabled={!reason || submitting}
                className={`flex-1 py-2.5 rounded-xl font-semibold text-white disabled:opacity-50 ${category === "serious" ? "bg-red-500 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-600"}`}>
                {submitting ? "Enviando..." : "Confirmar encerramento"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 4 && (
          <div className="text-center py-4">
            <CheckCircle size={40} className="text-green-500 mx-auto mb-3" />
            <p className="font-semibold text-navy mb-1">Atendimento encerrado</p>
            <p className="text-sm text-slate-500 mb-4">{category === "serious" ? "Disputa aberta para análise da equipe." : "Pagamento proporcional será processado."}</p>
            <button onClick={onClose} className="btn-primary w-full">Fechar</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EarlyTerminationModal;