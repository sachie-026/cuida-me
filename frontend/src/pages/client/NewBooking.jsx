import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle, MapPin, Star, Clock } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const SERVICES = [
  "Cuidados gerais de enfermagem",
  "Curativo / pós-operatório",
  "Administração de medicamentos",
  "Cuidado de traqueostomia / sonda",
  "Banho no leito e higiene",
  "Monitoramento de sinais vitais",
  "Acompanhamento / companheirismo",
  "Outros",
];

const DURATIONS = [
  { label: "1 hora",   hours: 1  },
  { label: "2 horas",  hours: 2  },
  { label: "3 horas",  hours: 3  },
  { label: "6 horas",  hours: 6  },
  { label: "12 horas", hours: 12 },
  { label: "24 horas", hours: 24 },
];

const StepDots = ({ total, current }) => (
  <div className="flex justify-center gap-2 mb-6">
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} className={`h-2 rounded-full transition-all duration-300
        ${i < current - 1 ? "w-2 bg-green-500" : i === current - 1 ? "w-6 bg-blue-500" : "w-2 bg-slate-200"}`} />
    ))}
  </div>
);

const NewBooking = () => {
  const navigate  = useNavigate();
  const userId    = localStorage.getItem("user_id");
  const token     = localStorage.getItem("token");
  const headers   = { Authorization: `Bearer ${token}` };

  const [step, setStep]               = useState(1);
  const [professionals, setProfessionals] = useState([]);
  const [selectedPro, setSelectedPro] = useState(null);
  const [patientId, setPatientId]     = useState(null);
  const [loading, setLoading]         = useState(false);
  const [done, setDone]               = useState(false);

  const [form, setForm] = useState({
    service_type: "",
    duration:     3,
    date:         "",
    time:         "",
    notes:        "",
  });

  // Load patient id + professionals
  useEffect(() => {
    axios.get(`${API}/api/users/${userId}/patient`, { headers })
      .then(r => setPatientId(r.data.id))
      .catch(() => {});
    axios.get(`${API}/api/professionals/nearby?lat=-23.55&lng=-46.63&radius=50`, { headers })
      .then(r => setProfessionals(r.data.professionals || []))
      .catch(() => {});
  }, []);

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const calcPrice = () => {
    if (!selectedPro?.hourly_rate) return { total: 0, fee: 0, payout: 0 };
    const total   = selectedPro.hourly_rate * form.duration;
    const fee     = parseFloat((total * 0.12).toFixed(2));
    const payout  = parseFloat((total - fee).toFixed(2));
    return { total, fee, payout };
  };

  const handleSubmit = async () => {
    if (!patientId)   { toast.error("Perfil de paciente não encontrado. Complete seu perfil primeiro."); return; }
    if (!selectedPro) { toast.error("Selecione um profissional."); return; }
    if (!form.date || !form.time) { toast.error("Selecione data e horário."); return; }

    setLoading(true);
    try {
      const start = new Date(`${form.date}T${form.time}:00`);
      const end   = new Date(start.getTime() + form.duration * 3600000);
      const { total, fee, payout } = calcPrice();

      await axios.post(`${API}/api/bookings`, {
        patient_id:      patientId,
        professional_id: selectedPro.id,
        service_type:    form.service_type,
        procedures:      [form.service_type],
        scheduled_start: start.toISOString(),
        scheduled_end:   end.toISOString(),
        total_price:     total,
        platform_fee:    fee,
        pro_payout:      payout,
        notes:           form.notes,
      }, { headers });

      setDone(true);
      toast.success("Agendamento criado com sucesso!");
      setTimeout(() => navigate("/dashboard/client"), 2500);
    } catch {
      toast.error("Erro ao criar agendamento.");
    } finally {
      setLoading(false);
    }
  };

  if (done) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="text-center">
        <CheckCircle size={64} className="mx-auto mb-4 text-green-500" />
        <h2 className="font-display text-2xl font-bold text-navy mb-2">Agendamento criado!</h2>
        <p className="text-slate-500">Aguardando confirmação do profissional...</p>
      </div>
    </div>
  );

  const { total, fee, payout } = calcPrice();

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" />
        <div className="flex items-center gap-3"><LanguageSwitcher /><ProfileMenu /></div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={() => step > 1 ? setStep(s => s - 1) : navigate("/dashboard/client")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-500 mb-6 transition-colors">
          <ArrowLeft size={16} /> {step > 1 ? "Voltar" : "Cancelar"}
        </button>
        <h1 className="font-display text-2xl font-bold text-navy mb-2">Novo agendamento</h1>
        <p className="text-slate-500 text-sm mb-6">Passo {step} de 3</p>

        <div className="card p-6">
          <StepDots total={3} current={step} />

          {/* Step 1: Service + time */}
          {step === 1 && (
            <div>
              <h3 className="font-semibold text-navy mb-4">Tipo de serviço e horário</h3>
              <div className="mb-4">
                <label className="form-label">Serviço necessário *</label>
                <select className="form-input" value={form.service_type} onChange={set("service_type")}>
                  <option value="">Selecione...</option>
                  {SERVICES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="mb-4">
                <label className="form-label">Duração *</label>
                <div className="grid grid-cols-3 gap-2">
                  {DURATIONS.map(d => (
                    <button key={d.hours} type="button"
                      onClick={() => setForm(p => ({ ...p, duration: d.hours }))}
                      className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors
                        ${form.duration === d.hours ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-blue-300"}`}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="form-label">Data *</label>
                  <input className="form-input" type="date" value={form.date} onChange={set("date")}
                    min={new Date().toISOString().split("T")[0]} />
                </div>
                <div>
                  <label className="form-label">Horário *</label>
                  <input className="form-input" type="time" value={form.time} onChange={set("time")} />
                </div>
              </div>
              <div className="mb-5">
                <label className="form-label">Observações</label>
                <textarea className="form-input min-h-[80px]" value={form.notes} onChange={set("notes")}
                  placeholder="Dispositivos, condições especiais, acesso ao imóvel..." />
              </div>
              <button onClick={() => {
                if (!form.service_type || !form.date || !form.time) { toast.error("Preencha todos os campos obrigatórios."); return; }
                setStep(2);
              }} className="btn-primary w-full flex items-center justify-center gap-2">
                Escolher profissional <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* Step 2: Pick professional */}
          {step === 2 && (
            <div>
              <h3 className="font-semibold text-navy mb-4">Escolha o profissional</h3>
              {professionals.length === 0 ? (
                <div className="text-center py-8">
                  <MapPin size={40} className="mx-auto mb-3 text-slate-300" />
                  <p className="text-slate-500 text-sm">Nenhum profissional disponível no momento.</p>
                </div>
              ) : (
                <div className="space-y-3 mb-5">
                  {professionals.map(p => (
                    <button key={p.id} type="button" onClick={() => setSelectedPro(p)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all
                        ${selectedPro?.id === p.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-300"}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-navy text-sm">{p.council_type} {p.council_number}-{p.council_state}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{p.city} · Raio: {p.service_radius}km</p>
                          <div className="flex items-center gap-1 mt-1">
                            <Star size={12} className="fill-amber-400 text-amber-400" />
                            <span className="text-xs text-slate-600">{p.rating_avg} ({p.rating_count} avaliações)</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600 text-sm">R${p.hourly_rate}/h</p>
                          <p className="text-xs text-slate-400 mt-0.5">{form.duration}h = R${(p.hourly_rate * form.duration).toFixed(0)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => { if (!selectedPro) { toast.error("Selecione um profissional."); return; } setStep(3); }}
                className="btn-primary w-full flex items-center justify-center gap-2">
                Confirmar profissional <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* Step 3: Confirm + pay */}
          {step === 3 && selectedPro && (
            <div>
              <h3 className="font-semibold text-navy mb-4">Confirmar agendamento</h3>
              <div className="bg-slate-50 rounded-xl p-4 mb-5 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Serviço</span><span className="font-medium text-navy">{form.service_type}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Data</span><span className="font-medium text-navy">{new Date(`${form.date}T${form.time}`).toLocaleString("pt-BR")}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Duração</span><span className="font-medium text-navy">{form.duration}h</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Profissional</span><span className="font-medium text-navy">{selectedPro.council_type} {selectedPro.council_number}-{selectedPro.council_state}</span></div>
                <hr className="border-slate-200" />
                <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-medium">R${total.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Taxa da plataforma (12%)</span><span className="text-slate-500">R${fee.toFixed(2)}</span></div>
                <div className="flex justify-between text-base font-bold"><span className="text-navy">Total</span><span className="text-green-600">R${total.toFixed(2)}</span></div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 text-xs text-amber-700">
                💳 Pagamento via PIX ou cartão será processado após a confirmação do profissional.
              </div>

              {form.notes && (
                <div className="mb-5 p-3 bg-blue-50 rounded-xl text-xs text-blue-700">
                  <strong>Observações:</strong> {form.notes}
                </div>
              )}

              <button onClick={handleSubmit} disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60">
                {loading ? "Criando agendamento..." : "Confirmar agendamento ✓"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewBooking;