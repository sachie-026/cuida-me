import { useState, useEffect } from "react";
import { CreditCard, QrCode, CheckCircle, Loader, Copy } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const PaymentForm = ({ bookingId, amount, onPaymentComplete }) => {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [method, setMethod] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const [cardForm, setCardForm] = useState({ name: "", number: "", expiry: "", cvv: "" });

  const methods = [
    { id: "pix", label: "PIX", icon: <QrCode size={20} />, desc: "Pagamento instantâneo" },
    { id: "credit_card", label: "Cartão de Crédito", icon: <CreditCard size={20} />, desc: "Pré-autorização" },
    { id: "debit_card", label: "Cartão de Débito", icon: <CreditCard size={20} />, desc: "Débito direto" },
  ];

  const initiate = async () => {
    if (!method) { toast.error("Selecione um método de pagamento."); return; }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/payments/initiate`, {
        booking_id: bookingId, method,
      }, { headers });
      setPaymentResult(data);
      if (data.mock) {
        toast.success("Pagamento simulado (modo desenvolvimento).");
        // Auto-confirm in dev mode
        setTimeout(async () => {
          try {
            await axios.post(`${API}/api/payments/confirm/${data.payment_id}`, {}, { headers });
            onPaymentComplete?.();
          } catch {}
        }, 2000);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao iniciar pagamento.");
    } finally { setLoading(false); }
  };

  const copyPix = (code) => {
    navigator.clipboard.writeText(code);
    toast.success("Código PIX copiado!");
  };

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-slate-500 uppercase">Método de pagamento</p>

      {/* Method selection */}
      <div className="space-y-2">
        {methods.map(m => (
          <label key={m.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
            method === m.id ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
            <input type="radio" name="payment_method" checked={method === m.id}
              onChange={() => { setMethod(m.id); setPaymentResult(null); }} className="accent-blue-500" />
            <div className="flex items-center gap-2 flex-1">
              <span className="text-blue-500">{m.icon}</span>
              <div>
                <p className="text-sm font-semibold text-navy">{m.label}</p>
                <p className="text-xs text-slate-500">{m.desc}</p>
              </div>
            </div>
          </label>
        ))}
      </div>

      {/* Card form (credit/debit) */}
      {(method === "credit_card" || method === "debit_card") && !paymentResult && (
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <p className="text-xs font-semibold text-slate-500">Dados do cartão</p>
          <input className="form-input text-sm" placeholder="Nome no cartão" value={cardForm.name}
            onChange={e => setCardForm(p => ({ ...p, name: e.target.value }))} />
          <input className="form-input text-sm" placeholder="Número do cartão" value={cardForm.number} maxLength={19}
            onChange={e => setCardForm(p => ({ ...p, number: e.target.value.replace(/\D/g, "").replace(/(\d{4})/g, "$1 ").trim() }))} />
          <div className="grid grid-cols-2 gap-3">
            <input className="form-input text-sm" placeholder="MM/AA" value={cardForm.expiry} maxLength={5}
              onChange={e => setCardForm(p => ({ ...p, expiry: e.target.value.replace(/\D/g, "").replace(/(\d{2})(\d)/, "$1/$2") }))} />
            <input className="form-input text-sm" placeholder="CVV" value={cardForm.cvv} maxLength={4} type="password"
              onChange={e => setCardForm(p => ({ ...p, cvv: e.target.value.replace(/\D/g, "") }))} />
          </div>
          <p className="text-[10px] text-slate-400">Dados processados com segurança via Stripe. A CuidaU nunca armazena dados do cartão.</p>
        </div>
      )}

      {/* PIX result */}
      {method === "pix" && paymentResult && (
        <div className="p-4 bg-green-50 rounded-xl border border-green-200 text-center">
          <QrCode size={32} className="text-green-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-navy mb-2">PIX gerado!</p>
          {paymentResult.pix_code && (
            <div className="bg-white p-3 rounded-lg border border-slate-200 mb-3">
              <p className="text-xs font-mono text-slate-600 break-all mb-2">{paymentResult.pix_code.substring(0, 60)}...</p>
              <button onClick={() => copyPix(paymentResult.pix_code)}
                className="flex items-center gap-1.5 mx-auto text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg">
                <Copy size={12} /> Copiar código PIX
              </button>
            </div>
          )}
          <p className="text-xs text-slate-500">Escaneie o QR Code ou copie o código PIX e cole no seu app bancário.</p>
          <p className="text-xs text-green-600 mt-2 font-medium">Aguardando confirmação do pagamento...</p>
        </div>
      )}

      {/* Card result */}
      {(method === "credit_card" || method === "debit_card") && paymentResult && (
        <div className="p-4 bg-green-50 rounded-xl border border-green-200 flex items-center gap-3">
          <CheckCircle size={20} className="text-green-500" />
          <div>
            <p className="text-sm font-semibold text-green-700">
              {method === "credit_card" ? "Pagamento pré-autorizado" : "Pagamento confirmado"}
            </p>
            <p className="text-xs text-green-600">
              {method === "credit_card" ? "O valor será cobrado somente após a conclusão do atendimento." : "Débito processado com sucesso."}
            </p>
          </div>
        </div>
      )}

      {/* Action button */}
      {!paymentResult && (
        <button onClick={initiate} disabled={!method || loading}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 py-3">
          {loading ? <><Loader size={16} className="animate-spin" /> Processando...</> :
            `Confirmar e pagar · R$ ${Number(amount).toFixed(2)}`}
        </button>
      )}
    </div>
  );
};

export default PaymentForm;