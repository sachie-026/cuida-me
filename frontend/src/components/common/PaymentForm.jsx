import { useState, useEffect } from "react";
import { CreditCard, QrCode, CheckCircle, Loader, Copy, Wallet } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

// Lazy-load Stripe — key fetched from backend
let stripePromise = null;
const getStripe = async () => {
  if (!stripePromise) {
    try {
      const { data } = await axios.get(`${API}/api/payments/config`);
      if (data.publishable_key) {
        stripePromise = loadStripe(data.publishable_key);
      }
    } catch { /* Stripe not configured — dev mode */ }
  }
  return stripePromise;
};

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: "14px",
      color: "#1e293b",
      fontFamily: "'Inter', system-ui, sans-serif",
      "::placeholder": { color: "#94a3b8" },
    },
    invalid: { color: "#ef4444" },
  },
  hidePostalCode: true,
};

// ── Inner form (needs Stripe context) ────────────────────────────────────────

const CardPaymentInner = ({ bookingId, amount, method, onPaymentComplete, savedMethods }) => {
  const stripe = useStripe();
  const elements = useElements();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [loading, setLoading] = useState(false);
  const [selectedSaved, setSelectedSaved] = useState(null);
  const [useNewCard, setUseNewCard] = useState(savedMethods.length === 0);

  const handlePay = async () => {
    setLoading(true);
    try {
      // 1. Create PaymentIntent on backend
      const payload = { booking_id: bookingId, method };
      if (selectedSaved && !useNewCard) {
        payload.payment_method_id = selectedSaved;
      }
      const { data } = await axios.post(`${API}/api/payments/initiate`, payload, { headers });

      if (data.mock) {
        toast.success("Pagamento simulado (modo desenvolvimento).");
        setTimeout(async () => {
          try {
            await axios.post(`${API}/api/payments/confirm/${data.payment_id}`, {}, { headers });
            onPaymentComplete?.();
          } catch {}
        }, 2000);
        return;
      }

      // If paid with saved card and already confirmed
      if (data.status === "confirmed") {
        toast.success(method === "credit_card" ? "Pagamento pré-autorizado!" : "Pagamento confirmado!");
        onPaymentComplete?.();
        return;
      }

      // 2. Confirm with Stripe Elements (new card)
      if (!stripe || !elements) {
        toast.error("Stripe não carregado."); return;
      }
      const cardElement = elements.getElement(CardElement);
      if (!cardElement && useNewCard) {
        toast.error("Preencha os dados do cartão."); return;
      }

      const { error, paymentIntent } = await stripe.confirmCardPayment(data.client_secret, {
        payment_method: useNewCard
          ? { card: cardElement }
          : selectedSaved,
      });

      if (error) {
        toast.error(error.message || "Erro no pagamento.");
      } else if (paymentIntent.status === "succeeded" || paymentIntent.status === "requires_capture") {
        // Confirm on backend
        await axios.post(`${API}/api/payments/confirm/${data.payment_id}`, {}, { headers });
        toast.success(method === "credit_card" ? "Pagamento pré-autorizado!" : "Pagamento confirmado!");
        onPaymentComplete?.();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao processar pagamento.");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      {/* Saved cards */}
      {savedMethods.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500">Cartões salvos</p>
          {savedMethods.map(m => (
            <label key={m.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
              selectedSaved === m.id && !useNewCard ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
              <input type="radio" name="saved_card" checked={selectedSaved === m.id && !useNewCard}
                onChange={() => { setSelectedSaved(m.id); setUseNewCard(false); }} className="accent-blue-500" />
              <CreditCard size={16} className="text-slate-400" />
              <span className="text-sm text-navy capitalize">{m.brand} •••• {m.last4}</span>
              <span className="text-xs text-slate-400 ml-auto">{m.exp_month}/{m.exp_year}</span>
            </label>
          ))}
          <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
            useNewCard ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
            <input type="radio" name="saved_card" checked={useNewCard}
              onChange={() => { setUseNewCard(true); setSelectedSaved(null); }} className="accent-blue-500" />
            <Wallet size={16} className="text-blue-500" />
            <span className="text-sm text-navy">Usar novo cartão</span>
          </label>
        </div>
      )}

      {/* Stripe CardElement — only for new card */}
      {useNewCard && (
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <p className="text-xs font-semibold text-slate-500">Dados do cartão</p>
          <div className="bg-white p-3 rounded-lg border border-slate-200">
            <CardElement options={CARD_ELEMENT_OPTIONS} />
          </div>
          <p className="text-[10px] text-slate-400">Dados processados com segurança via Stripe. A CuidaU nunca armazena dados do cartão.</p>
        </div>
      )}

      <button onClick={handlePay} disabled={loading || (!useNewCard && !selectedSaved)}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 py-3">
        {loading ? <><Loader size={16} className="animate-spin" /> Processando...</> :
          `Confirmar e pagar · R$ ${Number(amount).toFixed(2)}`}
      </button>
    </div>
  );
};

// ── Main PaymentForm ─────────────────────────────────────────────────────────

const PaymentForm = ({ bookingId, amount, onPaymentComplete }) => {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [method, setMethod] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pixResult, setPixResult] = useState(null);
  const [stripeReady, setStripeReady] = useState(null); // null = loading, Stripe obj or false
  const [savedMethods, setSavedMethods] = useState([]);

  // Load Stripe + saved methods
  useEffect(() => {
    getStripe().then(s => setStripeReady(s || false));
    axios.get(`${API}/api/payments/methods`, { headers })
      .then(r => setSavedMethods(r.data.methods || []))
      .catch(() => {});
  }, []);

  const methods = [
    { id: "pix", label: "PIX", icon: <QrCode size={20} />, desc: "Pagamento instantâneo" },
    { id: "credit_card", label: "Cartão de Crédito", icon: <CreditCard size={20} />, desc: "Pré-autorização" },
    { id: "debit_card", label: "Cartão de Débito", icon: <CreditCard size={20} />, desc: "Débito direto" },
  ];

  const initiatePix = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/payments/initiate`, {
        booking_id: bookingId, method: "pix",
      }, { headers });
      setPixResult(data);
      if (data.mock) {
        toast.success("Pagamento PIX simulado (modo desenvolvimento).");
        setTimeout(async () => {
          try {
            await axios.post(`${API}/api/payments/confirm/${data.payment_id}`, {}, { headers });
            onPaymentComplete?.();
          } catch {}
        }, 2000);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao gerar PIX.");
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
              onChange={() => { setMethod(m.id); setPixResult(null); }} className="accent-blue-500" />
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

      {/* Card payment via Stripe Elements */}
      {(method === "credit_card" || method === "debit_card") && (
        stripeReady ? (
          <Elements stripe={stripeReady}>
            <CardPaymentInner
              bookingId={bookingId}
              amount={amount}
              method={method}
              onPaymentComplete={onPaymentComplete}
              savedMethods={savedMethods}
            />
          </Elements>
        ) : stripeReady === false ? (
          /* Dev mode — no Stripe key */
          <div className="space-y-3">
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
              <p className="text-xs text-amber-700 font-medium">Modo desenvolvimento: Stripe não configurado.</p>
              <p className="text-xs text-amber-600 mt-1">O pagamento será simulado.</p>
            </div>
            <button onClick={async () => {
              setLoading(true);
              try {
                const { data } = await axios.post(`${API}/api/payments/initiate`, {
                  booking_id: bookingId, method,
                }, { headers });
                if (data.mock) {
                  toast.success("Pagamento simulado (modo desenvolvimento).");
                  setTimeout(async () => {
                    try {
                      await axios.post(`${API}/api/payments/confirm/${data.payment_id}`, {}, { headers });
                      onPaymentComplete?.();
                    } catch {}
                  }, 2000);
                }
              } catch (err) {
                toast.error(err.response?.data?.detail || "Erro.");
              } finally { setLoading(false); }
            }} disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 py-3">
              {loading ? <><Loader size={16} className="animate-spin" /> Processando...</> :
                `Confirmar e pagar · R$ ${Number(amount).toFixed(2)}`}
            </button>
          </div>
        ) : (
          <div className="flex justify-center py-4"><Loader size={20} className="animate-spin text-blue-400" /></div>
        )
      )}

      {/* PIX flow */}
      {method === "pix" && !pixResult && (
        <button onClick={initiatePix} disabled={loading}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 py-3">
          {loading ? <><Loader size={16} className="animate-spin" /> Gerando PIX...</> :
            `Gerar PIX · R$ ${Number(amount).toFixed(2)}`}
        </button>
      )}

      {method === "pix" && pixResult && (
        <div className="p-4 bg-green-50 rounded-xl border border-green-200 text-center">
          <QrCode size={32} className="text-green-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-navy mb-2">PIX gerado!</p>
          {pixResult.pix_code && (
            <div className="bg-white p-3 rounded-lg border border-slate-200 mb-3">
              <p className="text-xs font-mono text-slate-600 break-all mb-2">{pixResult.pix_code.substring(0, 60)}...</p>
              <button onClick={() => copyPix(pixResult.pix_code)}
                className="flex items-center gap-1.5 mx-auto text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg">
                <Copy size={12} /> Copiar código PIX
              </button>
            </div>
          )}
          <p className="text-xs text-slate-500">Escaneie o QR Code ou copie o código PIX e cole no seu app bancário.</p>
          <p className="text-xs text-green-600 mt-2 font-medium">Aguardando confirmação do pagamento...</p>
        </div>
      )}
    </div>
  );
};

export default PaymentForm;