import { useEffect, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Users, CalendarDays, DollarSign, ShieldCheck, Menu, X, LogOut, CheckCircle, XCircle, Ban } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const useAdmin = () => {
  const token = localStorage.getItem("token");
  return { headers: { Authorization: `Bearer ${token}` } };
};

// ── Sidebar ──
const Sidebar = ({ active, onNav, mobileOpen, setMobileOpen }) => {
  const navigate = useNavigate();
  const links = [
    { key: "overview",      label: "Visão geral",     icon: <DollarSign size={18} /> },
    { key: "professionals", label: "Profissionais",   icon: <ShieldCheck size={18} /> },
    { key: "users",         label: "Usuários",        icon: <Users size={18} /> },
    { key: "bookings",      label: "Agendamentos",    icon: <CalendarDays size={18} /> },
    { key: "commission",    label: "Comissão",        icon: <DollarSign size={18} /> },
  ];

  const handleLogout = () => {
    localStorage.clear();
    toast.success("Até logo!");
    navigate("/login");
  };

  const content = (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-slate-100">
        <Logo size="sm" />
        <span className="text-xs font-semibold text-slate-400 mt-1 block">Admin Panel</span>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {links.map(l => (
          <button key={l.key} onClick={() => { onNav(l.key); setMobileOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
              ${active === l.key ? "bg-blue-500 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            {l.icon} {l.label}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-100">
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
          <LogOut size={18} /> Sair
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex w-56 flex-col bg-white border-r border-slate-100 h-screen sticky top-0">
        {content}
      </aside>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-56 bg-white shadow-xl">{content}</aside>
        </div>
      )}
    </>
  );
};

// ── Overview ──
const Overview = () => {
  const { headers } = useAdmin();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    axios.get(`${API}/api/admin/stats`, { headers }).then(r => setStats(r.data)).catch(() => {});
  }, []);

  const cards = stats ? [
    { label: "Total usuários",     value: stats.total_users,         icon: <Users size={20} className="text-blue-500" />,    bg: "bg-blue-100" },
    { label: "Clientes",           value: stats.total_clients,       icon: <Users size={20} className="text-green-500" />,   bg: "bg-green-100" },
    { label: "Profissionais",      value: stats.total_professionals, icon: <ShieldCheck size={20} className="text-blue-500" />, bg: "bg-blue-100" },
    { label: "Aguardando aprovação",value: stats.pending_approvals,  icon: <ShieldCheck size={20} className="text-amber-500" />, bg: "bg-amber-100" },
    { label: "Agendamentos",       value: stats.total_bookings,      icon: <CalendarDays size={20} className="text-blue-500" />, bg: "bg-blue-100" },
    { label: "Receita (comissão)", value: `R$${Number(stats.total_revenue).toFixed(2)}`, icon: <DollarSign size={20} className="text-green-500" />, bg: "bg-green-100" },
  ] : [];

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-navy mb-6">Visão geral</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c, i) => (
          <div key={i} className="card p-5">
            <div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center mb-3`}>{c.icon}</div>
            <p className="text-xs text-slate-500 mb-1">{c.label}</p>
            <p className="font-display text-2xl font-bold text-navy">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Professionals ──
const ProfessionalsPanel = () => {
  const { headers } = useAdmin();
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState("pending");

  useEffect(() => {
    axios.get(`${API}/api/admin/professionals?status=${filter}`, { headers })
      .then(r => setList(r.data)).catch(() => {});
  }, [filter]);

  const approve = async (id) => {
    await axios.patch(`${API}/api/admin/professionals/${id}/approve`, {}, { headers });
    setList(prev => prev.filter(p => p.id !== id));
    toast.success("Profissional aprovado!");
  };

  const reject = async (id) => {
    await axios.patch(`${API}/api/admin/professionals/${id}/reject`, {}, { headers });
    setList(prev => prev.filter(p => p.id !== id));
    toast("Profissional rejeitado.", { icon: "❌" });
  };

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-navy mb-4">Profissionais</h2>
      <div className="flex gap-2 mb-5">
        {["pending","approved","rejected"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors
              ${filter === s ? "bg-blue-500 text-white border-blue-500" : "border-slate-200 text-slate-600 hover:border-blue-400"}`}>
            {s === "pending" ? "Pendentes" : s === "approved" ? "Aprovados" : "Rejeitados"}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">Nenhum profissional nesta categoria.</p>
      ) : (
        <div className="space-y-3">
          {list.map(p => (
            <div key={p.id} className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-navy text-sm">{p.council_type} {p.council_number}-{p.council_state}</p>
                <p className="text-xs text-slate-500">{p.city} · {p.specialties?.join(", ")}</p>
                <p className="text-xs text-slate-400 mt-0.5">⭐ {p.rating_avg} · {p.rating_count} avaliações</p>
              </div>
              {filter === "pending" && (
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => approve(p.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-200 transition-colors">
                    <CheckCircle size={14} /> Aprovar
                  </button>
                  <button onClick={() => reject(p.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-200 transition-colors">
                    <XCircle size={14} /> Rejeitar
                  </button>
                </div>
              )}
              {filter !== "pending" && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full
                  ${filter === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                  {filter === "approved" ? "Aprovado" : "Rejeitado"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Users ──
const UsersPanel = () => {
  const { headers } = useAdmin();
  const [users, setUsers] = useState([]);

  useEffect(() => {
    axios.get(`${API}/api/admin/users`, { headers }).then(r => setUsers(r.data)).catch(() => {});
  }, []);

  const toggleBlock = async (userId, isActive) => {
    await axios.patch(`${API}/api/admin/users/${userId}/block`, {}, { headers });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !isActive } : u));
    toast(isActive ? "Usuário bloqueado." : "Usuário desbloqueado.", { icon: isActive ? "🔒" : "🔓" });
  };

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-navy mb-4">Usuários</h2>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["Nome","E-mail","Papel","Verificado","Status","Ação"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-navy">{u.full_name}</td>
                  <td className="px-4 py-3 text-slate-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                      ${u.role === "client" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{u.is_verified ? "✅" : "⏳"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                      ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      {u.is_active ? "Ativo" : "Bloqueado"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleBlock(u.id, u.is_active)}
                      className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors
                        ${u.is_active ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-green-50 text-green-600 hover:bg-green-100"}`}>
                      <Ban size={12} /> {u.is_active ? "Bloquear" : "Desbloquear"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── Bookings ──
const BookingsPanel = () => {
  const { headers } = useAdmin();
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const url = filter ? `${API}/api/admin/bookings?status=${filter}` : `${API}/api/admin/bookings`;
    axios.get(url, { headers }).then(r => setBookings(r.data)).catch(() => {});
  }, [filter]);

  const statusColor = { accepted:"bg-green-100 text-green-700", completed:"bg-slate-100 text-slate-600",
    pending:"bg-amber-100 text-amber-700", cancelled:"bg-red-100 text-red-600", checked_in:"bg-blue-100 text-blue-700" };

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-navy mb-4">Agendamentos</h2>
      <div className="flex flex-wrap gap-2 mb-5">
        {[["","Todos"],["pending","Pendentes"],["accepted","Confirmados"],["completed","Concluídos"],["cancelled","Cancelados"]].map(([v,l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors
              ${filter === v ? "bg-blue-500 text-white border-blue-500" : "border-slate-200 text-slate-600 hover:border-blue-400"}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["Serviço","Data","Total","Comissão","Status"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.map(b => (
                <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-navy">{b.service_type}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(b.scheduled_start).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3 font-semibold text-navy">R${b.total_price?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-green-600 font-semibold">R${b.platform_fee?.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor[b.status]}`}>
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── Commission ──
const CommissionPanel = () => {
  const { headers } = useAdmin();
  const [rate, setRate] = useState(12);
  const [input, setInput] = useState("12");

  useEffect(() => {
    axios.get(`${API}/api/admin/commission`, { headers })
      .then(r => { setRate(r.data.rate); setInput(String(r.data.rate)); }).catch(() => {});
  }, []);

  const save = async () => {
    const val = parseFloat(input);
    if (isNaN(val) || val <= 0 || val >= 100) { toast.error("Taxa inválida (deve ser entre 0 e 100)."); return; }
    await axios.put(`${API}/api/admin/commission?rate=${val}`, {}, { headers });
    setRate(val);
    toast.success(`Taxa atualizada para ${val}%`);
  };

  return (
    <div className="max-w-md">
      <h2 className="font-display text-xl font-bold text-navy mb-6">Configuração de comissão</h2>
      <div className="card p-6">
        <p className="text-sm text-slate-500 mb-5">
          A comissão é descontada automaticamente de cada pagamento. O profissional recebe o valor líquido.
        </p>
        <div className="mb-5">
          <label className="form-label">Taxa da plataforma (%)</label>
          <div className="flex gap-3">
            <input className="form-input" type="number" min="1" max="99" value={input}
              onChange={e => setInput(e.target.value)} />
            <button onClick={save} className="btn-primary flex-shrink-0">Salvar</button>
          </div>
        </div>
        <div className="bg-slate-50 rounded-xl p-4 text-sm">
          <p className="font-semibold text-navy mb-2">Exemplo com taxa atual de {rate}%:</p>
          <p className="text-slate-600">Serviço de <strong>R$200</strong></p>
          <p className="text-green-600">→ Cuida.me recebe: <strong>R${(200 * rate / 100).toFixed(2)}</strong></p>
          <p className="text-blue-600">→ Profissional recebe: <strong>R${(200 * (1 - rate / 100)).toFixed(2)}</strong></p>
        </div>
      </div>
    </div>
  );
};

// ── Main Admin Dashboard ──
const AdminDashboard = () => {
  const [section, setSection] = useState("overview");
  const [mobileOpen, setMobileOpen] = useState(false);

  const panels = { overview: <Overview />, professionals: <ProfessionalsPanel />,
    users: <UsersPanel />, bookings: <BookingsPanel />, commission: <CommissionPanel /> };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar active={section} onNav={setSection} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="md:hidden p-2 rounded-lg hover:bg-slate-100">
              <Menu size={20} />
            </button>
            <h1 className="font-semibold text-navy text-sm capitalize">
              {section === "overview" ? "Visão geral" : section === "professionals" ? "Profissionais" :
               section === "users" ? "Usuários" : section === "bookings" ? "Agendamentos" : "Comissão"}
            </h1>
          </div>
          <LanguageSwitcher />
        </header>
        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {panels[section]}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;