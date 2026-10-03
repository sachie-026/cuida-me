import { useState, useEffect } from "react";
import { ChevronLeft, CreditCard, Plus, Trash2, CheckCircle, Loader } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

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

// ── Add Card Form (needs Stripe context) ─────────────────────────────────────

const AddCardForm = ({ onSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setLoading(true);
    try {
      // 1. Get SetupIntent from backend
      const { data } = await axios.post(`${API}/api/payments/setup-intent`, {}, { headers });
      if (data.mock) {
        toast.success("Cartão salvo (modo desenvolvimento).");
        onSuccess?.();
        return;
      }

      // 2. Confirm SetupIntent with Stripe Elements
      const cardElement = elements.getElement(CardElement);
      const { error, setupIntent } = await stripe.confirmCardSetup(data.client_secret, {
        payment_method: { card: cardElement },
      });

      if (error) {
        toast.error(error.message || "Erro ao salvar cartão.");
      } else if (setupIntent.status === "succeeded") {
        toast.success("Cartão salvo com sucesso!");
        onSuccess?.();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao salvar cartão.");
    } finally { setLoading(false); }
  };

  return (
    <div className="card p-5 space-y-3">
      <p className="text-sm font-semibold text-navy">Novo cartão</p>
      <div className="bg-white p-3 rounded-lg border border-slate-200">
        <CardElement options={CARD_ELEMENT_OPTIONS} />
      </div>
      <p className="text-[10px] text-slate-400">Dados processados com segurança via Stripe. A CuidaU nunca armazena dados do cartão.</p>
      <div className="flex gap-2">
        <button onClick={onCancel} className="btn-outline flex-1">Cancelar</button>
        <button onClick={handleSubmit} disabled={loading || !stripe}
          className="btn-primary flex-1 flex items-center justify-center gap-2">
          {loading ? <Loader size={14} className="animate-spin" /> : null}
          Salvar
        </button>
      </div>
    </div>
  );
};

// ── Main Page ────────────────────────────────────────────────────────────────

const PaymentMethodsPage = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [stripeObj, setStripeObj] = useState(null);
  const [stripeReady, setStripeReady] = useState(false);

  // Load Stripe + saved methods
  useEffect(() => {
    const init = async () => {
      try {
        const { data } = await axios.get(`${API}/api/payments/config`);
        if (data.publishable_key) {
          const s = await loadStripe(data.publishable_key);
          setStripeObj(s);
        }
      } catch { /* Stripe not configured */ }
      setStripeReady(true);
      fetchMethods();
    };
    init();
  }, []);

  const fetchMethods = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/payments/methods`, { headers });
      setMethods(data.methods || []);
    } catch { /* no methods */ }
    setLoading(false);
  };

  const handleRemove = async (id) => {
    try {
      await axios.delete(`${API}/api/payments/methods/${id}`, { headers });
      setMethods(prev => prev.filter(m => m.id !== id));
      toast.success("Cartão removido.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao remover cartão.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" /><ProfileMenu />
      </nav>
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft size={20}/></button>
          <h1 className="font-display text-2xl font-bold text-navy">Métodos de pagamento</h1>
        </div>

        {loading && (
          <div className="flex justify-center py-12"><Loader size={24} className="animate-spin text-blue-400" /></div>
        )}

        {!loading && methods.length === 0 && !adding && (
          <div className="card p-8 text-center">
            <CreditCard size={40} className="mx-auto mb-3 text-slate-300"/>
            <p className="text-sm text-slate-500 mb-4">Nenhum método de pagamento cadastrado.</p>
            <button onClick={() => setAdding(true)} className="btn-primary"><Plus size={14}/> Adicionar cartão</button>
          </div>
        )}

        {!loading && methods.length > 0 && (
          <div className="space-y-3 mb-4">
            {methods.map(m => (
              <div key={m.id} className="card p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard size={20} className="text-blue-500"/>
                  <div>
                    <p className="text-sm font-semibold text-navy capitalize">{m.brand} •••• {m.last4}</p>
                    <p className="text-xs text-slate-400">Expira {m.exp_month}/{m.exp_year}</p>
                  </div>
                </div>
                <button onClick={() => handleRemove(m.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 size={14}/></button>
              </div>
            ))}
            {!adding && (
              <button onClick={() => setAdding(true)} className="btn-outline w-full flex items-center justify-center gap-2">
                <Plus size={14}/> Adicionar cartão
              </button>
            )}
          </div>
        )}

        {adding && stripeReady && (
          stripeObj ? (
            <Elements stripe={stripeObj}>
              <AddCardForm
                onSuccess={() => { setAdding(false); fetchMethods(); }}
                onCancel={() => setAdding(false)}
              />
            </Elements>
          ) : (
            <div className="card p-5 space-y-3">
              <p className="text-sm text-amber-600 font-medium">Modo desenvolvimento: Stripe não configurado.</p>
              <p className="text-xs text-slate-500">Configure STRIPE_PUBLISHABLE_KEY para salvar cartões.</p>
              <button onClick={() => setAdding(false)} className="btn-outline w-full">Fechar</button>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default PaymentMethodsPage;