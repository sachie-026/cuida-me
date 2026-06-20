import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import axios from "axios";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const ResetPassword = () => {
  const navigate       = useNavigate();
  const [params]       = useSearchParams();
  const token          = params.get("token");
  const [password,     setPassword]     = useState("");
  const [confirm,      setConfirm]      = useState("");
  const [showPass,     setShowPass]     = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [done,         setDone]         = useState(false);

  useEffect(() => {
    if (!token) setError("Link inválido. Solicite um novo link de redefinição.");
  }, [token]);

  const handleSubmit = async () => {
    if (!password)             { setError("Informe a nova senha."); return; }
    if (password.length < 8)   { setError("A senha deve ter no mínimo 8 caracteres."); return; }
    if (password !== confirm)  { setError("As senhas não coincidem."); return; }
    setLoading(true); setError("");
    try {
      await axios.post(`${API}/api/auth/reset-password`, {
        token, new_password: password,
      });
      setDone(true);
      toast.success("Senha alterada com sucesso!");
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao redefinir senha. O link pode ter expirado.");
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
          {done ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">✅</span>
              </div>
              <h2 className="font-display text-xl font-bold text-navy mb-2">Senha alterada!</h2>
              <p className="text-slate-500 text-sm">Redirecionando para o login...</p>
            </div>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold text-navy mb-1">Nova senha</h1>
              <p className="text-slate-500 text-sm mb-6">Escolha uma senha segura com no mínimo 8 caracteres.</p>

              <div className="mb-4">
                <label className="form-label">Nova senha</label>
                <div className="relative">
                  <input
                    className="form-input pr-10"
                    type={showPass ? "text" : "password"}
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={e => { setError(""); setPassword(e.target.value); }}
                  />
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="mb-2">
                <label className="form-label">Confirmar senha</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="Repita a nova senha"
                  value={confirm}
                  onChange={e => { setError(""); setConfirm(e.target.value); }}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                />
              </div>

              {error && (
                <div className="p-3 my-3 bg-red-50 border border-red-200 rounded-xl">
                  <span className="text-red-500 text-xs font-medium">{error}</span>
                </div>
              )}

              <button onClick={handleSubmit} disabled={loading || !token}
                className="btn-primary w-full mt-4 disabled:opacity-60">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Alterando...
                  </span>
                ) : "Alterar senha"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;