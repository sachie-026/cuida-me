import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GoogleLogin } from "@react-oauth/google";
import { Link, useNavigate } from "react-router-dom";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import toast from "react-hot-toast";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const RolePicker = ({ onPick }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
    <div className="absolute inset-0 bg-black/50" />
    <div className="relative bg-white rounded-2xl shadow-hover w-full max-w-sm p-6 z-10">
      <h2 className="font-display text-xl font-bold text-navy mb-2">Você é...?</h2>
      <p className="text-slate-500 text-sm mb-5">Selecione seu perfil para continuar com o Google.</p>
      <div className="flex flex-col gap-3">
        <button onClick={() => onPick("client")}
          className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all text-left">
          <p className="font-semibold text-navy">👤 Cliente / Família</p>
          <p className="text-xs text-slate-500 mt-0.5">Preciso de cuidado para mim ou um familiar</p>
        </button>
        <button onClick={() => onPick("nurse")}
          className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-green-500 hover:bg-green-50 transition-all text-left">
          <p className="font-semibold text-navy">👩‍⚕️ Profissional de saúde</p>
          <p className="text-xs text-slate-500 mt-0.5">Sou enfermeiro(a), técnico ou cuidador</p>
        </button>
      </div>
    </div>
  </div>
);

const Login = () => {
  const { t } = useTranslation();
  const navigate  = useNavigate();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [pendingCred, setPendingCred] = useState(null);

  const quickLogin = (role) => {
    if (role === "client") { setEmail("admin@cuida.me");       setPassword("admin123"); }
    else                   { setEmail("enfermeira@cuida.me");  setPassword("pro123");   }
  };

  const saveAndRedirect = (data) => {
    localStorage.setItem("token",     data.access_token);
    localStorage.setItem("role",      data.role);
    localStorage.setItem("user_id",   data.user_id);
    localStorage.setItem("full_name", data.full_name);
    toast.success(`Bem-vindo, ${data.full_name}!`);
    const isPro = ["nurse","technician","caregiver"].includes(data.role);
    navigate(isPro ? "/dashboard/professional" : "/dashboard/client");
  };

  const handleLogin = async () => {
    if (!email || !password) { toast.error("Preencha e-mail e senha."); return; }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/auth/login`, { email, password });
      saveAndRedirect(data);
    } catch {
      toast.error("E-mail ou senha incorretos.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = (cred) => {
    // Store credential and show role picker for new users
    setPendingCred(cred.credential);
  };

  const handleRolePick = async (role) => {
    setPendingCred(null);
    try {
      const { data } = await axios.post(`${API}/api/auth/google`, {
        credential: pendingCred,
        role,
      });
      saveAndRedirect(data);
    } catch {
      toast.error("Erro ao entrar com Google.");
    }
  };

  return (
    <div className="min-h-screen bg-hero-gradient flex flex-col items-center justify-center px-4 py-12">
      {pendingCred && <RolePicker onPick={handleRolePick} />}

      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-8">
          <Link to="/"><Logo size="md" /></Link>
          <LanguageSwitcher />
        </div>

        <div className="card p-8">
          <h1 className="font-display text-2xl font-bold text-navy mb-1">{t("nav.login")}</h1>
          <p className="text-slate-500 text-sm mb-6">Acesse sua conta Cuida.me</p>

          {/* Dev quick login */}
          <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-semibold text-amber-700 mb-2">🛠 Dev — Quick login</p>
            <div className="flex gap-2">
              <button onClick={() => quickLogin("client")}
                className="flex-1 text-xs py-2 px-2 rounded-lg bg-blue-100 text-blue-700 font-semibold hover:bg-blue-200 transition-colors">
                👤 Client
              </button>
              <button onClick={() => quickLogin("pro")}
                className="flex-1 text-xs py-2 px-2 rounded-lg bg-green-100 text-green-700 font-semibold hover:bg-green-200 transition-colors">
                👩‍⚕️ Professional
              </button>
            </div>
          </div>

          {/* Google */}
          <div className="flex justify-center mb-5">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => toast.error("Google login falhou.")}
              width="100%" shape="rectangular" size="large"
            />
          </div>

          <div className="flex items-center gap-3 my-5">
            <hr className="flex-1 border-slate-200" />
            <span className="text-xs text-slate-400 font-medium">ou</span>
            <hr className="flex-1 border-slate-200" />
          </div>

          <div className="mb-4">
            <label className="form-label">E-mail</label>
            <input className="form-input" type="email" placeholder="seu@email.com"
              value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>
          <div className="mb-6">
            <label className="form-label">Senha</label>
            <input className="form-input" type="password" placeholder="Sua senha"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>

          <button onClick={handleLogin} disabled={loading}
            className="btn-primary w-full mb-4 disabled:opacity-60">
            {loading ? "Entrando..." : "Entrar"}
          </button>

          <p className="text-center text-xs text-slate-500">
            Não tem conta?{" "}
            <Link to="/#register" className="text-blue-500 font-semibold hover:underline">
              Cadastre-se gratuitamente
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;