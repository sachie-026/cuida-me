import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft, Plus, Trash2, Star, CreditCard, Building2,
  Smartphone, CheckCircle, AlertTriangle, X, Loader2,
} from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const METHOD_LABELS = {
  bank_account: "Conta bancária",
  pix: "Chave PIX",
  card: "Cartão",
};

const METHOD_ICONS = {
  bank_account: <Building2 size={18} className="text-blue-500" />,
  pix: <Smartphone size={18} className="text-green-500" />,
  card: <CreditCard size={18} className="text-purple-500" />,
};

const PIX_TYPE_LABELS = {
  cpf: "CPF",
  email: "E-mail",
  phone: "Telefone",
  random: "Chave aleatória",
};

const BANKS = [
  "Nubank", "Itaú", "Bradesco", "Santander", "Banco do Brasil",
  "Caixa Econômica", "Inter", "C6 Bank", "PagBank", "Neon", "Outro",
];

const PayoutMethodsPage = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState("bank_account");
  const [saving, setSaving] = useState(false);

  // Bank account form
  const [bankForm, setBankForm] = useState({
    bank_name: "", agency: "", account_number: "",
    account_type: "corrente", holder_name: "", holder_cpf: "",
  });

  // PIX form
  const [pixForm, setPixForm] = useState({ pix_key_type: "cpf", pix_key: "" });

  // Card form
  const [cardForm, setCardForm] = useState({ card_brand: "", card_last4: "" });

  const fetchMethods = () => {
    axios.get(`${API}/api/payout-methods`, { headers })
      .then(r => setMethods(Array.isArray(r.data) ? r.data : []))
      .catch(() => toast.error("Erro ao carregar métodos de pagamento."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchMethods(); }, []);

  const resetForms = () => {
    setBankForm({ bank_name: "", agency: "", account_number: "", account_type: "corrente", holder_name: "", holder_cpf: "" });
    setPixForm({ pix_key_type: "cpf", pix_key: "" });
    setCardForm({ card_brand: "", card_last4: "" });
    setShowForm(false);
    setFormType("bank_account");
  };

  const handleCreate = async () => {
    setSaving(true);
    let payload = { method_type: formType, is_primary: methods.length === 0 };

    if (formType === "bank_account") {
      if (!bankForm.bank_name || !bankForm.agency || !bankForm.account_number || !bankForm.holder_cpf) {
        toast.error("Preencha todos os campos obrigatórios."); setSaving(false); return;
      }
      payload = { ...payload, ...bankForm };
    } else if (formType === "pix") {
      if (!pixForm.pix_key) {
        toast.error("Informe a chave PIX."); setSaving(false); return;
      }
      payload = { ...payload, ...pixForm };
    } else if (formType === "card") {
      if (!cardForm.card_brand || !cardForm.card_last4) {
        toast.error("Informe a bandeira e os últimos 4 dígitos."); setSaving(false); return;
      }
      payload = { ...payload, ...cardForm };
    }

    try {
      await axios.post(`${API}/api/payout-methods`, payload, { headers });
      toast.success("Método de pagamento adicionado!");
      resetForms();
      fetchMethods();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao salvar.");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Tem certeza que deseja remover este método de pagamento?")) return;
    try {
      await axios.delete(`${API}/api/payout-methods/${id}`, { headers });
      toast.success("Removido.");
      fetchMethods();
    } catch { toast.error("Erro ao remover."); }
  };

  const handleSetPrimary = async (id) => {
    try {
      await axios.patch(`${API}/api/payout-methods/${id}/primary`, {}, { headers });
      toast.success("Definido como principal!");
      fetchMethods();
    } catch { toast.error("Erro."); }
  };

  const methodSummary = (m) => {
    if (m.method_type === "bank_account") {
      return `${m.bank_name} · Ag ${m.agency} · Cc ${m.account_number}`;
    }
    if (m.method_type === "pix") {
      return `${PIX_TYPE_LABELS[m.pix_key_type] || m.pix_key_type}: ${m.pix_key}`;
    }
    if (m.method_type === "card") {
      return `${m.card_brand} final ${m.card_last4}`;
    }
    return "";
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" />
        <div className="flex items-center gap-3"><LanguageSwitcher /><ProfileMenu /></div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <button onClick={() => navigate("/earnings")} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold text-navy">Conta bancária</h1>
            <p className="text-sm text-slate-500 mt-0.5">Gerencie como você recebe seus pagamentos</p>
          </div>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 p-4 mb-6 bg-blue-50 border border-blue-200 rounded-xl">
          <AlertTriangle size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            Os pagamentos são transferidos para o método principal após o checkout confirmado pelo cliente.
            A conta ou chave PIX deve estar no mesmo CPF do seu cadastro.
          </p>
        </div>

        {/* Existing methods */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-slate-300" />
          </div>
        ) : (
          <>
            {methods.length === 0 && !showForm ? (
              <div className="card p-8 text-center mb-6">
                <CreditCard size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="text-navy font-semibold mb-1">Nenhum método cadastrado</p>
                <p className="text-sm text-slate-500 mb-4">Adicione uma conta bancária, chave PIX ou cartão para receber seus pagamentos.</p>
                <button onClick={() => setShowForm(true)} className="btn-primary inline-flex items-center gap-2">
                  <Plus size={16} /> Adicionar método
                </button>
              </div>
            ) : (
              <div className="space-y-3 mb-6">
                {methods.map(m => (
                  <div key={m.id} className={`card p-4 transition-all ${m.is_primary ? "border-l-4 border-l-green-500" : ""}`}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex-shrink-0">{METHOD_ICONS[m.method_type]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-navy">{METHOD_LABELS[m.method_type]}</span>
                          {m.is_primary && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              <Star size={10} /> Principal
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">{methodSummary(m)}</p>
                        {m.holder_cpf && (
                          <p className="text-[10px] text-slate-400 mt-0.5">CPF: {m.holder_cpf}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {!m.is_primary && (
                          <button onClick={() => handleSetPrimary(m.id)}
                            title="Definir como principal"
                            className="p-1.5 rounded-lg hover:bg-green-50 text-slate-300 hover:text-green-500 transition-colors">
                            <Star size={14} />
                          </button>
                        )}
                        <button onClick={() => handleDelete(m.id)}
                          title="Remover"
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add button (if methods exist) */}
            {methods.length > 0 && !showForm && (
              <button onClick={() => setShowForm(true)}
                className="w-full card p-3 text-center text-sm font-semibold text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
                <Plus size={16} /> Adicionar outro método
              </button>
            )}
          </>
        )}

        {/* Add form */}
        {showForm && (
          <div className="card p-6 mt-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-navy">Novo método de pagamento</h2>
              <button onClick={resetForms} className="p-1 rounded hover:bg-slate-100"><X size={16} className="text-slate-400" /></button>
            </div>

            {/* Type selector */}
            <div className="flex gap-2 mb-6">
              {[
                { type: "bank_account", label: "Conta bancária", icon: <Building2 size={14} /> },
                { type: "pix", label: "Chave PIX", icon: <Smartphone size={14} /> },
                { type: "card", label: "Cartão", icon: <CreditCard size={14} /> },
              ].map(t => (
                <button key={t.type} onClick={() => setFormType(t.type)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                    formType === t.type ? "bg-blue-100 text-blue-700 ring-2 ring-blue-300" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Bank account form */}
            {formType === "bank_account" && (
              <div className="space-y-3">
                <div>
                  <label className="form-label">Banco *</label>
                  <select className="form-input" value={bankForm.bank_name}
                    onChange={e => setBankForm(p => ({ ...p, bank_name: e.target.value }))}>
                    <option value="">Selecione o banco</option>
                    {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Agência *</label>
                    <input className="form-input" value={bankForm.agency} placeholder="0001"
                      onChange={e => setBankForm(p => ({ ...p, agency: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">Conta *</label>
                    <input className="form-input" value={bankForm.account_number} placeholder="12345-6"
                      onChange={e => setBankForm(p => ({ ...p, account_number: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="form-label">Tipo de conta</label>
                  <select className="form-input" value={bankForm.account_type}
                    onChange={e => setBankForm(p => ({ ...p, account_type: e.target.value }))}>
                    <option value="corrente">Corrente</option>
                    <option value="poupanca">Poupança</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Nome do titular *</label>
                  <input className="form-input" value={bankForm.holder_name} placeholder="Nome completo"
                    onChange={e => setBankForm(p => ({ ...p, holder_name: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">CPF do titular *</label>
                  <input className="form-input" value={bankForm.holder_cpf} placeholder="000.000.000-00"
                    onChange={e => setBankForm(p => ({ ...p, holder_cpf: e.target.value }))} />
                  <p className="text-[10px] text-slate-400 mt-1">Deve ser o mesmo CPF do seu cadastro profissional.</p>
                </div>
              </div>
            )}

            {/* PIX form */}
            {formType === "pix" && (
              <div className="space-y-3">
                <div>
                  <label className="form-label">Tipo de chave *</label>
                  <select className="form-input" value={pixForm.pix_key_type}
                    onChange={e => setPixForm(p => ({ ...p, pix_key_type: e.target.value, pix_key: "" }))}>
                    <option value="cpf">CPF</option>
                    <option value="email">E-mail</option>
                    <option value="phone">Telefone</option>
                    <option value="random">Chave aleatória</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Chave PIX *</label>
                  <input className="form-input" value={pixForm.pix_key}
                    placeholder={
                      pixForm.pix_key_type === "cpf" ? "00000000000" :
                      pixForm.pix_key_type === "email" ? "seu@email.com" :
                      pixForm.pix_key_type === "phone" ? "+5511999999999" :
                      "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    }
                    onChange={e => setPixForm(p => ({ ...p, pix_key: e.target.value }))} />
                  {pixForm.pix_key_type === "cpf" && (
                    <p className="text-[10px] text-slate-400 mt-1">Deve ser o mesmo CPF do seu cadastro.</p>
                  )}
                </div>
              </div>
            )}

            {/* Card form */}
            {formType === "card" && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-2">
                  <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    O número completo do cartão é processado diretamente pelo gateway de pagamento.
                    A CuidaU nunca armazena o número completo ou o código de segurança.
                  </p>
                </div>
                <div>
                  <label className="form-label">Bandeira *</label>
                  <select className="form-input" value={cardForm.card_brand}
                    onChange={e => setCardForm(p => ({ ...p, card_brand: e.target.value }))}>
                    <option value="">Selecione</option>
                    <option value="Visa">Visa</option>
                    <option value="Mastercard">Mastercard</option>
                    <option value="Elo">Elo</option>
                    <option value="Hipercard">Hipercard</option>
                    <option value="American Express">American Express</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Últimos 4 dígitos *</label>
                  <input className="form-input" value={cardForm.card_last4} placeholder="0000" maxLength={4}
                    onChange={e => setCardForm(p => ({ ...p, card_last4: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
                </div>
                <p className="text-[10px] text-slate-400">
                  Em produção, a tokenização do cartão será feita pelo Stripe. Apenas a bandeira e últimos 4 dígitos são armazenados.
                </p>
              </div>
            )}

            <button onClick={handleCreate} disabled={saving}
              className="btn-primary w-full mt-6 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> :
                <><CheckCircle size={16} /> Salvar método de pagamento</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PayoutMethodsPage;