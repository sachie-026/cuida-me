import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GoogleLogin } from "@react-oauth/google";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import FullScreenLoader from "../../components/common/FullScreenLoader";
import toast from "react-hot-toast";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const ROLE_HOME = {
  client:     "/dashboard/client",
  nurse:             "/dashboard/professional",
  technician:        "/dashboard/professional",
  nursing_assistant: "/dashboard/professional",
  caregiver:         "/dashboard/professional",
  admin:      "/admin",
};

const RolePicker = ({ onPick }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
    <div className="absolute inset-0 bg-black/50" />
    <div className="relative bg-white rounded-2xl shadow-hover w-full max-w-sm p-6 z-10">
      <h2 className="font-display text-xl font-bold text-navy mb-2">Você é...?</h2>
      <p className="text-slate-500 text-sm mb-5">Primeira vez? Selecione seu perfil para continuar.</p>
      <div className="flex flex-col gap-3">
        <button onClick={() => onPick("client")}
          className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all text-left">
          <p className="font-semibold text-navy">👤 Cliente / Família</p>
          <p className="text-xs text-slate-500 mt-0.5">Preciso de cuidado para mim ou um familiar</p>
        </button>
        <button onClick={() => onPick("nurse")}
          className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-green-500 hover:bg-green-50 transition-all text-left">
          <p className="font-semibold text-navy">👩‍⚕️ Profissional de saúde</p>
          <p className="text-xs text-slate-500 mt-0.5">Sou enfermeiro(a), técnico(a), auxiliar ou cuidador(a)</p>
        </button>
      </div>
    </div>
  </div>
);

const Login = () => {
  const { t }   = useTranslation();
  const navigate = useNavigate();
  const [email,         setEmail]         = useState("");
  const [password,      setPassword]      = useState("");
  const [loading,       setLoading]       = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [pendingCred,   setPendingCred]   = useState(null);
  const [error,         setError]         = useState("");

  const saveAndRedirect = (data) => {
    localStorage.setItem("token",     data.access_token);
    localStorage.setItem("role",      data.role);
    localStorage.setItem("user_id",   data.user_id);
    localStorage.setItem("full_name", data.full_name);
    localStorage.setItem("email",     data.email || "");
    localStorage.setItem("roles",     JSON.stringify(data.roles || [data.role]));
    localStorage.setItem("has_pro",   String(data.has_professional_profile || false));
    const destination = ROLE_HOME[data.role] || "/dashboard/client";
    navigate(destination);
    setTimeout(() => toast.success(`Bem-vindo, ${data.full_name}!`), 100);
  };

  const handleLogin = async () => {
    if (!email || !password) { setError("Preencha e-mail e senha."); return; }
    setLoading(true); setError("");
    const t0 = performance.now();
    try {
      const { data } = await axios.post(`${API}/api/auth/login`, { email, password }, { timeout: 15000 });
      const t1 = performance.now();
      const loginMs = Math.round(t1 - t0);
      console.log(`[53e] Login API: ${loginMs}ms`);
      saveAndRedirect(data);
      const t2 = performance.now();
      console.log(`[53e] Total login→navigate: ${Math.round(t2 - t0)}ms (target: <3000ms)`);
    } catch (err) {
      const t1 = performance.now();
      console.log(`[53e] Login FAILED after ${Math.round(t1 - t0)}ms`);
      if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
        setError("Servidor demorando para responder. Tente novamente.");
      } else {
        setError("E-mail ou senha incorretos.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (cred) => {
    setGoogleLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/auth/google`, { credential: cred.credential, role: "check" });
      if (!data.is_new_user) { saveAndRedirect(data); }
      else { setGoogleLoading(false); setPendingCred(cred.credential); }
    } catch {
      setError("Erro ao entrar com Google."); setGoogleLoading(false);
    }
  };

  const handleRolePick = async (role) => {
    setPendingCred(null); setGoogleLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/auth/google`, { credential: pendingCred, role });
      saveAndRedirect(data);
    } catch {
      setError("Erro ao entrar com Google."); setGoogleLoading(false);
    }
  };

  if (googleLoading) return <FullScreenLoader message="Entrando com Google..." />;

  return (
    <div className="min-h-screen bg-hero-gradient flex flex-col items-center justify-center px-4 py-12">
      {pendingCred && <RolePicker onPick={handleRolePick} />}
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-3">
          <Link to="/"><Logo size="md" /></Link>
          <LanguageSwitcher />
        </div>
        <div className="mb-6">
          <Link to="/" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-500 transition-colors">
            <ArrowLeft size={15} /> Voltar ao início
          </Link>
        </div>
        <div className="card p-8">
          {/* Dev quick login — remove before production */}
          <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-semibold text-amber-700 mb-2">🛠 Dev — Quick login</p>
            <div className="flex gap-2">
              <button onClick={() => { setError(""); setEmail("admin@cuida.me"); setPassword("admin123"); }}
                className="flex-1 text-xs py-2 px-2 rounded-lg bg-red-100 text-red-700 font-semibold hover:bg-red-200 transition-colors">
                🔧 Admin
              </button>
              <button onClick={() => { setError(""); setEmail("cliente@cuida.me"); setPassword("client123"); }}
                className="flex-1 text-xs py-2 px-2 rounded-lg bg-blue-100 text-blue-700 font-semibold hover:bg-blue-200 transition-colors">
                👤 Client
              </button>
              <button onClick={() => { setError(""); setEmail("enfermeira@cuida.me"); setPassword("pro123"); }}
                className="flex-1 text-xs py-2 px-2 rounded-lg bg-green-100 text-green-700 font-semibold hover:bg-green-200 transition-colors">
                👩‍⚕️ Pro
              </button>
            </div>
          </div>
          <h1 className="font-display text-2xl font-bold text-navy mb-1">{t("nav.login")}</h1>
          <p className="text-slate-500 text-sm mb-6">Acesse sua conta Cuida.me</p>
          <div className="flex justify-center mb-5">
            <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setError("Google login falhou.")}
              width="100%" shape="rectangular" size="large" />
          </div>
          <div className="flex items-center gap-3 my-5">
            <hr className="flex-1 border-slate-200" />
            <span className="text-xs text-slate-400 font-medium">ou</span>
            <hr className="flex-1 border-slate-200" />
          </div>
          <div className="mb-4">
            <label className="form-label">E-mail</label>
            <input className="form-input" type="email" placeholder="seu@email.com"
              value={email} onChange={e => { setError(""); setEmail(e.target.value); }}
              onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
              <label className="form-label mb-0">Senha</label>
              <Link to="/forgot-password" className="text-xs text-blue-500 hover:underline">Esqueci minha senha</Link>
            </div>
            <input className="form-input" type="password" placeholder="Sua senha"
              value={password} onChange={e => { setError(""); setPassword(e.target.value); }}
              onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>
          {error && (
            <div className="p-3 my-3 bg-red-50 border border-red-200 rounded-xl">
              <span className="text-red-500 text-xs font-medium">{error}</span>
            </div>
          )}
          <button onClick={handleLogin} disabled={loading} className="btn-primary w-full mt-4 mb-4 disabled:opacity-60">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Entrando...
              </span>
            ) : "Entrar"}
          </button>
          <p className="text-center text-xs text-slate-500">
            Não tem conta?{" "}
            <Link to="/register" className="text-blue-500 font-semibold hover:underline">Cadastre-se gratuitamente</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;