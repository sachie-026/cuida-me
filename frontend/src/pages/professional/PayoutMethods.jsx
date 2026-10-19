import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

const METHOD_ICONS = {
  bank_account: <Building2 size={18} className="text-blue-500" />,
  pix: <Smartphone size={18} className="text-green-500" />,
  card: <CreditCard size={18} className="text-purple-500" />,
};

const BANKS = [
  "Nubank", "Itaú", "Bradesco", "Santander", "Banco do Brasil",
  "Caixa Econômica", "Inter", "C6 Bank", "PagBank", "Neon", "Outro",
];

const PayoutMethodsPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
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
      .catch(() => toast.error(t("pro_payout.toast_load_error")))
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
        toast.error(t("pro_payout.toast_fill_required")); setSaving(false); return;
      }
      payload = { ...payload, ...bankForm };
    } else if (formType === "pix") {
      if (!pixForm.pix_key) {
        toast.error(t("pro_payout.toast_pix_required")); setSaving(false); return;
      }
      payload = { ...payload, ...pixForm };
    } else if (formType === "card") {
      if (!cardForm.card_brand || !cardForm.card_last4) {
        toast.error(t("pro_payout.toast_card_required")); setSaving(false); return;
      }
      payload = { ...payload, ...cardForm };
    }

    try {
      await axios.post(`${API}/api/payout-methods`, payload, { headers });
      toast.success(t("pro_payout.toast_added"));
      resetForms();
      fetchMethods();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("pro_payout.toast_save_error"));
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t("pro_payout.confirm_delete"))) return;
    try {
      await axios.delete(`${API}/api/payout-methods/${id}`, { headers });
      toast.success(t("pro_payout.toast_removed"));
      fetchMethods();
    } catch { toast.error(t("pro_payout.toast_remove_error")); }
  };

  const handleSetPrimary = async (id) => {
    try {
      await axios.patch(`${API}/api/payout-methods/${id}/primary`, {}, { headers });
      toast.success(t("pro_payout.toast_set_primary"));
      fetchMethods();
    } catch { toast.error(t("pro_payout.toast_error")); }
  };

  const methodSummary = (m) => {
    if (m.method_type === "bank_account") {
      return `${m.bank_name} · Ag ${m.agency} · Cc ${m.account_number}`;
    }
    if (m.method_type === "pix") {
      return `${t(`pro_payout.pix_type_${m.pix_key_type}`)}: ${m.pix_key}`;
    }
    if (m.method_type === "card") {
      return `${m.card_brand} ${t("pro_payout.card_ending")} ${m.card_last4}`;
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
            <h1 className="font-display text-2xl font-bold text-navy">{t("pro_payout.title")}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{t("pro_payout.subtitle")}</p>
          </div>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 p-4 mb-6 bg-blue-50 border border-blue-200 rounded-xl">
          <AlertTriangle size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">{t("pro_payout.info_banner")}</p>
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
                <p className="text-navy font-semibold mb-1">{t("pro_payout.empty_title")}</p>
                <p className="text-sm text-slate-500 mb-4">{t("pro_payout.empty_desc")}</p>
                <button onClick={() => setShowForm(true)} className="btn-primary inline-flex items-center gap-2">
                  <Plus size={16} /> {t("pro_payout.add_method")}
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
                          <span className="text-sm font-semibold text-navy">{t(`pro_payout.method_${m.method_type}`)}</span>
                          {m.is_primary && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              <Star size={10} /> {t("pro_payout.primary")}
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
                            title={t("pro_payout.set_primary_title")}
                            className="p-1.5 rounded-lg hover:bg-green-50 text-slate-300 hover:text-green-500 transition-colors">
                            <Star size={14} />
                          </button>
                        )}
                        <button onClick={() => handleDelete(m.id)}
                          title={t("pro_payout.remove_title")}
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
                <Plus size={16} /> {t("pro_payout.add_another")}
              </button>
            )}
          </>
        )}

        {/* Add form */}
        {showForm && (
          <div className="card p-6 mt-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-navy">{t("pro_payout.new_method")}</h2>
              <button onClick={resetForms} className="p-1 rounded hover:bg-slate-100"><X size={16} className="text-slate-400" /></button>
            </div>

            {/* Type selector */}
            <div className="flex gap-2 mb-6">
              {[
                { type: "bank_account", icon: <Building2 size={14} /> },
                { type: "pix", icon: <Smartphone size={14} /> },
                { type: "card", icon: <CreditCard size={14} /> },
              ].map(item => (
                <button key={item.type} onClick={() => setFormType(item.type)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                    formType === item.type ? "bg-blue-100 text-blue-700 ring-2 ring-blue-300" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>
                  {item.icon} {t(`pro_payout.method_${item.type}`)}
                </button>
              ))}
            </div>

            {/* Bank account form */}
            {formType === "bank_account" && (
              <div className="space-y-3">
                <div>
                  <label className="form-label">{t("pro_payout.bank_label")}</label>
                  <select className="form-input" value={bankForm.bank_name}
                    onChange={e => setBankForm(p => ({ ...p, bank_name: e.target.value }))}>
                    <option value="">{t("pro_payout.select_bank")}</option>
                    {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">{t("pro_payout.agency_label")}</label>
                    <input className="form-input" value={bankForm.agency} placeholder="0001"
                      onChange={e => setBankForm(p => ({ ...p, agency: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">{t("pro_payout.account_label")}</label>
                    <input className="form-input" value={bankForm.account_number} placeholder="12345-6"
                      onChange={e => setBankForm(p => ({ ...p, account_number: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="form-label">{t("pro_payout.account_type_label")}</label>
                  <select className="form-input" value={bankForm.account_type}
                    onChange={e => setBankForm(p => ({ ...p, account_type: e.target.value }))}>
                    <option value="corrente">{t("pro_payout.account_checking")}</option>
                    <option value="poupanca">{t("pro_payout.account_savings")}</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">{t("pro_payout.holder_name_label")}</label>
                  <input className="form-input" value={bankForm.holder_name} placeholder={t("pro_payout.holder_name_placeholder")}
                    onChange={e => setBankForm(p => ({ ...p, holder_name: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">{t("pro_payout.holder_cpf_label")}</label>
                  <input className="form-input" value={bankForm.holder_cpf} placeholder="000.000.000-00"
                    onChange={e => setBankForm(p => ({ ...p, holder_cpf: e.target.value }))} />
                  <p className="text-[10px] text-slate-400 mt-1">{t("pro_payout.cpf_note")}</p>
                </div>
              </div>
            )}

            {/* PIX form */}
            {formType === "pix" && (
              <div className="space-y-3">
                <div>
                  <label className="form-label">{t("pro_payout.pix_key_type_label")}</label>
                  <select className="form-input" value={pixForm.pix_key_type}
                    onChange={e => setPixForm(p => ({ ...p, pix_key_type: e.target.value, pix_key: "" }))}>
                    <option value="cpf">CPF</option>
                    <option value="email">E-mail</option>
                    <option value="phone">{t("pro_payout.pix_type_phone")}</option>
                    <option value="random">{t("pro_payout.pix_type_random")}</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">{t("pro_payout.pix_key_label")}</label>
                  <input className="form-input" value={pixForm.pix_key}
                    placeholder={
                      pixForm.pix_key_type === "cpf" ? "00000000000" :
                      pixForm.pix_key_type === "email" ? "seu@email.com" :
                      pixForm.pix_key_type === "phone" ? "+5511999999999" :
                      "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    }
                    onChange={e => setPixForm(p => ({ ...p, pix_key: e.target.value }))} />
                  {pixForm.pix_key_type === "cpf" && (
                    <p className="text-[10px] text-slate-400 mt-1">{t("pro_payout.cpf_note_pix")}</p>
                  )}
                </div>
              </div>
            )}

            {/* Card form */}
            {formType === "card" && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-2">
                  <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">{t("pro_payout.card_security_note")}</p>
                </div>
                <div>
                  <label className="form-label">{t("pro_payout.card_brand_label")}</label>
                  <select className="form-input" value={cardForm.card_brand}
                    onChange={e => setCardForm(p => ({ ...p, card_brand: e.target.value }))}>
                    <option value="">{t("pro_payout.select")}</option>
                    <option value="Visa">Visa</option>
                    <option value="Mastercard">Mastercard</option>
                    <option value="Elo">Elo</option>
                    <option value="Hipercard">Hipercard</option>
                    <option value="American Express">American Express</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">{t("pro_payout.card_last4_label")}</label>
                  <input className="form-input" value={cardForm.card_last4} placeholder="0000" maxLength={4}
                    onChange={e => setCardForm(p => ({ ...p, card_last4: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
                </div>
                <p className="text-[10px] text-slate-400">{t("pro_payout.card_tokenization_note")}</p>
              </div>
            )}

            <button onClick={handleCreate} disabled={saving}
              className="btn-primary w-full mt-6 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={16} className="animate-spin" /> {t("pro_payout.saving")}</> :
                <><CheckCircle size={16} /> {t("pro_payout.save_method")}</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PayoutMethodsPage;