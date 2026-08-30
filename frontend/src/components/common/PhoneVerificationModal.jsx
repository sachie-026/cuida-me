import { useState, useRef, useEffect } from "react";
import { X, Phone, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const PhoneVerificationModal = ({ phone: initialPhone, onClose, onVerified }) => {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [step, setStep] = useState("phone"); // phone, code, success
  const [phone, setPhone] = useState(initialPhone || "");
  const [channel, setChannel] = useState("sms"); // sms or whatsapp
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [channelLabel, setChannelLabel] = useState("SMS");
  const inputRefs = useRef([]);

  // Resend countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleSendCode = async () => {
    if (!phone || phone.length < 10) { setError("Informe um número válido."); return; }
    setSending(true); setError("");
    try {
      const { data } = await axios.post(`${API}/api/auth/phone/send-code`, { phone, channel }, { headers });
      if (data.sent) {
        setStep("code");
        setCountdown(60);
        setChannelLabel(data.channel || "SMS");
        toast.success(data.message);
      } else {
        setError(data.error || "Falha ao enviar SMS.");
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao enviar código.");
    } finally { setSending(false); }
  };

  const handleCodeChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    // Auto-submit when all 6 digits entered
    if (newCode.every(d => d) && newCode.join("").length === 6) {
      handleVerify(newCode.join(""));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (fullCode) => {
    const codeStr = fullCode || code.join("");
    if (codeStr.length !== 6) { setError("Digite os 6 dígitos."); return; }
    setVerifying(true); setError("");
    try {
      const { data } = await axios.post(`${API}/api/auth/phone/verify-code`, { phone, code: codeStr }, { headers });
      if (data.verified) {
        setStep("success");
        toast.success("Telefone verificado!");
        setTimeout(() => { onVerified?.(); onClose?.(); }, 1500);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Código incorreto.");
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally { setVerifying(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-navy flex items-center gap-2">
            <Phone size={20} className="text-blue-500" /> Verificar telefone
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* Step 1: Enter phone number */}
        {step === "phone" && (
          <div>
            <p className="text-sm text-slate-600 mb-4">Informe seu número de celular. Enviaremos um código de 6 dígitos via SMS.</p>
            <div className="mb-4">
              <label className="form-label">Telefone</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">+55</span>
                <input type="tel" className="form-input flex-1" placeholder="(11) 99999-9999"
                  value={phone} onChange={e => setPhone(e.target.value)} maxLength={15} autoFocus />
              </div>
            </div>
            {/* 10.2-4: Channel selection */}
            <div className="mb-4">
              <label className="form-label">Enviar código via</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setChannel("sms")}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                    channel === "sms" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                  📱 SMS
                </button>
                <button type="button" onClick={() => setChannel("whatsapp")}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                    channel === "whatsapp" ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                  💬 WhatsApp
                </button>
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg mb-3">
                <AlertCircle size={13} className="text-red-500" />
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}
            <button onClick={handleSendCode} disabled={sending || !phone}
              className="btn-primary w-full disabled:opacity-50">
              {sending ? "Enviando..." : "Enviar código SMS"}
            </button>
          </div>
        )}

        {/* Step 2: Enter verification code */}
        {step === "code" && (
          <div>
            <p className="text-sm text-slate-600 mb-1">Código enviado via <strong>{channelLabel}</strong> para <strong>{phone}</strong></p>
            <p className="text-xs text-slate-400 mb-4">Digite os 6 dígitos recebidos por SMS.</p>

            <div className="flex justify-center gap-2 mb-4">
              {code.map((digit, i) => (
                <input key={i} ref={el => inputRefs.current[i] = el}
                  type="text" inputMode="numeric" maxLength={1}
                  value={digit} onChange={e => handleCodeChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  className={`w-11 h-13 text-center text-xl font-bold border-2 rounded-xl focus:outline-none transition-colors ${
                    digit ? "border-blue-400 bg-blue-50 text-navy" : "border-slate-200 text-slate-400"
                  }`}
                  autoFocus={i === 0} />
              ))}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg mb-3">
                <AlertCircle size={13} className="text-red-500" />
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <button onClick={() => handleVerify()} disabled={verifying || code.join("").length !== 6}
              className="btn-primary w-full mb-3 disabled:opacity-50">
              {verifying ? "Verificando..." : "Verificar código"}
            </button>

            <div className="text-center">
              {countdown > 0 ? (
                <p className="text-xs text-slate-400">Reenviar em {countdown}s</p>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => { setChannel("sms"); handleSendCode(); }} disabled={sending}
                    className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1">
                    <RefreshCw size={11} /> Reenviar via SMS
                  </button>
                  <button onClick={() => { setChannel("whatsapp"); handleSendCode(); }} disabled={sending}
                    className="text-xs text-green-600 hover:underline font-medium flex items-center gap-1">
                    💬 Receber via WhatsApp
                  </button>
                </div>
              )}
              <button onClick={() => { setStep("phone"); setCode(["","","","","",""]); setError(""); }}
                className="text-xs text-slate-400 hover:underline mt-2 block mx-auto">Alterar número</button>
            </div>
          </div>
        )}

        {/* Step 3: Success */}
        {step === "success" && (
          <div className="text-center py-4">
            <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
            <p className="text-lg font-bold text-navy mb-1">Telefone verificado!</p>
            <p className="text-sm text-slate-500">{phone}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PhoneVerificationModal;