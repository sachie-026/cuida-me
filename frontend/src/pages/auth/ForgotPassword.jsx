import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import axios from "axios";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const ForgotPassword = () => {
  const [email,     setEmail]     = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  const handleSubmit = async () => {
    if (!email) { setError("Informe seu e-mail."); return; }
    setLoading(true); setError("");
    try {
      await axios.post(`${API}/api/auth/forgot-password`, { email });
      setSubmitted(true);
    } catch {
      setError("Erro ao processar solicitação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-hero-gradient flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-3">
          <Link to="/"><Logo size="md" /></Link>
          <LanguageSwitcher />
        </div>
        <div className="mb-6">
          <Link to="/login" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-500 transition-colors">
            <ArrowLeft size={15} /> Voltar ao login
          </Link>
        </div>

        <div className="card p-8">
          {submitted ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📧</span>
              </div>
              <h2 className="font-display text-xl font-bold text-navy mb-2">Verifique seu e-mail</h2>
              <p className="text-slate-500 text-sm mb-4">
                Se <strong>{email}</strong> estiver cadastrado, você receberá um link para redefinir sua senha em breve.
              </p>
              <p className="text-xs text-slate-400">Não recebeu? Verifique a pasta de spam ou tente novamente.</p>
              <button onClick={() => setSubmitted(false)} className="btn-outline mt-4 text-sm">
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold text-navy mb-1">Esqueci minha senha</h1>
              <p className="text-slate-500 text-sm mb-6">
                Informe seu e-mail e enviaremos um link para redefinir sua senha.
              </p>
              <div className="mb-2">
                <label className="form-label">E-mail</label>
                <input
                  className="form-input" type="email" placeholder="seu@email.com"
                  value={email} onChange={e => { setError(""); setEmail(e.target.value); }}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                />
              </div>
              {error && (
                <div className="p-3 my-3 bg-red-50 border border-red-200 rounded-xl">
                  <span className="text-red-500 text-xs font-medium">{error}</span>
                </div>
              )}
              <button onClick={handleSubmit} disabled={loading}
                className="btn-primary w-full mt-4 disabled:opacity-60">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Enviando...
                  </span>
                ) : "Enviar link de redefinição"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;