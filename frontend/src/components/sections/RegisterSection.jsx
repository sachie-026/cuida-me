import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GoogleLogin } from "@react-oauth/google";
import { Upload, CheckCircle } from "lucide-react";

const StepDots = ({ total, current }) => (
  <div className="flex justify-center gap-2 mb-6">
    {Array.from({ length: total }).map((_, i) => (
      <div
        key={i}
        className={`h-2 rounded-full transition-all duration-300
          ${i < current - 1 ? "w-2 bg-green-500" : i === current - 1 ? "w-6 bg-blue-500" : "w-2 bg-slate-200"}`}
      />
    ))}
  </div>
);

const UploadZone = ({ label, note }) => (
  <div className="form-group mb-4">
    <label className="form-label">{label}</label>
    <div className="upload-zone">
      <Upload size={20} className="mx-auto mb-2 text-slate-400" />
      <p className="text-sm font-semibold text-navy">Clique para enviar ou arraste</p>
      {note && <p className="text-xs text-slate-400 mt-1">{note}</p>}
    </div>
  </div>
);

/* ── Client Form ── */
const ClientForm = () => {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const f = t("register.fields", { returnObjects: true });

  if (done) return (
    <div className="text-center py-6">
      <CheckCircle size={56} className="mx-auto mb-4 text-green-500" />
      <h3 className="font-display text-2xl text-navy mb-2">{t("register.success_client_title")}</h3>
      <p className="text-slate-500 text-sm">{t("register.success_client_desc")}</p>
    </div>
  );

  return (
    <div>
      <StepDots total={3} current={step} />
      {step === 1 && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div><label className="form-label">{f.full_name} *</label><input className="form-input" placeholder="Seu nome completo" /></div>
            <div><label className="form-label">{f.cpf} *</label><input className="form-input" placeholder="000.000.000-00" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div><label className="form-label">{f.email} *</label><input className="form-input" type="email" placeholder="seu@email.com" /></div>
            <div><label className="form-label">{f.whatsapp} *</label><input className="form-input" type="tel" placeholder="(11) 99999-9999" /></div>
          </div>
          <div className="mb-5"><label className="form-label">{f.password} *</label><input className="form-input" type="password" placeholder={f.password_placeholder} /></div>
          <button onClick={() => setStep(2)} className="btn-primary w-full">{t("register.continue")} →</button>
        </div>
      )}
      {step === 2 && (
        <div>
          <div className="mb-4"><label className="form-label">{f.patient_name} *</label><input className="form-input" placeholder="Nome de quem receberá o cuidado" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div><label className="form-label">{f.patient_age} *</label><input className="form-input" type="number" placeholder="75" /></div>
            <div>
              <label className="form-label">{f.relation} *</label>
              <select className="form-input">
                <option>Selecione...</option>
                {["Filho(a)","Cônjuge","Próprio paciente","Outro familiar"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-4"><label className="form-label">{f.diagnoses}</label><textarea className="form-input min-h-[80px]" placeholder="Ex: Diabetes, hipertensão, acamado..." /></div>
          <div className="mb-5"><label className="form-label">{f.address} *</label><input className="form-input" placeholder="Rua, número, bairro, cidade" /></div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="btn-outline flex-1">← {t("register.back")}</button>
            <button onClick={() => setStep(3)} className="btn-primary flex-1">{t("register.continue")} →</button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div>
          <div className="mb-4">
            <label className="form-label">{f.care_type} *</label>
            <select className="form-input">
              <option>Selecione...</option>
              {["Cuidados gerais de enfermagem","Curativo / pós-operatório","Administração de medicamentos","Cuidado de traqueostomia / sonda","Acompanhamento / companheirismo","Outros"].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <UploadZone label={`${f.doc_photo} *`} note="JPG, PNG ou PDF · Máx. 5MB" />
          <div className="space-y-3 mb-5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-blue-500" />
              <span className="text-xs text-slate-500">{t("register.terms")}</span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-blue-500" />
              <span className="text-xs text-slate-500">{t("register.lgpd_consent")}</span>
            </label>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="btn-outline flex-1">← {t("register.back")}</button>
            <button onClick={() => setDone(true)} className="btn-primary flex-1">{t("register.submit_client")} ✓</button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Professional Form ── */
const RoleCard = ({ emoji, title, subtitle, selected, onClick }) => (
  <button
    onClick={onClick}
    className={`p-3 rounded-xl border-2 text-center transition-all duration-200 cursor-pointer w-full
      ${selected ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300"}`}
  >
    <div className="text-2xl mb-1">{emoji}</div>
    <h5 className="text-xs font-bold text-navy">{title}</h5>
    <p className="text-xs text-slate-500">{subtitle}</p>
  </button>
);

const ProfForm = () => {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState("nurse");
  const [done, setDone] = useState(false);
  const f = t("register.fields", { returnObjects: true });
  const roles = t("register.roles", { returnObjects: true });

  if (done) return (
    <div className="text-center py-6">
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
          <p className="text-xs text-slate-500 mb-3">Qual é o seu perfil profissional?</p>
          <div className="grid grid-cols-3 gap-2 mb-5">
            {Object.entries(roles).map(([key, val]) => (
              <RoleCard key={key} emoji={key==="nurse"?"👩‍⚕️":key==="technician"?"🩺":"🤝"} title={val.title} subtitle={val.subtitle} selected={role===key} onClick={()=>setRole(key)} />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div><label className="form-label">{f.full_name} *</label><input className="form-input" placeholder="Seu nome completo" /></div>
            <div><label className="form-label">{f.cpf} *</label><input className="form-input" placeholder="000.000.000-00" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div><label className="form-label">{f.email} *</label><input className="form-input" type="email" placeholder="seu@email.com" /></div>
            <div><label className="form-label">{f.whatsapp} *</label><input className="form-input" type="tel" placeholder="(11) 99999-9999" /></div>
          </div>
          <button onClick={() => setStep(2)} className="btn-primary w-full">{t("register.continue")} →</button>
        </div>
      )}
      {step === 2 && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div><label className="form-label">{f.coren_number} *</label><input className="form-input" placeholder="123456-SP" /></div>
            <div>
              <label className="form-label">{f.state} *</label>
              <select className="form-input">
                <option>Selecione...</option>
                {["SP","RJ","MG","RS","PR","BA","CE","GO","Outro"].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="form-label">{f.specialties} *</label>
            <select className="form-input">
              <option>Selecione...</option>
              {["Cuidados domiciliares gerais","Pós-operatório / curativos","Paciente oncológico","Cuidados com idosos","Paciente pediátrico","UTI domiciliar"].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="mb-4"><label className="form-label">{f.city} *</label><input className="form-input" placeholder="São Paulo, SP - Zona Sul" /></div>
          <div className="mb-5"><label className="form-label">{f.radius}</label><input className="form-input" type="number" placeholder="15" min="1" max="100" /></div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="btn-outline flex-1">← {t("register.back")}</button>
            <button onClick={() => setStep(3)} className="btn-primary flex-1">{t("register.continue")} →</button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div>
          <div className="bg-blue-50 rounded-xl p-3 mb-4 text-xs text-blue-700">
            📋 Documentos obrigatórios para aprovação. Todos os dados são criptografados e protegidos.
          </div>
          <UploadZone label={`${f.doc_photo} *`} note="Frente e verso · JPG, PNG ou PDF" />
          <UploadZone label={`${f.diploma} *`} note="Diploma de enfermagem ou certificado" />
          <UploadZone label={f.vaccination} note="Hepatite B, tétano, etc." />
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="btn-outline flex-1">← {t("register.back")}</button>
            <button onClick={() => setStep(4)} className="btn-primary flex-1">{t("register.continue")} →</button>
          </div>
        </div>
      )}
      {step === 4 && (
        <div>
          <UploadZone label={`${f.selfie} *`} note="Selfie com RG/CNH visível no momento da foto" />
          <UploadZone label={`${f.criminal} *`} note={f.criminal_note} />
          <div className="mb-5"><label className="form-label">Senha *</label><input className="form-input" type="password" placeholder="Mínimo 8 caracteres" /></div>
          <div className="space-y-3 mb-5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-blue-500" />
              <span className="text-xs text-slate-500">{t("register.terms")}</span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-blue-500" />
              <span className="text-xs text-slate-500">{t("register.accuracy_declaration")}</span>
            </label>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="btn-outline flex-1">← {t("register.back")}</button>
            <button onClick={() => setDone(true)} className="btn-primary flex-1">{t("register.submit_pro")} ✓</button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Register Section ── */
const RegisterSection = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState("client");

  const handleGoogleSuccess = (cred) => {
    console.log("Google login:", cred);
    // TODO: send to backend /api/auth/google
  };

  return (
    <section id="register" className="py-20 bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8">
          <span className="section-label">{t("register.label")}</span>
          <h2 className="section-title mb-2">{t("register.title")}</h2>
          <p className="section-sub">{t("register.subtitle")}</p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl overflow-hidden border-2 border-slate-200 bg-white mb-8">
          {["client","pro"].map(type => (
            <button
              key={type}
              onClick={() => setTab(type)}
              className={`flex-1 py-3 text-sm font-semibold transition-all duration-200
                ${tab === type ? "bg-blue-500 text-white" : "text-slate-500 hover:text-blue-500"}`}
            >
              {t(`register.tab_${type}`)}
            </button>
          ))}
        </div>

        <div className="card p-6 sm:p-8">
          {/* Google login */}
          <div className="mb-6">
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => console.log("Google login failed")}
                text={tab === "client" ? "continue_with" : "continue_with"}
                width="100%"
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

          {/* Form */}
          {tab === "client" ? <ClientForm /> : <ProfForm />}

          <p className="text-center text-xs text-slate-500 mt-5">
            {t("register.already_have")}{" "}
            <a href="/login" className="text-blue-500 font-semibold hover:underline">{t("register.login")}</a>
          </p>
        </div>
      </div>
    </section>
  );
};

export default RegisterSection;
