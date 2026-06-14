import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { GoogleLogin } from "@react-oauth/google";
import { Link, useNavigate } from "react-router-dom";
import { Upload, CheckCircle, X, AlertCircle } from "lucide-react";
import axios from "axios";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import FullScreenLoader from "../../components/common/FullScreenLoader";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

// TODO: Implement COREN validation via COFEN/COREN API before account approval
// TODO: Implement document upload to Cloudinary (photo ID, diploma, criminal record, selfie)
// TODO: Implement criminal background check verification
// TODO: Admin must approve professional before they can accept bookings

/* ── Helpers ── */
const decodeGoogleJWT = (credential) => {
  try {
    const base64 = credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

/* ── Shared UI ── */
const StepDots = ({ total, current }) => (
  <div className="flex justify-center gap-2 mb-6">
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} className={`h-2 rounded-full transition-all duration-300 ${
        i < current - 1 ? "w-2 bg-green-500"
        : i === current - 1 ? "w-6 bg-blue-500"
        : "w-2 bg-slate-200"
      }`} />
    ))}
  </div>
);

const InlineError = ({ message }) =>
  message ? (
    <div className="flex items-center gap-2 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
      <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
      <p className="text-xs text-red-600 font-medium">{message}</p>
    </div>
  ) : null;

// TODO: Wire to Cloudinary
const UploadZone = ({ label, note }) => (
  <div className="mb-4">
    <label className="form-label">{label}</label>
    <div className="upload-zone">
      <Upload size={20} className="mx-auto mb-2 text-slate-400" />
      <p className="text-sm font-semibold text-navy">Clique para enviar ou arraste</p>
      {note && <p className="text-xs text-slate-400 mt-1">{note}</p>}
    </div>
    <p className="text-xs text-amber-600 mt-1">⚠️ Upload de documentos em breve</p>
  </div>
);

const GoogleBanner = ({ name, email, onClear }) => (
  <div className="mb-5 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center justify-between gap-3">
    <div className="min-w-0">
      <p className="text-xs font-semibold text-green-700">✓ Google conectado</p>
      <p className="text-xs text-green-600 truncate">{name} · {email}</p>
    </div>
    <button type="button" onClick={onClear} className="flex-shrink-0 p-1 rounded-lg hover:bg-green-100 transition-colors">
      <X size={14} className="text-green-600" />
    </button>
  </div>
);

/* ─────────────────────────────────────────
   CLIENT FORM
───────────────────────────────────────── */
const ClientForm = ({ googleData, onClearGoogle }) => {
  const { t }     = useTranslation();
  const navigate  = useNavigate();
  const [step,    setStep]    = useState(1);
  const [done,    setDone]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const f = t("register.fields", { returnObjects: true });

  const [form, setForm] = useState({
    full_name: "", email: "", cpf: "", phone: "", password: "",
    patient_name: "", age: "", relation: "", diagnoses: "",
    address: "", care_type: "",
  });

  useEffect(() => {
    if (googleData) {
      setForm(p => ({
        ...p,
        full_name: googleData.name  || p.full_name,
        email:     googleData.email || p.email,
      }));
    }
  }, [googleData]);

  const set = (k) => (e) => { setError(""); setForm((p) => ({ ...p, [k]: e.target.value })); };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      let data;
      if (googleData?.credential) {
        const res = await axios.post(`${API}/api/auth/google`, { credential: googleData.credential, role: "client" });
        data = res.data;
      } else {
        const res = await axios.post(`${API}/api/auth/register`, {
          email: form.email, password: form.password,
          full_name: form.full_name, phone: form.phone, cpf: form.cpf, role: "client",
        });
        data = res.data;
      }
      localStorage.setItem("token",     data.access_token);
      localStorage.setItem("role",      data.role);
      localStorage.setItem("user_id",   data.user_id);
      localStorage.setItem("full_name", data.full_name);
      localStorage.setItem("email",     data.email || form.email);
      setDone(true);
      setTimeout(() => navigate("/dashboard/client"), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao criar conta. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (done) return (
    <div className="text-center py-8">
      <CheckCircle size={56} className="mx-auto mb-4 text-green-500" />
      <h3 className="font-display text-2xl text-navy mb-2">{t("register.success_client_title")}</h3>
      <p className="text-slate-500 text-sm">{t("register.success_client_desc")}</p>
    </div>
  );

  return (
    <div>
      <StepDots total={4} current={step} />

      {step === 1 && (
        <div>
          {googleData && <GoogleBanner name={googleData.name} email={googleData.email} onClear={onClearGoogle} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="form-label">{f.full_name} *</label>
              <input className="form-input" value={form.full_name} onChange={set("full_name")} placeholder="Seu nome completo" />
            </div>
            <div>
              <label className="form-label">{f.cpf} *</label>
              <input className="form-input" value={form.cpf} onChange={set("cpf")} placeholder="000.000.000-00" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="form-label">{f.email} *</label>
              <input
                className={`form-input ${googleData ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
                type="email" value={form.email} onChange={set("email")}
                placeholder="seu@email.com" readOnly={!!googleData}
              />
            </div>
            <div>
              <label className="form-label">{f.whatsapp} *</label>
              <input className="form-input" type="tel" value={form.phone} onChange={set("phone")} placeholder="(11) 99999-9999" />
            </div>
          </div>
          {!googleData && (
            <div className="mb-2">
              <label className="form-label">{f.password} *</label>
              <input className="form-input" type="password" value={form.password} onChange={set("password")} placeholder={f.password_placeholder} />
            </div>
          )}
          <InlineError message={error} />
          <button onClick={() => {
            if (!form.full_name)               { setError("Nome completo é obrigatório."); return; }
            if (!form.email)                   { setError("E-mail é obrigatório."); return; }
            if (!googleData && !form.password) { setError("Defina uma senha."); return; }
            if (!googleData && form.password.length < 8) { setError("A senha deve ter no mínimo 8 caracteres."); return; }
            setError(""); setStep(2);
          }} className="btn-primary w-full mt-4">{t("register.continue")} →</button>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="mb-4">
            <label className="form-label">{f.patient_name} *</label>
            <input className="form-input" value={form.patient_name} onChange={set("patient_name")} placeholder="Nome de quem receberá o cuidado" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="form-label">{f.patient_age} *</label>
              <input className="form-input" type="number" value={form.age} onChange={set("age")} placeholder="75" />
            </div>
            <div>
              <label className="form-label">{f.relation} *</label>
              <select className="form-input" value={form.relation} onChange={set("relation")}>
                <option value="">Selecione...</option>
                {["Filho(a)","Cônjuge","Próprio paciente","Outro familiar"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="form-label">{f.diagnoses}</label>
            <textarea className="form-input min-h-[80px]" value={form.diagnoses} onChange={set("diagnoses")} placeholder="Ex: Diabetes, hipertensão, acamado..." />
          </div>
          <div className="mb-2">
            <label className="form-label">{f.address} *</label>
            <input className="form-input" value={form.address} onChange={set("address")} placeholder="Rua, número, bairro, cidade" />
          </div>
          <InlineError message={error} />
          <div className="flex gap-3 mt-4">
            <button onClick={() => { setError(""); setStep(1); }} className="btn-outline flex-1">← {t("register.back")}</button>
            <button onClick={() => {
              if (!form.patient_name) { setError("Nome do paciente é obrigatório."); return; }
              if (!form.address)      { setError("Endereço é obrigatório."); return; }
              setError(""); setStep(3);
            }} className="btn-primary flex-1">{t("register.continue")} →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div className="mb-4">
            <label className="form-label">{f.care_type} *</label>
            <select className="form-input" value={form.care_type} onChange={set("care_type")}>
              <option value="">Selecione...</option>
              {["Cuidados gerais de enfermagem","Curativo / pós-operatório","Administração de medicamentos",
                "Cuidado de traqueostomia / sonda","Acompanhamento / companheirismo","Outros"].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          {/* TODO: Wire document upload to Cloudinary */}
          <UploadZone label={`${f.doc_photo} *`} note="RG ou CPF · JPG, PNG ou PDF · Máx. 5MB" />
          <InlineError message={error} />
          <div className="flex gap-3 mt-2">
            <button onClick={() => { setError(""); setStep(2); }} className="btn-outline flex-1">← {t("register.back")}</button>
            <button onClick={() => { setError(""); setStep(4); }} className="btn-primary flex-1">{t("register.continue")} →</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <div className="space-y-3 mb-4">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-blue-500" />
              <span className="text-xs text-slate-500">{t("register.terms")}</span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-blue-500" />
              <span className="text-xs text-slate-500">{t("register.lgpd_consent")}</span>
            </label>
          </div>
          <InlineError message={error} />
          <div className="flex gap-3 mt-4">
            <button onClick={() => { setError(""); setStep(3); }} className="btn-outline flex-1">← {t("register.back")}</button>
            <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1 disabled:opacity-60">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Criando...
                </span>
              ) : `${t("register.submit_client")} ✓`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────
   PROFESSIONAL FORM
───────────────────────────────────────── */
const RoleCard = ({ emoji, title, subtitle, selected, onClick }) => (
  <button type="button" onClick={onClick}
    className={`p-3 rounded-xl border-2 text-center transition-all duration-200 w-full ${
      selected ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300"
    }`}>
    <div className="text-2xl mb-1">{emoji}</div>
    <h5 className="text-xs font-bold text-navy">{title}</h5>
    <p className="text-xs text-slate-500">{subtitle}</p>
  </button>
);

const SPECIALTIES = ["Cuidados domiciliares gerais","Pós-operatório / curativos","Paciente oncológico","Cuidados com idosos","Paciente pediátrico","UTI domiciliar"];
const STATES = ["SP","RJ","MG","RS","PR","BA","CE","GO","DF","SC","PE","Outro"];

const ProfForm = ({ googleData, onClearGoogle }) => {
  const { t }     = useTranslation();
  const navigate  = useNavigate();
  const [step,    setStep]    = useState(1);
  const [role,    setRole]    = useState("nurse");
  const [done,    setDone]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const f     = t("register.fields", { returnObjects: true });
  const roles = t("register.roles",  { returnObjects: true });

  const [form, setForm] = useState({
    full_name: "", email: "", cpf: "", phone: "", password: "",
    council_number: "", council_state: "", specialties: "", city: "", radius: "15",
  });

  useEffect(() => {
    if (googleData) {
      setForm(p => ({
        ...p,
        full_name: googleData.name  || p.full_name,
        email:     googleData.email || p.email,
      }));
    }
  }, [googleData]);

  const set = (k) => (e) => { setError(""); setForm((p) => ({ ...p, [k]: e.target.value })); };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      let data;
      if (googleData?.credential) {
        const res = await axios.post(`${API}/api/auth/google`, { credential: googleData.credential, role });
        data = res.data;
      } else {
        const res = await axios.post(`${API}/api/auth/register`, {
          email: form.email, password: form.password,
          full_name: form.full_name, phone: form.phone, cpf: form.cpf, role,
        });
        data = res.data;
      }
      localStorage.setItem("token",     data.access_token);
      localStorage.setItem("role",      data.role);
      localStorage.setItem("user_id",   data.user_id);
      localStorage.setItem("full_name", data.full_name);
      localStorage.setItem("email",     data.email || form.email);
      setDone(true);
      setTimeout(() => navigate("/dashboard/professional"), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao criar conta. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (done) return (
    <div className="text-center py-8">
      <CheckCircle size={56} className="mx-auto mb-4 text-green-500" />
      <h3 className="font-display text-2xl text-navy mb-2">{t("register.success_pro_title")}</h3>
      <p className="text-slate-500 text-sm">{t("register.success_pro_desc")}</p>
    </div>
  );

  return (
    <div>
      <StepDots total={4} current={step} />

      {step === 1 && (
        <div>
          {googleData && <GoogleBanner name={googleData.name} email={googleData.email} onClear={onClearGoogle} />}
          <p className="text-xs text-slate-500 mb-3">Qual é o seu perfil profissional?</p>
          <div className="grid grid-cols-3 gap-2 mb-5">
            {Object.entries(roles).map(([key, val]) => (
              <RoleCard key={key}
                emoji={key === "nurse" ? "👩‍⚕️" : key === "technician" ? "🩺" : "🤝"}
                title={val.title} subtitle={val.subtitle}
                selected={role === key} onClick={() => setRole(key)} />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="form-label">{f.full_name} *</label>
              <input className="form-input" value={form.full_name} onChange={set("full_name")} placeholder="Seu nome completo" />
            </div>
            <div>
              <label className="form-label">{f.cpf} *</label>
              <input className="form-input" value={form.cpf} onChange={set("cpf")} placeholder="000.000.000-00" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="form-label">{f.email} *</label>
              <input
                className={`form-input ${googleData ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
                type="email" value={form.email} onChange={set("email")}
                placeholder="seu@email.com" readOnly={!!googleData}
              />
            </div>
            <div>
              <label className="form-label">{f.whatsapp} *</label>
              <input className="form-input" type="tel" value={form.phone} onChange={set("phone")} placeholder="(11) 99999-9999" />
            </div>
          </div>
          {!googleData && (
            <div className="mb-2">
              <label className="form-label">Senha *</label>
              <input className="form-input" type="password" value={form.password} onChange={set("password")} placeholder="Mínimo 8 caracteres" />
            </div>
          )}
          <InlineError message={error} />
          <button onClick={() => {
            if (!form.full_name)               { setError("Nome completo é obrigatório."); return; }
            if (!form.email)                   { setError("E-mail é obrigatório."); return; }
            if (!googleData && !form.password) { setError("Defina uma senha."); return; }
            if (!googleData && form.password.length < 8) { setError("A senha deve ter no mínimo 8 caracteres."); return; }
            setError(""); setStep(2);
          }} className="btn-primary w-full mt-4">{t("register.continue")} →</button>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="form-label">{f.coren_number} *</label>
              <input className="form-input" value={form.council_number} onChange={set("council_number")} placeholder="123456" />
            </div>
            <div>
              <label className="form-label">{f.state} *</label>
              <select className="form-input" value={form.council_state} onChange={set("council_state")}>
                <option value="">Selecione...</option>
                {STATES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="form-label">{f.specialties} *</label>
            <select className="form-input" value={form.specialties} onChange={set("specialties")}>
              <option value="">Selecione...</option>
              {SPECIALTIES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <label className="form-label">{f.city} *</label>
            <input className="form-input" value={form.city} onChange={set("city")} placeholder="São Paulo, SP - Zona Sul" />
          </div>
          <div className="mb-2">
            <label className="form-label">{f.radius}</label>
            <input className="form-input" type="number" value={form.radius} onChange={set("radius")} placeholder="15" min="1" max="100" />
          </div>
          <InlineError message={error} />
          <div className="flex gap-3 mt-4">
            <button onClick={() => { setError(""); setStep(1); }} className="btn-outline flex-1">← {t("register.back")}</button>
            <button onClick={() => {
              if (!form.council_number)  { setError("Número COREN é obrigatório."); return; }
              if (!form.council_state)   { setError("Estado do COREN é obrigatório."); return; }
              if (!form.city)            { setError("Cidade é obrigatória."); return; }
              setError(""); setStep(3);
            }} className="btn-primary flex-1">{t("register.continue")} →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          {/* TODO: Wire upload zones to Cloudinary */}
          {/* TODO: Validate COREN number against COFEN/COREN API */}
          <div className="bg-blue-50 rounded-xl p-3 mb-4 text-xs text-blue-700">
            📋 Upload e validação do COREN serão implementados em breve. Pode prosseguir por agora.
          </div>
          <UploadZone label={`${f.doc_photo} *`} note="Frente e verso · JPG, PNG ou PDF" />
          <UploadZone label={`${f.diploma} *`} note="Diploma de enfermagem ou certificado" />
          <UploadZone label={f.vaccination} note="Hepatite B, tétano, etc." />
          <InlineError message={error} />
          <div className="flex gap-3 mt-2">
            <button onClick={() => { setError(""); setStep(2); }} className="btn-outline flex-1">← {t("register.back")}</button>
            <button onClick={() => { setError(""); setStep(4); }} className="btn-primary flex-1">{t("register.continue")} →</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          {/* TODO: Wire selfie and criminal record upload to Cloudinary */}
          <UploadZone label={`${f.selfie} *`} note="Selfie com RG/CNH visível no momento da foto" />
          <UploadZone label={`${f.criminal} *`} note={f.criminal_note} />
          <div className="space-y-3 mb-4">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-blue-500" />
              <span className="text-xs text-slate-500">{t("register.terms")}</span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-blue-500" />
              <span className="text-xs text-slate-500">{t("register.accuracy_declaration")}</span>
            </label>
          </div>
          <InlineError message={error} />
          <div className="flex gap-3 mt-4">
            <button onClick={() => { setError(""); setStep(3); }} className="btn-outline flex-1">← {t("register.back")}</button>
            <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1 disabled:opacity-60">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Enviando...
                </span>
              ) : `${t("register.submit_pro")} ✓`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────
   REGISTER PAGE
───────────────────────────────────────── */
const Register = () => {
  const { t }    = useTranslation();
  const [tab,          setTab]          = useState("client");
  const [googleData,   setGoogleData]   = useState(null);
  const [googleLoading,setGoogleLoading]= useState(false);

  const handleGoogleSuccess = (cred) => {
    const payload = decodeGoogleJWT(cred.credential);
    if (!payload) return;
    setGoogleData({ credential: cred.credential, name: payload.name || "", email: payload.email || "" });
  };

  const clearGoogle = () => setGoogleData(null);

  if (googleLoading) return <FullScreenLoader message="Carregando..." />;

  return (
    <div className="min-h-screen bg-hero-gradient py-10 px-4">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link to="/"><Logo size="md" /></Link>
          <LanguageSwitcher />
        </div>

        <div className="text-center mb-6">
          <h1 className="font-display text-3xl font-bold text-navy mb-2">Criar conta</h1>
          <p className="text-slate-500 text-sm">
            Já tem conta?{" "}
            <Link to="/login" className="text-blue-500 font-semibold hover:underline">Fazer login</Link>
          </p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl overflow-hidden border-2 border-slate-200 bg-white mb-6">
          {["client","pro"].map(type => (
            <button key={type} onClick={() => { setTab(type); setGoogleData(null); }}
              className={`flex-1 py-3 text-sm font-semibold transition-all duration-200 ${
                tab === type ? "bg-blue-500 text-white" : "text-slate-500 hover:text-blue-500"
              }`}>
              {t(`register.tab_${type}`)}
            </button>
          ))}
        </div>

        <div className="card p-6 sm:p-8">
          {/* Google signup */}
          {!googleData && (
            <div className="mb-6">
              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => {}}
                  text="signup_with"
                  width="320"
                  shape="rectangular"
                  size="large"
                />
              </div>
              <div className="flex items-center gap-3 my-5">
                <hr className="flex-1 border-slate-200" />
                <span className="text-xs text-slate-400 font-medium">{t("register.or")}</span>
                <hr className="flex-1 border-slate-200" />
              </div>
            </div>
          )}

          {tab === "client"
            ? <ClientForm googleData={googleData} onClearGoogle={clearGoogle} />
            : <ProfForm   googleData={googleData} onClearGoogle={clearGoogle} />
          }
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Ao criar uma conta você concorda com nossos{" "}
          <a href="/terms" className="text-blue-500 hover:underline">Termos de Uso</a>{" "}
          e{" "}
          <a href="/privacy" className="text-blue-500 hover:underline">Política de Privacidade</a>.
        </p>
      </div>
    </div>
  );
};

export default Register;