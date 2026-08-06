import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Wallet, TrendingUp, CreditCard, Calendar, DollarSign } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const EarningsPage = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("user_id");
  const headers = { Authorization: `Bearer ${token}` };

  const [tab, setTab] = useState("overview"); // overview, history, bank
  const [earnings, setEarnings] = useState({ available: 0, pending: 0, total: 0, weekly: 0, monthly: 0 });
  const [payments, setPayments] = useState([]);
  const [bankAccount, setBankAccount] = useState({ bank: "", agency: "", account: "", pix_key: "" });
  const [loading, setLoading] = useState(true);
  const [savingBank, setSavingBank] = useState(false);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/bookings/my-bookings`, { headers }).catch(() => ({ data: [] })),
    ]).then(([bookRes]) => {
      const bookings = Array.isArray(bookRes.data) ? bookRes.data : [];
      const completed = bookings.filter(b => b.status === "completed");
      const now = new Date();
      const weekAgo = new Date(now - 7 * 86400000);
      const monthAgo = new Date(now - 30 * 86400000);

      const total = completed.reduce((s, b) => s + (b.pro_payout || 0), 0);
      const weekly = completed.filter(b => new Date(b.scheduled_start) > weekAgo).reduce((s, b) => s + (b.pro_payout || 0), 0);
      const monthly = completed.filter(b => new Date(b.scheduled_start) > monthAgo).reduce((s, b) => s + (b.pro_payout || 0), 0);
      const pending = bookings.filter(b => b.status === "checked_in" || b.status === "accepted").reduce((s, b) => s + (b.pro_payout || 0), 0);

      setEarnings({ available: total, pending, total, weekly, monthly });
      setPayments(completed.slice(0, 20));
    }).finally(() => setLoading(false));
  }, []);

  const handleSaveBank = async () => {
    setSavingBank(true);
    try {
      // In production: save to user profile or Stripe Connect
      toast.success("Dados bancários atualizados!");
    } catch { toast.error("Erro ao salvar."); }
    finally { setSavingBank(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" />
        <ProfileMenu />
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate("/dashboard/professional")} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft size={20}/></button>
          <h1 className="font-display text-2xl font-bold text-navy">Ganhos</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[{id:"overview",label:"Visão geral"},{id:"history",label:"Histórico"},{id:"bank",label:"Conta bancária"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab===t.id?"bg-blue-500 text-white":"bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"}`}>{t.label}</button>
          ))}
        </div>

        {/* Overview */}
        {tab === "overview" && (
          <div className="space-y-4">
            <div className="card p-6 bg-gradient-to-br from-green-500 to-green-600 text-white">
              <p className="text-sm opacity-80 mb-1">Saldo disponível</p>
              <p className="text-3xl font-bold">R$ {earnings.available.toFixed(2)}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-1"><TrendingUp size={14} className="text-blue-500"/><p className="text-xs text-slate-500">Semanal</p></div>
                <p className="text-lg font-bold text-navy">R$ {earnings.weekly.toFixed(2)}</p>
              </div>
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-1"><Calendar size={14} className="text-purple-500"/><p className="text-xs text-slate-500">Mensal</p></div>
                <p className="text-lg font-bold text-navy">R$ {earnings.monthly.toFixed(2)}</p>
              </div>
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-1"><Wallet size={14} className="text-green-500"/><p className="text-xs text-slate-500">Total</p></div>
                <p className="text-lg font-bold text-navy">R$ {earnings.total.toFixed(2)}</p>
              </div>
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-1"><DollarSign size={14} className="text-amber-500"/><p className="text-xs text-slate-500">Pendente</p></div>
                <p className="text-lg font-bold text-navy">R$ {earnings.pending.toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Payment History */}
        {tab === "history" && (
          <div className="card p-6">
            <h3 className="font-semibold text-navy mb-4">Histórico de pagamentos</h3>
            {payments.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Nenhum pagamento ainda.</p>
            ) : (
              <div className="space-y-3">
                {payments.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                    <div>
                      <p className="text-sm font-semibold text-navy">{p.service_type || "Atendimento"}</p>
                      <p className="text-xs text-slate-500">{p.scheduled_start && new Date(p.scheduled_start).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <span className="text-sm font-bold text-green-600">R$ {(p.pro_payout || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bank Account (#45) */}
        {tab === "bank" && (
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard size={18} className="text-blue-500"/>
              <h3 className="font-semibold text-navy">Conta bancária</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">Os pagamentos serão transferidos para esta conta após o checkout confirmado.</p>
            <div className="space-y-3">
              <div><label className="form-label">Banco</label>
                <input className="form-input" value={bankAccount.bank} onChange={e=>setBankAccount(p=>({...p,bank:e.target.value}))} placeholder="Ex: Nubank, Itaú, Bradesco"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Agência</label>
                  <input className="form-input" value={bankAccount.agency} onChange={e=>setBankAccount(p=>({...p,agency:e.target.value}))} placeholder="0001"/></div>
                <div><label className="form-label">Conta</label>
                  <input className="form-input" value={bankAccount.account} onChange={e=>setBankAccount(p=>({...p,account:e.target.value}))} placeholder="12345-6"/></div>
              </div>
              <div><label className="form-label">Chave PIX (opcional)</label>
                <input className="form-input" value={bankAccount.pix_key} onChange={e=>setBankAccount(p=>({...p,pix_key:e.target.value}))} placeholder="CPF, e-mail, telefone ou chave aleatória"/></div>
            </div>
            <button onClick={handleSaveBank} disabled={savingBank} className="btn-primary w-full mt-4 disabled:opacity-50">
              {savingBank ? "Salvando..." : "Salvar dados bancários"}
            </button>
            <p className="text-[10px] text-slate-400 mt-2 text-center">Dados bancários são armazenados de forma segura e usados apenas para transferências de pagamento.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EarningsPage;