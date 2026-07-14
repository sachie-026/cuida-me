import { useState, useEffect } from "react";
import { CheckCircle, Clock, AlertTriangle, Shield, PartyPopper, X } from "lucide-react";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const STATUS_ICON = {
  verified: <CheckCircle size={16} className="text-green-500" />,
  pending:  <Clock size={16} className="text-slate-400" />,
  rejected: <AlertTriangle size={16} className="text-amber-500" />,
};

const STATUS_LABEL = {
  verified: "Verificado",
  pending:  "Pendente",
  rejected: "Requer atualização",
};

const STATUS_COLOR = {
  verified: "text-green-600",
  pending:  "text-slate-500",
  rejected: "text-amber-600",
};

const VerificationCenter = ({ role, userId }) => {
  const token   = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const [docs, setDocs]         = useState([]);
  const [user, setUser]         = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading]   = useState(true);

  const isClient = role === "client";
  const isNursing = ["nurse", "technician", "nursing_assistant"].includes(role);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/documents/my-documents`, { headers }),
      axios.get(`${API}/api/users/${userId}`, { headers }),
    ]).then(([docRes, userRes]) => {
      setDocs(Array.isArray(docRes.data) ? docRes.data : []);
      setUser(userRes.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [userId]);

  // Define verification steps based on role
  const steps = isClient ? [
    { key: "client_id",     label: "Documento de identidade (RG/CNH)",  docType: "client_id" },
    { key: "client_selfie", label: "Selfie com documento",              docType: "client_selfie" },
    { key: "phone",         label: "Telefone celular verificado",       manual: true, check: () => !!user?.phone },
  ] : [
    { key: "photo_id",       label: "Documento de identidade",           docType: "photo_id" },
    { key: "phone",          label: "Telefone celular verificado",       manual: true, check: () => !!user?.phone },
    { key: "diploma",        label: "Diploma / Certificado profissional",docType: "diploma" },
    { key: "selfie",         label: "Verificação facial (selfie)",       docType: "selfie" },
    { key: "criminal",       label: "Antecedentes criminais",            docType: "criminal" },
    ...(isNursing ? [
      { key: "coren_negative", label: "Certidão Negativa COREN",         docType: "coren_negative" },
    ] : []),
  ];

  const getStepStatus = (step) => {
    if (step.manual) return step.check() ? "verified" : "pending";
    const doc = docs.find(d => d.doc_type === step.docType);
    if (!doc) return "pending";
    if (doc.status === "approved") return "verified";
    if (doc.status === "rejected") return "rejected";
    return "pending";
  };

  const completedCount = steps.filter(s => getStepStatus(s) === "verified").length;
  const totalCount     = steps.length;
  const progressPct    = Math.round((completedCount / totalCount) * 100);
  const allDone        = completedCount === totalCount;

  if (loading) return <div className="text-sm text-slate-400 text-center py-4">Carregando verificação...</div>;

  return (
    <>
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield size={20} className="text-blue-500" />
          <div>
            <h3 className="font-semibold text-navy">Centro de Verificação</h3>
            <p className="text-xs text-slate-500">
              {allDone
                ? "Todas as verificações concluídas!"
                : `${completedCount} de ${totalCount} verificações concluídas`}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-100 rounded-full h-2.5 mb-5">
          <div className={`h-2.5 rounded-full transition-all duration-500 ${allDone ? "bg-green-500" : "bg-blue-500"}`}
            style={{ width: `${progressPct}%` }} />
        </div>
        <p className="text-xs text-slate-500 text-right -mt-3 mb-4">{progressPct}%</p>

        {/* Steps */}
        <div className="space-y-2">
          {steps.map(step => {
            const status = getStepStatus(step);
            const doc = docs.find(d => d.doc_type === step.docType);
            return (
              <div key={step.key} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                <div className="flex items-center gap-3">
                  {STATUS_ICON[status]}
                  <span className={`text-sm font-medium ${status === "verified" ? "text-navy" : "text-slate-600"}`}>
                    {step.label}
                  </span>
                </div>
                <span className={`text-xs font-semibold ${STATUS_COLOR[status]}`}>
                  {STATUS_LABEL[status]}
                </span>
              </div>
            );
          })}
        </div>

        {/* Verified badge preview */}
        {allDone && (
          <div className="mt-5 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
            <CheckCircle size={20} className="text-green-500" />
            <div>
              <p className="text-sm font-bold text-green-700">
                {isClient ? "✓ Identidade Verificada" : "✓ Profissional Verificado"}
              </p>
              <p className="text-xs text-green-600">Seu perfil exibe o selo de verificação da CuidaNow</p>
            </div>
          </div>
        )}
      </div>

      {/* Congratulatory modal — shown once when all verified */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm text-center p-8">
            <PartyPopper size={48} className="text-amber-400 mx-auto mb-4" />
            <h3 className="font-display text-xl font-bold text-navy mb-2">🎉 Perfil verificado!</h3>
            <p className="text-sm text-slate-600 mb-2">
              Parabéns! Sua identidade e documentação foram verificados pela CuidaNow.
            </p>
            <p className="text-xs text-slate-500 mb-6">
              Seu perfil agora exibe o selo de verificação, ajudando outros usuários a reconhecer que suas informações foram revisadas e validadas.
            </p>
            <button onClick={() => setShowModal(false)} className="btn-primary w-full">Ver meu perfil</button>
          </div>
        </div>
      )}
    </>
  );
};

export default VerificationCenter;