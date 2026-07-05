import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Star, CheckCircle, Clock, Sun, Moon, AlertCircle } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const DURATIONS = [
  {hours:2,label:"2 horas"},{hours:4,label:"4 horas"},{hours:6,label:"6 horas"},
  {hours:8,label:"8 horas"},{hours:12,label:"12 horas"},{hours:24,label:"24 horas"},
];

const ROLE_LABELS = {
  nurse:"Enfermeiro(a)",technician:"Técnico(a) de Enfermagem",nursing_assistant:"Auxiliar de Enfermagem",caregiver:"Cuidador(a)",
};

const StepDots = ({total,current}) => (
  <div className="flex justify-center gap-2 mb-6">
    {Array.from({length:total}).map((_,i)=>(
      <div key={i} className={`h-2 rounded-full transition-all duration-300 ${
        i<current-1?"w-2 bg-green-500":i===current-1?"w-6 bg-blue-500":"w-2 bg-slate-200"
      }`}/>
    ))}
  </div>
);

const NewBooking = () => {
  const navigate = useNavigate();
  const userId   = localStorage.getItem("user_id");
  const token    = localStorage.getItem("token");
  const headers  = {Authorization:`Bearer ${token}`};

  const [step,          setStep]          = useState(1);
  const [servicesMap,   setServicesMap]   = useState({});
  const [patient,       setPatient]       = useState(null);
  const [professionals, setProfessionals] = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [priceResult,   setPriceResult]   = useState(null);
  const [selectedPro,   setSelectedPro]   = useState(null);
  const [submitting,    setSubmitting]    = useState(false);

  const [selectedSvcs,setSelectedSvcs]= useState([]);
  const [duration,    setDuration]    = useState(null);
  const [date,        setDate]        = useState("");
  const [time,        setTime]        = useState("");
  const [shift,       setShift]       = useState("day");
  const [isUrgent,    setIsUrgent]    = useState(false);
  const [notes,       setNotes]       = useState("");
  const [patientMode, setPatientMode] = useState("myself"); // "myself" | "other"
  const [patientForm, setPatientForm] = useState({
    patient_name:"", age:"", relation:"", diagnoses:"", address:"",
    phone:"", emergency_name:"", emergency_phone:"", gender:"",
  });

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/professionals/services`),
      axios.get(`${API}/api/users/${userId}/patient`, {headers}),
    ]).then(([svcRes,patRes]) => {
      setServicesMap(svcRes.data);
      setPatient(patRes.data);
    }).catch(() => toast.error("Erro ao carregar dados."));
  }, []);

  useEffect(() => {
    if (!time) return;
    const hour = parseInt(time.split(":")[0]);
    setShift(hour >= 22 || hour < 6 ? "night" : "day");
  }, [time]);

  useEffect(() => {
    if (!date || !time) return;
    const scheduled = new Date(`${date}T${time}`);
    const hoursUntil = (scheduled - new Date()) / 1000 / 60 / 60;
    setIsUrgent(hoursUntil < 12);
  }, [date, time]);

  const toggleService = (svc) =>
    setSelectedSvcs(prev => prev.includes(svc) ? prev.filter(s=>s!==svc) : [...prev,svc]);

  const handleStep1Next = () => {
    if (selectedSvcs.length===0) { toast.error("Selecione pelo menos um serviço."); return; }
    if (!duration)               { toast.error("Selecione a duração."); return; }
    if (!date || !time)          { toast.error("Informe data e horário."); return; }
    setLoading(true);
    const svcParam = encodeURIComponent(selectedSvcs.join(","));
    axios.get(`${API}/api/professionals/nearby?services=${svcParam}`, {headers})
      .then(r => { setProfessionals(r.data.professionals||[]); setStep(2); })
      .catch(() => toast.error("Erro ao buscar profissionais."))
      .finally(() => setLoading(false));
  };

  const handleSelectPro = async (pro) => {
    setSelectedPro(pro);
    setLoading(true);
    try {
      const priceRes = await axios.post(`${API}/api/professionals/calculate-price`, {
        professional_id: pro.id, duration_hours: duration, shift,
        is_urgent: isUrgent, distance_km: 0,
      }, {headers});
      setPriceResult(priceRes.data);
      setStep(3);
    } catch { toast.error("Erro ao calcular preço."); }
    finally { setLoading(false); }
  };

  const handleConfirm = async () => {
    if (!patient||!selectedPro||!priceResult) return;
    setSubmitting(true);
    try {
      const start = new Date(`${date}T${time}`);
      const end   = new Date(start.getTime()+duration*60*60*1000);
      await axios.post(`${API}/api/bookings`, {
        patient_id: patient.id, professional_id: selectedPro.id,
        service_type: selectedSvcs.join(", "), services: selectedSvcs,
        duration_hours: duration, shift,
        scheduled_start: start.toISOString(), scheduled_end: end.toISOString(),
        is_urgent: isUrgent, distance_km: 0,
        markup_pct: priceResult.markup_pct,
        notes,
      }, {headers});
      toast.success("Agendamento criado com sucesso!");
      navigate("/dashboard/client");
    } catch { toast.error("Erro ao criar agendamento."); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm"/>
        <div className="flex items-center gap-3"><LanguageSwitcher/><ProfileMenu/></div>
      </nav>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={() => step>1 ? setStep(s=>s-1) : navigate("/dashboard/client")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-500 mb-6 transition-colors">
          <ArrowLeft size={16}/> {step>1?"Voltar":"Cancelar"}
        </button>
        <h1 className="font-display text-2xl font-bold text-navy mb-1">Novo agendamento</h1>
        <p className="text-slate-500 text-sm mb-6">Passo {step} de 3</p>
        <StepDots total={3} current={step}/>

        {step===1 && (
          <div className="card p-6 space-y-5">
            {/* Patient picker */}
            <div>
              <label className="form-label">Quem vai receber o atendimento? *</label>
              <div className="flex gap-2 mt-1">
                {[{key:"myself",label:"Eu mesmo(a)"},{key:"other",label:"Outra pessoa"}].map(o=>(
                  <button key={o.key} type="button" onClick={()=>setPatientMode(o.key)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                      patientMode===o.key?"bg-blue-500 text-white border-blue-500":"border-slate-200 text-slate-600 hover:border-blue-400"
                    }`}>{o.label}</button>
                ))}
              </div>
            </div>

            {patientMode==="other" && (
              <div className="space-y-3 p-4 bg-slate-50 rounded-xl">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dados do paciente</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="form-label">Nome completo *</label><input className="form-input" value={patientForm.patient_name} onChange={e=>setPatientForm(p=>({...p,patient_name:e.target.value}))}/></div>
                  <div><label className="form-label">Idade</label><input className="form-input" type="number" value={patientForm.age} onChange={e=>setPatientForm(p=>({...p,age:e.target.value}))}/></div>
                  <div><label className="form-label">Parentesco *</label>
                    <select className="form-input" value={patientForm.relation} onChange={e=>setPatientForm(p=>({...p,relation:e.target.value}))}>
                      <option value="">Selecione...</option>
                      {["Pai/Mãe","Cônjuge","Filho(a)","Avô/Avó","Outro familiar","Amigo(a)","Outro"].map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div><label className="form-label">Gênero</label>
                    <select className="form-input" value={patientForm.gender} onChange={e=>setPatientForm(p=>({...p,gender:e.target.value}))}>
                      <option value="">Selecione...</option>
                      {["Masculino","Feminino","Outro","Prefiro não informar"].map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                <div><label className="form-label">Endereço do atendimento *</label><input className="form-input" value={patientForm.address} onChange={e=>setPatientForm(p=>({...p,address:e.target.value}))}/></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="form-label">Telefone de contato</label><input className="form-input" type="tel" value={patientForm.phone} onChange={e=>setPatientForm(p=>({...p,phone:e.target.value}))}/></div>
                  <div><label className="form-label">Contato de emergência</label><input className="form-input" value={patientForm.emergency_name} onChange={e=>setPatientForm(p=>({...p,emergency_name:e.target.value}))}/></div>
                </div>
                <div><label className="form-label">Diagnóstico / condição (opcional)</label><textarea className="form-input min-h-[60px]" value={patientForm.diagnoses} onChange={e=>setPatientForm(p=>({...p,diagnoses:e.target.value}))}/></div>
              </div>
            )}

            <div>
              <label className="form-label">Serviços necessários * <span className="text-slate-400 font-normal">(selecione todos que precisar)</span></label>
              {Object.keys(servicesMap).length===0 ? (
                <p className="text-slate-400 text-sm mt-1">Carregando serviços...</p>
              ) : (
                <div className="mt-2 space-y-4">
                  {[
                    {label:"Cuidados básicos (Cuidador)",key:"caregiver",filter:(s)=>s},
                    {label:"Cuidados básicos de enfermagem (Auxiliar)",key:"nursing_assistant",filter:(s)=>!(servicesMap.caregiver||[]).includes(s)},
                    {label:"Procedimentos técnicos (Técnico de Enfermagem)",key:"technician",filter:(s)=>!(servicesMap.nursing_assistant||[]).includes(s)},
                    {label:"Procedimentos especializados (Enfermeiro)",key:"nurse",filter:(s)=>!(servicesMap.technician||[]).includes(s)},
                  ].map(group=>(
                    <div key={group.key}>
                      <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">{group.label}</p>
                      <div className="space-y-1">
                        {(servicesMap[group.key]||[]).filter(group.filter).map(svc=>(
                          <label key={svc} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                            <input type="checkbox" checked={selectedSvcs.includes(svc)} onChange={()=>toggleService(svc)} className="w-4 h-4 accent-blue-500 flex-shrink-0"/>
                            <span className={`text-sm ${selectedSvcs.includes(svc)?"text-navy font-medium":"text-slate-600"}`}>{svc}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {selectedSvcs.length>0 && (
                <p className="text-xs text-blue-600 mt-2 font-medium">✓ {selectedSvcs.length} serviço(s) selecionado(s)</p>
              )}
            </div>

            <div>
              <label className="form-label">Duração *</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {DURATIONS.map(d=>(
                  <button key={d.hours} type="button" onClick={()=>setDuration(d.hours)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                      duration===d.hours?"bg-blue-500 text-white border-blue-500":"border-slate-200 text-slate-600 hover:border-blue-400"
                    }`}>{d.label}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Data *</label>
                <input className="form-input" type="date"
                  min={new Date().toISOString().split("T")[0]}
                  value={date} onChange={e=>setDate(e.target.value)}/>
              </div>
              <div>
                <label className="form-label">Horário *</label>
                <input className="form-input" type="time" value={time} onChange={e=>setTime(e.target.value)}/>
              </div>
            </div>

            {time && (
              <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium ${
                shift==="day"?"bg-amber-50 text-amber-700":"bg-slate-800 text-white"
              }`}>
                {shift==="day"?<Sun size={16}/>:<Moon size={16}/>}
                {shift==="day"?"Plantão diurno (6h–22h)":"Plantão noturno (22h–6h)"}
              </div>
            )}

            {isUrgent && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle size={16} className="text-red-500"/>
                <p className="text-xs text-red-600 font-medium">Solicitação urgente (menos de 12h) — acréscimo de 20%</p>
              </div>
            )}

            <div>
              <label className="form-label">Observações</label>
              <textarea className="form-input min-h-[80px]" value={notes} onChange={e=>setNotes(e.target.value)}
                placeholder="Informações especiais sobre o paciente, acesso, equipamentos..."/>
            </div>

            <button onClick={handleStep1Next} disabled={loading} className="btn-primary w-full disabled:opacity-60">
              {loading?"Buscando profissionais...":"Escolher profissional →"}
            </button>
          </div>
        )}

        {step===2 && (
          <div>
            {professionals.length===0 ? (
              <div className="card p-8 text-center">
                <p className="text-navy font-semibold mb-2">Nenhum profissional disponível</p>
                <p className="text-slate-500 text-sm">Não há profissionais disponíveis para os serviços selecionados no momento.</p>
                <button onClick={()=>setStep(1)} className="btn-outline mt-4">← Voltar e ajustar</button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 mb-2">{professionals.length} profissional(is) disponível(is)</p>
                {professionals.map(pro=>(
                  <div key={pro.id} className="card p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600">
                            {(pro.full_name||"?")?.[0]}
                          </div>
                          <div>
                            <p className="font-semibold text-navy text-sm">{pro.full_name||"Profissional"}</p>
                            <p className="text-xs text-slate-500">{ROLE_LABELS[pro.role]||pro.role} · {pro.city}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                          <Star size={13} className="fill-amber-400 text-amber-400"/> {pro.rating_avg?.toFixed(1) || "—"} <span className="text-slate-400">({pro.rating_count || 0})</span>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                          {pro.rating_avg>0 && <span className="flex items-center gap-1"><Star size={11} className="text-amber-400 fill-amber-400"/>{pro.rating_avg} ({pro.rating_count})</span>}
                          {pro.markup_pct>0 && <span className="text-slate-400">+{pro.markup_pct}% acréscimo</span>}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(pro.services_offered||[]).slice(0,3).map(s=>(
                            <span key={s} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">{s}</span>
                          ))}
                          {(pro.services_offered||[]).length>3 && (
                            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">+{pro.services_offered.length-3} mais</span>
                          )}
                        </div>
                      </div>
                      <button onClick={()=>handleSelectPro(pro)} disabled={loading}
                        className="btn-primary text-sm px-4 py-2 flex-shrink-0 disabled:opacity-60">
                        {loading&&selectedPro?.id===pro.id?"...":"Selecionar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step===3 && priceResult && selectedPro && (
          <div className="card p-6 space-y-5">
            <h3 className="font-semibold text-navy">Confirmar agendamento</h3>
            <div className="bg-slate-50 rounded-xl p-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Profissional</span><span className="font-medium text-navy">{selectedPro.full_name||"—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Serviço</span><span className="font-medium text-navy">{selectedSvcs.length} serviço(s)</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Duração</span><span className="font-medium text-navy">{duration}h · {shift==="day"?"Diurno ☀️":"Noturno 🌙"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Data</span><span className="font-medium text-navy">{new Date(`${date}T${time}`).toLocaleString("pt-BR")}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Paciente</span><span className="font-medium text-navy">{patientMode==="myself"?(patient?.patient_name||"Eu mesmo"):patientForm.patient_name}</span></div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Serviços solicitados</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedSvcs.map(s=><span key={s} className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">{s}</span>)}
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Detalhamento do valor</p>
              </div>
              <div className="p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Valor base ({duration}h {shift==="day"?"diurno":"noturno"})</span>
                  <span>R${priceResult.base_price?.toFixed(2)}</span>
                </div>
                {priceResult.markup_amount>0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Acréscimo profissional (+{priceResult.markup_pct}%)</span>
                    <span>+R${priceResult.markup_amount?.toFixed(2)}</span>
                  </div>
                )}
                {priceResult.surcharge_amount>0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>{priceResult.surcharge_labels?.join(", ")}</span>
                    <span>+R${priceResult.surcharge_amount?.toFixed(2)}</span>
                  </div>
                )}
                {priceResult.distance_fee>0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Taxa de deslocamento</span>
                    <span>+R${priceResult.distance_fee?.toFixed(2)}</span>
                  </div>
                )}
                <hr className="border-slate-200"/>
                <div className="flex justify-between font-bold text-navy text-base">
                  <span>Total</span><span>R${priceResult.total?.toFixed(2)}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">💳 PIX ou cartão será processado após confirmação do profissional</p>
              </div>
            </div>

            {isUrgent && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <Clock size={15} className="text-amber-500"/>
                <p className="text-xs text-amber-700 font-medium">Solicitação urgente — profissional será notificado imediatamente</p>
              </div>
            )}

            <button onClick={handleConfirm} disabled={submitting}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60">
              <CheckCircle size={16}/>
              {submitting?"Confirmando...":`Confirmar agendamento · R$${priceResult.total?.toFixed(2)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewBooking;