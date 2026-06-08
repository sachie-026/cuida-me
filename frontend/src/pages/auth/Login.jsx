import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GoogleLogin } from "@react-oauth/google";
import { Link } from "react-router-dom";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";

const Login = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const quickLogin = (role) => {
    if (role === "client") {
      setEmail("admin@cuida.me");
      setPassword("admin123");
    } else {
      setEmail("enfermeira@cuida.me");
      setPassword("pro123");
    }
  };

  return (
    <div className="min-h-screen bg-hero-gradient flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <Link to="/"><Logo size="md" /></Link>
          <LanguageSwitcher />
        </div>

        <div className="card p-8">
          <h1 className="font-display text-2xl font-bold text-navy mb-1">
            {t("nav.login")}
          </h1>
          <p className="text-slate-500 text-sm mb-6">
            Acesse sua conta Cuida.me
          </p>

          {/* Dev quick login */}
          <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-semibold text-amber-700 mb-2">🛠 Dev — Quick login</p>
            <div className="flex gap-2">
              <button
                onClick={() => quickLogin("client")}
                className="flex-1 text-xs py-2 px-2 rounded-lg bg-blue-100 text-blue-700 font-semibold hover:bg-blue-200 transition-colors"
              >
                👤 Client
              </button>
              <button
                onClick={() => quickLogin("pro")}
                className="flex-1 text-xs py-2 px-2 rounded-lg bg-green-100 text-green-700 font-semibold hover:bg-green-200 transition-colors"
              >
                👩‍⚕️ Professional
              </button>
            </div>
          </div>

          {/* Google */}
          <div className="flex justify-center mb-5">
            <GoogleLogin
              onSuccess={(cred) => console.log("Login:", cred)}
              onError={() => console.log("Login failed")}
              width="100%"
              shape="rectangular"
              size="large"
            />
          </div>

          <div className="flex items-center gap-3 my-5">
            <hr className="flex-1 border-slate-200" />
            <span className="text-xs text-slate-400 font-medium">ou</span>
            <hr className="flex-1 border-slate-200" />
          </div>

          {/* Email login */}
          <div className="mb-4">
            <label className="form-label">E-mail</label>
            <input
              className="form-input"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="mb-6">
            <label className="form-label">Senha</label>
            <input
              className="form-input"
              type="password"
              placeholder="Sua senha"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <button className="btn-primary w-full mb-4">Entrar</button>

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