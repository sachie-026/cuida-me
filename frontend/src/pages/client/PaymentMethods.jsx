import { useState } from "react";
import { ChevronLeft, CreditCard, Plus, Trash2, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import ProfileMenu from "../../components/common/ProfileMenu";

const PaymentMethodsPage = () => {
  const navigate = useNavigate();
  const [methods, setMethods] = useState([
    // In production: fetch from Stripe Customer
  ]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", number: "", expiry: "", cvv: "" });

  const handleAdd = () => {
    if (!form.name || !form.number) { toast.error("Preencha os dados do cartão."); return; }
    const last4 = form.number.replace(/\s/g, "").slice(-4);
    setMethods(prev => [...prev, { id: `card_${Date.now()}`, brand: "Visa", last4, isDefault: prev.length === 0 }]);
    setForm({ name: "", number: "", expiry: "", cvv: "" });
    setAdding(false);
    toast.success("Cartão adicionado! (modo desenvolvimento)");
  };

  const handleRemove = (id) => {
    setMethods(prev => prev.filter(m => m.id !== id));
    toast.success("Cartão removido.");
  };

  const setDefault = (id) => {
    setMethods(prev => prev.map(m => ({ ...m, isDefault: m.id === id })));
    toast.success("Cartão padrão atualizado.");
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

        {methods.length === 0 && !adding && (
          <div className="card p-8 text-center">
            <CreditCard size={40} className="mx-auto mb-3 text-slate-300"/>
            <p className="text-sm text-slate-500 mb-4">Nenhum método de pagamento cadastrado.</p>
            <button onClick={() => setAdding(true)} className="btn-primary"><Plus size={14}/> Adicionar cartão</button>
          </div>
        )}

        {methods.length > 0 && (
          <div className="space-y-3 mb-4">
            {methods.map(m => (
              <div key={m.id} className="card p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard size={20} className="text-blue-500"/>
                  <div>
                    <p className="text-sm font-semibold text-navy">{m.brand} •••• {m.last4}</p>
                    {m.isDefault && <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle size={10}/> Padrão</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {!m.isDefault && <button onClick={() => setDefault(m.id)} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold">Tornar padrão</button>}
                  <button onClick={() => handleRemove(m.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 size={14}/></button>
                </div>
              </div>
            ))}
            {!adding && <button onClick={() => setAdding(true)} className="btn-outline w-full flex items-center justify-center gap-2"><Plus size={14}/> Adicionar cartão</button>}
          </div>
        )}

        {adding && (
          <div className="card p-5 space-y-3">
            <p className="text-sm font-semibold text-navy">Novo cartão</p>
            <input className="form-input text-sm" placeholder="Nome no cartão" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
            <input className="form-input text-sm" placeholder="Número do cartão" value={form.number} maxLength={19} onChange={e=>setForm(p=>({...p,number:e.target.value.replace(/\D/g,"").replace(/(\d{4})/g,"$1 ").trim()}))}/>
            <div className="grid grid-cols-2 gap-3">
              <input className="form-input text-sm" placeholder="MM/AA" value={form.expiry} maxLength={5} onChange={e=>setForm(p=>({...p,expiry:e.target.value.replace(/\D/g,"").replace(/(\d{2})(\d)/,"$1/$2")}))}/>
              <input className="form-input text-sm" placeholder="CVV" value={form.cvv} maxLength={4} type="password" onChange={e=>setForm(p=>({...p,cvv:e.target.value.replace(/\D/g,"")}))}/>
            </div>
            <p className="text-[10px] text-slate-400">Dados processados via Stripe. A CuidaU nunca armazena dados do cartão.</p>
            <div className="flex gap-2">
              <button onClick={() => setAdding(false)} className="btn-outline flex-1">Cancelar</button>
              <button onClick={handleAdd} className="btn-primary flex-1">Adicionar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentMethodsPage;