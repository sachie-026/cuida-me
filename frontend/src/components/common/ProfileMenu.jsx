import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogOut, User, ChevronDown, LayoutDashboard, CreditCard, Bell, Settings,
  Calendar, MessageSquare, Star, Shield, Share2, HelpCircle, FileText, RefreshCw, Wallet, History
} from "lucide-react";
import toast from "react-hot-toast";

const ProfileMenu = () => {
  const [open, setOpen] = useState(false);
  const [showSOS, setShowSOS] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const fullName = localStorage.getItem("full_name") || "Usuário";
  const role     = localStorage.getItem("role") || "";
  const roles    = JSON.parse(localStorage.getItem("roles") || "[]");
  const hasPro   = localStorage.getItem("has_pro") === "true" || roles.some(r => ["nurse","technician","nursing_assistant","caregiver"].includes(r));
  const initials = fullName.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  const isPro    = ["nurse","technician","nursing_assistant","caregiver"].includes(role);
  const isAdmin  = role === "admin";

  const dashPath    = isAdmin ? "/admin" : isPro ? "/dashboard/professional" : "/dashboard/client";
  const profilePath = isPro ? "/profile/professional" : "/profile/client";

  const roleLabel = {
    client: "Cliente", nurse: "Enfermeiro(a)",
    technician: "Técnico de Enfermagem", nursing_assistant: "Auxiliar de Enfermagem",
    caregiver: "Cuidador(a)", admin: "Admin",
  }[role] || role;

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    toast.success("Logout realizado!");
    navigate("/");
  };

  const go = (path) => { navigate(path); setOpen(false); };

  // Menu sections based on role
  const clientSections = [
    { label: "MINHA CONTA", items: [
      { icon: <User size={15}/>, text: "Meu perfil", path: "/profile/client" },
      { icon: <History size={15}/>, text: "Minha atividade", path: "/activity" },
      { icon: <MessageSquare size={15}/>, text: "Mensagens", path: "/messages" },
    ]},
    { label: "PAGAMENTOS", items: [
      { icon: <CreditCard size={15}/>, text: "Métodos de pagamento", path: "/payment-methods" },
    ]},
    { label: "COMPARTILHAR", items: [
      { icon: <Share2 size={15}/>, text: "Convidar amigos", path: "/invite" },
    ]},
    { label: "CONFIGURAÇÕES", items: [
      { icon: <Bell size={15}/>, text: "Notificações", path: "/settings" },
      { icon: <HelpCircle size={15}/>, text: "Central de ajuda", path: "/help" },
      { icon: <FileText size={15}/>, text: "Termos e privacidade", path: "/terms" },
      { icon: <Shield size={15}/>, text: "SOS — Emergência", action: "sos" },
    ]},
  ];

  const proSections = [
    { label: "MINHA CONTA", items: [
      { icon: <User size={15}/>, text: "Meu perfil", path: "/profile/professional" },
      { icon: <Calendar size={15}/>, text: "Minha agenda", path: "/availability" },
      { icon: <LayoutDashboard size={15}/>, text: "Meus atendimentos", path: "/dashboard/professional" },
      { icon: <MessageSquare size={15}/>, text: "Mensagens", path: "/messages" },
    ]},
    { label: "GANHOS", items: [
      { icon: <Wallet size={15}/>, text: "Ganhos", path: "/earnings" },
      { icon: <CreditCard size={15}/>, text: "Conta bancária", path: "/bank-account" },
    ]},
    { label: "PERFIL PROFISSIONAL", items: [
      { icon: <Star size={15}/>, text: "Avaliações", path: "/reviews" },
      { icon: <Shield size={15}/>, text: "Verificação profissional", path: "/profile/professional" },
    ]},
    { label: "COMPARTILHAR", items: [
      { icon: <Share2 size={15}/>, text: "Convidar amigos", path: "/invite" },
    ]},
    { label: "CONFIGURAÇÕES", items: [
      { icon: <Bell size={15}/>, text: "Notificações", path: "/settings" },
      { icon: <HelpCircle size={15}/>, text: "Central de ajuda", path: "/help" },
      { icon: <FileText size={15}/>, text: "Termos e privacidade", path: "/terms" },
      { icon: <Shield size={15}/>, text: "SOS — Emergência", action: "sos" },
    ]},
  ];

  const sections = isAdmin ? [{ label: "ADMIN", items: [
    { icon: <LayoutDashboard size={15}/>, text: "Painel Admin", path: "/admin" },
  ]}] : isPro ? proSections : clientSections;

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors">
        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
          {initials}
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-sm font-semibold text-navy leading-tight">{fullName.split(" ")[0]}</p>
          <p className="text-[10px] text-slate-400">{roleLabel}</p>
        </div>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50 max-h-[80vh] overflow-y-auto">
          {/* User info header — 45f: Active side + category indicator */}
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-bold text-navy">{fullName}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                isPro ? "bg-blue-100 text-blue-700" : isAdmin ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"
              }`}>{isPro ? "Profissional" : isAdmin ? "Admin" : "Cliente"}</span>
              <span className="text-xs text-slate-500">{roleLabel}</span>
            </div>
          </div>

          {/* Dashboard link */}
          <button onClick={() => go(dashPath)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
            <LayoutDashboard size={15} className="text-slate-400" /> Dashboard
          </button>

          {/* Sections */}
          {sections.map((section, si) => (
            <div key={si}>
              <div className="px-4 pt-3 pb-1">
                <p className="text-[10px] font-bold text-slate-400 tracking-wider">{section.label}</p>
              </div>
              {section.items.map((item, ii) => (
                <button key={ii} onClick={() => item.action === "sos" ? setShowSOS(true) : go(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                    item.action === "sos" ? "text-red-500 hover:bg-red-50" : "text-slate-600 hover:bg-slate-50"}`}>
                  <span className={item.action === "sos" ? "text-red-400" : "text-slate-400"}>{item.icon}</span> {item.text}
                </button>
              ))}
            </div>
          ))}

          {/* 45e: Contextual role/category actions */}
          <div className="border-t border-slate-100 mt-1 pt-1">
            {/* Client with no pro profile → become professional */}
            {role === "client" && !hasPro && (
              <button onClick={() => { navigate("/register/professional"); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors">
                <RefreshCw size={15} /> Quero ser Profissional
              </button>
            )}

            {/* Client with existing pro profile → switch to professional */}
            {role === "client" && hasPro && (
              <button onClick={() => {
                const proRole = roles.find(r => ["nurse","technician","nursing_assistant","caregiver"].includes(r)) || "nurse";
                localStorage.setItem("role", proRole);
                toast.success("Modo alterado para Profissional");
                navigate("/dashboard/professional");
                setOpen(false);
              }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors">
                <RefreshCw size={15} /> Mudar para Profissional
              </button>
            )}

            {/* Professional → switch to client mode */}
            {isPro && (
              <button onClick={() => {
                localStorage.setItem("role", "client");
                toast.success("Modo alterado para Cliente");
                navigate("/dashboard/client");
                setOpen(false);
              }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors">
                <RefreshCw size={15} /> Mudar para Cliente
              </button>
            )}

            {/* Professional → manage categories */}
            {isPro && (
              <button onClick={() => { navigate("/profile/professional#categories"); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-green-600 hover:bg-green-50 transition-colors">
                <RefreshCw size={15} /> Gerenciar categorias
              </button>
            )}
          </div>

          {/* Logout */}
          <div className="border-t border-slate-100 mt-1 pt-1">
            <button onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
              <LogOut size={15} /> Sair
            </button>
          </div>
        </div>
      )}

      {/* SOS Emergency Modal */}
      {showSOS && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowSOS(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-navy text-lg flex items-center gap-2"><Shield size={20} className="text-red-500"/> Assistência de Emergência</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">Se esta é uma emergência com risco de vida, entre em contato imediatamente.</p>
            <div className="space-y-2 mb-4">
              {[{n:"192",l:"SAMU",e:"🚑"},{n:"193",l:"Bombeiros",e:"🚒"},{n:"190",l:"Polícia Militar",e:"👮"}].map(e=>(
                <a key={e.n} href={`tel:${e.n}`} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-red-300 hover:bg-red-50 transition-colors">
                  <span className="flex items-center gap-3"><span className="text-xl">{e.e}</span><span className="text-sm font-semibold text-navy">{e.l} — {e.n}</span></span>
                </a>
              ))}
            </div>
            <button onClick={() => setShowSOS(false)} className="btn-outline w-full">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileMenu;