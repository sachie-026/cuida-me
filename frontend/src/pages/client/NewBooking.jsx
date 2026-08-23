import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Star, CheckCircle, Clock, Sun, Moon, AlertCircle } from "lucide-react";
import VerifiedBadge from "../../components/common/VerifiedBadge";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

// v2: No fixed durations — Start Time + End Time with minute precision

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
  const [date,        setDate]        = useState("");
  const [startTime,   setStartTime]   = useState("");
  const [endTime,     setEndTime]     = useState("");
  const [shift,       setShift]       = useState("day");
  const [isUrgent,    setIsUrgent]    = useState(false);
  const [notes,       setNotes]       = useState("");
  const [durationInfo,setDurationInfo]= useState(null);
  const [patientMode, setPatientMode] = useState("myself");
  const [patientForm, setPatientForm] = useState({
    patient_name:"", age:"", relation:"", diagnoses:"", address:"",
    phone:"", emergency_name:"", emergency_phone:"", gender:"",
  });
  const [emergencyContact, setEmergencyContact] = useState({ name:"", phone:"" });
  const [isVerified, setIsVerified] = useState(true);
  const [phoneVerified, setPhoneVerified] = useState(true);
  const [svcLoadState, setSvcLoadState] = useState("loading");
  const [svcError, setSvcError] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  // 44a: Root-cause fix — each call independent, services never blocks on auth failures
  const loadData = () => {
    setSvcLoadState("loading"); setSvcError("");
    const timeout = setTimeout(() => {
      setSvcLoadState("error"); setSvcError("Tempo limite atingido. Toque para tentar novamente.");
    }, 15000);

    // Services is public — never send auth headers (avoids 401 on expired token)
    const svcPromise = axios.get(`${API}/api/professionals/services`)
      .catch(err => {
        console.error(`[44a] Services API failed: status=${err.response?.status}, msg=${err.message}`);
        return { data: {} };
      });

    // Auth-dependent calls — only if userId + token exist
    const hasAuth = userId && token;
    const patPromise = hasAuth
      ? axios.get(`${API}/api/users/${userId}/patient`, {headers}).catch(() => ({data:null}))
      : Promise.resolve({data:null});
    const userPromise = hasAuth
      ? axios.get(`${API}/api/users/${userId}`, {headers}).catch(() => ({data:{}}))
      : Promise.resolve({data:{}});
    const phonePromise = hasAuth
      ? axios.get(`${API}/api/auth/phone/status`, {headers}).catch(() => ({data:{phone_verified:true}}))
      : Promise.resolve({data:{phone_verified:false}});

    Promise.all([svcPromise, patPromise, userPromise, phonePromise])
      .then(([svcRes, patRes, userRes, phoneRes]) => {
        clearTimeout(timeout);
        const services = svcRes.data || {};
        setServicesMap(services);
        if (patRes.data) setPatient(patRes.data);
        setIsVerified(userRes.data?.is_verified || false);
        setPhoneVerified(phoneRes.data?.phone_verified ?? true);
        setSvcLoadState(Object.keys(services).length > 0 ? "content" : "error");
        if (Object.keys(services).length === 0) {
          setSvcError("Nenhum serviço disponível. Toque para tentar novamente.");
        }
      })
      .catch((err) => {
        clearTimeout(timeout);
        console.error(`[44c] Critical load failed: ${err.message}, userId=${userId}`);
        setSvcError("Erro inesperado ao carregar. Toque para tentar novamente.");
        setSvcLoadState("error");
      });
  };
  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!startTime) return;
    const hour = parseInt(startTime.split(":")[0]);
    setShift(hour >= 22 || hour < 6 ? "night" : "day");
  }, [startTime]);

  useEffect(() => {
    if (!date || !startTime) return;
    const scheduled = new Date(`${date}T${startTime}`);
    const hoursUntil = (scheduled - new Date()) / 1000 / 60 / 60;
    setIsUrgent(hoursUntil < 12);
  }, [date, startTime]);

  // Auto-calculate duration from start/end
  useEffect(() => {
    if (!startTime || !endTime || !date) { setDurationInfo(null); return; }
    const start = new Date(`${date}T${startTime}`);
    let end = new Date(`${date}T${endTime}`);
    const isOvernight = end <= start;
    if (isOvernight) end.setDate(end.getDate() + 1);
    const totalMin = (end - start) / 1000 / 60;
    const hours = Math.floor(totalMin / 60);
    const minutes = Math.round(totalMin % 60);
    setDurationInfo({ hours, minutes, totalMinutes: totalMin, isOvernight });
  }, [startTime, endTime, date]);

  const toggleService = (svc) =>
    setSelectedSvcs(prev => prev.includes(svc) ? prev.filter(s=>s!==svc) : [...prev,svc]);

  const handleStep1Next = () => {
    if (selectedSvcs.length===0) { toast.error("Selecione pelo menos um serviço."); return; }
    if (!date || !startTime || !endTime) { toast.error("Informe data, horário de início e fim."); return; }
    if (!durationInfo || durationInfo.totalMinutes < 120) { toast.error("Duração mínima é 2 horas."); return; }
    if (!emergencyContact.name || !emergencyContact.phone) { toast.error("Contato de emergência é obrigatório."); return; }
    setLoading(true);
    const svcParam = encodeURIComponent(selectedSvcs.join(","));
    const startISO = new Date(`${date}T${startTime}`).toISOString();
    let endDt = new Date(`${date}T${endTime}`);
    if (endDt <= new Date(`${date}T${startTime}`)) endDt.setDate(endDt.getDate() + 1);
    const endISO = endDt.toISOString();
    axios.get(`${API}/api/professionals/nearby?services=${svcParam}&start_time=${encodeURIComponent(startISO)}&end_time=${encodeURIComponent(endISO)}`, {headers})
      .then(r => { setProfessionals(r.data.professionals||[]); setStep(2); })
      .catch(() => toast.error("Erro ao buscar profissionais."))
      .finally(() => setLoading(false));
  };

  const handleSelectPro = async (pro) => {
    setSelectedPro(pro);
    setLoading(true);
    const start = new Date(`${date}T${startTime}`);
    let end = new Date(`${date}T${endTime}`);
    if (end <= start) end.setDate(end.getDate() + 1);
    try {
      const priceRes = await axios.post(`${API}/api/professionals/calculate-price`, {
        professional_id: pro.id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
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
      const start = new Date(`${date}T${startTime}`);
      let end = new Date(`${date}T${endTime}`);
      if (end <= start) end.setDate(end.getDate() + 1);
      await axios.post(`${API}/api/bookings`, {
        patient_id: patient.id, professional_id: selectedPro.id,
        service_type: selectedSvcs.join(", "), services: selectedSvcs,
        duration_hours: durationInfo?.hours || Math.round(durationInfo?.totalMinutes/60),
        shift,
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

        {/* 47a: Verification gate — document + phone */}
        {(!isVerified || !phoneVerified) && (
          <div className="card p-6 mb-4 border-2 border-amber-300 bg-amber-50">
            <div className="flex items-start gap-3">
              <AlertCircle size={24} className="text-amber-500 flex-shrink-0 mt-0.5"/>
              <div>
                <p className="font-bold text-navy mb-1">Verificação necessária para agendar</p>
                {!isVerified && <p className="text-sm text-slate-600 mb-2">📄 Envie seus documentos de identidade.</p>}
                {!phoneVerified && <p className="text-sm text-slate-600 mb-2">📱 Verifique seu telefone via SMS.</p>}
                <div className="flex gap-2">
                  {!isVerified && <button onClick={()=>navigate("/profile/client")} className="btn-primary text-sm">Verificar identidade</button>}
                  {!phoneVerified && <button onClick={()=>navigate("/profile/client")} className="btn-outline text-sm">Verificar telefone</button>}
                </div>
              </div>
            </div>
          </div>
        )}

        {step===1 && (
          <div className={`card p-6 space-y-5 ${(!isVerified || !phoneVerified) ? "opacity-50 pointer-events-none" : ""}`}>
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

              {/* 44b: Loading state (15s cap) */}
              {Object.keys(servicesMap).length===0 && !svcError && (
                <div className="flex items-center gap-3 p-4 mt-2 bg-slate-50 rounded-xl">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                  <span className="text-sm text-slate-500">Carregando serviços...</span>
                </div>
              )}

              {/* 44b: Error state with retry */}
              {svcError && (
                <div className="p-4 mt-2 bg-red-50 border border-red-200 rounded-xl text-center">
                  <p className="text-sm text-red-600 mb-2">{svcError}</p>
                  <button onClick={loadData} className="btn-primary text-sm">Tentar novamente</button>
                </div>
              )}

              {/* 44b: Content state */}
              {Object.keys(servicesMap).length > 0 && (
                <div className="mt-2 space-y-4">

                  {/* 44f: "Not sure which one you need?" */}
                  <button type="button" onClick={() => setShowGuide(!showGuide)}
                    className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1">
                    {showGuide ? "✕ Fechar ajuda" : "🤔 Não sabe qual categoria escolher?"}
                  </button>

                  {/* 44g: Guided fallback — step-by-step questions */}
                  {showGuide && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-4">
                      <p className="text-sm font-semibold text-navy">Vamos descobrir juntos:</p>

                      <div className="space-y-3">
                        <div className="p-3 bg-white rounded-lg border border-blue-100">
                          <p className="text-xs text-slate-700 mb-2 font-medium">1. A pessoa precisa de administração de medicamentos injetáveis, curativos complexos ou sondas?</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => { setShowGuide(false); toast("Selecione serviços de Técnico de Enfermagem ou Enfermeiro abaixo.", {icon:"👇"}); }}
                              className="text-xs px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 font-semibold hover:bg-purple-200">Sim → Técnico ou Enfermeiro</button>
                            <button type="button" className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200"
                              onClick={() => document.getElementById("guide-q2")?.scrollIntoView({behavior:"smooth"})}>Não →</button>
                          </div>
                        </div>

                        <div id="guide-q2" className="p-3 bg-white rounded-lg border border-blue-100">
                          <p className="text-xs text-slate-700 mb-2 font-medium">2. A pessoa precisa de monitoramento de sinais vitais, pressão, glicemia ou medicamentos orais?</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => { setShowGuide(false); toast("Selecione serviços de Auxiliar de Enfermagem abaixo.", {icon:"👇"}); }}
                              className="text-xs px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 font-semibold hover:bg-blue-200">Sim → Auxiliar de Enfermagem</button>
                            <button type="button" className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200"
                              onClick={() => document.getElementById("guide-q3")?.scrollIntoView({behavior:"smooth"})}>Não →</button>
                          </div>
                        </div>

                        <div id="guide-q3" className="p-3 bg-white rounded-lg border border-blue-100">
                          <p className="text-xs text-slate-700 mb-2 font-medium">3. A pessoa precisa apenas de companhia, auxílio à mobilidade, banho ou alimentação?</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => { setShowGuide(false); toast("Selecione serviços de Cuidador abaixo.", {icon:"👇"}); }}
                              className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 font-semibold hover:bg-green-200">Sim → Cuidador(a)</button>
                          </div>
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-400">Dica: você pode selecionar serviços de múltiplas categorias. O sistema encontrará o profissional com a qualificação adequada.</p>
                    </div>
                  )}

                  {[
                    {label:"Cuidador(a)",key:"caregiver",filter:(s)=>s,
                     desc:"Acompanhamento, companhia, auxílio à mobilidade, banho, alimentação, higiene pessoal e prevenção de quedas.",
                     notCover:"NÃO inclui: administração de medicamentos, curativos, procedimentos clínicos ou qualquer ato de enfermagem."},
                    {label:"Auxiliar de Enfermagem",key:"nursing_assistant",filter:(s)=>!(servicesMap.caregiver||[]).includes(s),
                     desc:"Todos os cuidados do Cuidador + monitoramento de sinais vitais, pressão arterial, glicemia, medicamentos orais/tópicos, insulina e curativos simples.",
                     notCover:"NÃO inclui: medicamentos injetáveis (IM/EV), curativos complexos, sondas, cateteres ou procedimentos invasivos."},
                    {label:"Técnico(a) de Enfermagem",key:"technician",filter:(s)=>!(servicesMap.nursing_assistant||[]).includes(s),
                     desc:"Todos os cuidados anteriores + medicamentos intramusculares e endovenosos, curativos complexos, cuidados com traqueostomia, sondas, cateteres e cuidados paliativos.",
                     notCover:"NÃO inclui: ventilação mecânica, nutrição parenteral, avaliação clínica de enfermagem ou elaboração de plano de cuidados."},
                    {label:"Enfermeiro(a)",key:"nurse",filter:(s)=>!(servicesMap.technician||[]).includes(s),
                     desc:"Todos os procedimentos anteriores + ventilação mecânica domiciliar, nutrição parenteral, cuidados críticos, avaliação clínica, plano de cuidados, PICC e Port-a-Cath.",
                     notCover:"Categoria mais completa — cobre todos os procedimentos de enfermagem permitidos por lei."},
                  ].map(group=>(
                    <div key={group.key} className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-3 py-2">
                        <p className="text-xs font-semibold text-navy uppercase tracking-wide">{group.label}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{group.desc}</p>
                        <p className="text-[10px] text-red-400 mt-0.5">{group.notCover}</p>
                      </div>
                      <div className="p-2 space-y-0.5">
                        {(servicesMap[group.key]||[]).filter(group.filter).map(svc=>(
                          <label key={svc} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                            selectedSvcs.includes(svc) ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50 border border-transparent"}`}>
                            <input type="checkbox" checked={selectedSvcs.includes(svc)} onChange={()=>toggleService(svc)} className="w-4 h-4 accent-blue-500 flex-shrink-0"/>
                            <span className={`text-sm ${selectedSvcs.includes(svc)?"text-navy font-medium":"text-slate-600"}`}>{svc}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 44i: Visually distinct when nothing selected + 44d: count */}
              {selectedSvcs.length > 0 ? (
                <p className="text-xs text-blue-600 mt-2 font-medium">✓ {selectedSvcs.length} serviço(s) selecionado(s)</p>
              ) : Object.keys(servicesMap).length > 0 ? (
                <p className="text-xs text-red-500 mt-2 font-medium">⚠ Selecione pelo menos um serviço para continuar</p>
              ) : null}

              {/* 44h: One-line confirmation of selected services */}
              {selectedSvcs.length > 0 && (
                <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded-lg">
                  <p className="text-xs text-blue-700"><strong>Resumo:</strong> {selectedSvcs.slice(0,3).join(", ")}{selectedSvcs.length>3?` +${selectedSvcs.length-3} mais`:""}</p>
                </div>
              )}

              {selectedSvcs.some(s => s.toLowerCase().includes("medicamento") || s.toLowerCase().includes("insulina")) && (
                <div className="flex items-start gap-2 p-3 mt-2 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5"/>
                  <p className="text-xs text-amber-700">
                    <strong>Aviso legal:</strong> A administração de medicamentos requer prescrição médica válida.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="form-label">Data *</label>
              <input className="form-input" type="date"
                min={new Date().toISOString().split("T")[0]}
                value={date} onChange={e=>setDate(e.target.value)}/>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Horário de início *</label>
                <input className="form-input" type="time" value={startTime} onChange={e=>setStartTime(e.target.value)}/>
              </div>
              <div>
                <label className="form-label">Horário de término *</label>
                <input className="form-input" type="time" value={endTime} onChange={e=>setEndTime(e.target.value)}/>
              </div>
            </div>

            {/* Auto-calculated duration display */}
            {durationInfo && (
              <div className={`p-3 rounded-xl border ${durationInfo.totalMinutes < 120 ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className={durationInfo.totalMinutes < 120 ? "text-red-500" : "text-blue-500"} />
                    <span className="text-sm font-semibold text-navy">
                      Duração: {durationInfo.hours}h{durationInfo.minutes > 0 ? `${durationInfo.minutes}min` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {durationInfo.isOvernight && <span className="text-xs text-purple-600 font-medium">Pernoite</span>}
                  </div>
                </div>
                {durationInfo.totalMinutes < 120 && (
                  <p className="text-xs text-red-600 mt-1">Duração mínima é 2 horas</p>
                )}
              </div>
            )}

            {/* Long booking recommendation */}
            {durationInfo && durationInfo.totalMinutes > 720 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5"/>
                <p className="text-xs text-amber-700">
                  <strong>Recomendação:</strong> Para atendimentos acima de 12 horas, considere dividir entre dois profissionais para garantir a qualidade do cuidado.
                </p>
              </div>
            )}

            {isUrgent && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle size={16} className="text-red-500"/>
                <p className="text-xs text-red-600 font-medium">Solicitação urgente (menos de 12h) — acréscimo de 20%</p>
              </div>
            )}

            {/* Emergency contact — required for both modes */}
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Em caso de emergência, contactar</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="form-label">Nome completo *</label>
                  <input className="form-input" value={emergencyContact.name} onChange={e=>setEmergencyContact(p=>({...p,name:e.target.value}))} placeholder="Nome do contato de emergência"/></div>
                <div><label className="form-label">Telefone *</label>
                  <input className="form-input" type="tel" value={emergencyContact.phone} onChange={e=>setEmergencyContact(p=>({...p,phone:e.target.value}))} placeholder="(11) 99999-9999"/></div>
              </div>
            </div>

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
                <p className="text-slate-500 text-sm mb-4">Não há profissionais disponíveis para os serviços selecionados no momento.</p>
                <p className="text-slate-500 text-sm mb-4">Deseja ser notificado quando um profissional compatível estiver disponível?</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button onClick={async()=>{
                    try{
                      await axios.post(`${API}/api/alerts`,{
                        alert_type:"patient", services:selectedSvcs,
                        preferred_date:date, preferred_time:startTime,
                        duration_hours:durationInfo?.hours||2, radius_km:50,
                      },{headers});
                      toast.success("Alerta criado! Você será notificado quando houver um profissional disponível.");
                    }catch{toast.error("Erro ao criar alerta.");}
                  }} className="btn-primary flex items-center justify-center gap-2">
                    🔔 Notifique-me
                  </button>
                  <button onClick={()=>setStep(1)} className="btn-outline">← Voltar e ajustar</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 mb-2">{professionals.length} profissional(is) disponível(is)</p>
                {professionals.map(pro=>{
                  // Calculate final price for this pro
                  const proPrice = pro.total_price || pro.base_price || null;
                  return (
                  <div key={pro.id} className="card p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600">
                            {(pro.full_name||"?")?.[0]}
                          </div>
                          <div>
                            <p className="font-semibold text-navy text-sm">{pro.full_name||"Profissional"}</p>
                            <p className="text-xs text-slate-500">{ROLE_LABELS[pro.role]||pro.role} · {pro.city}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                            <Star size={13} className="fill-amber-400 text-amber-400"/> {pro.rating_avg?.toFixed(1) || "—"} <span className="text-slate-400">({pro.rating_count || 0})</span>
                          </div>
                          <VerifiedBadge type="professional" verified={pro.approval_status === "approved"} size="sm" />
                          {pro.completed_count > 0 && (
                            <span className="text-xs text-slate-400">{pro.completed_count} atendimento(s)</span>
                          )}
                        </div>
                        {pro.bio && (
                          <p className="text-xs text-slate-500 mt-2 line-clamp-2">{pro.bio}</p>
                        )}
                        {pro.specialties?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {pro.specialties.slice(0,3).map(s=>(
                              <span key={s} className="text-[10px] px-2 py-0.5 bg-green-50 text-green-600 rounded-full font-medium">{s}</span>
                            ))}
                          </div>
                        )}
                        {pro.markup_pct > 0 && (
                          <span className="text-[10px] text-slate-400 mt-1 block">+{pro.markup_pct}% acréscimo profissional</span>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(pro.services_offered||[]).slice(0,3).map(s=>(
                            <span key={s} className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">{s}</span>
                          ))}
                          {(pro.services_offered||[]).length>3 && (
                            <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">+{pro.services_offered.length-3}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {proPrice && (
                          <div className="text-right">
                            <p className="text-lg font-bold text-green-700">R$ {Number(proPrice).toFixed(0)}</p>
                            <p className="text-[10px] text-slate-400">valor estimado</p>
                          </div>
                        )}
                        <button onClick={()=>handleSelectPro(pro)} disabled={loading}
                          className="btn-primary text-sm px-4 py-2 disabled:opacity-60">
                          {loading&&selectedPro?.id===pro.id?"...":"Agendar"}
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })}
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
              <div className="flex justify-between"><span className="text-slate-500">Duração</span><span className="font-medium text-navy">{priceResult.duration_hours}h ({priceResult.duration_minutes}min)</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Data</span><span className="font-medium text-navy">{new Date(`${date}T${startTime}`).toLocaleString("pt-BR")} – {endTime}</span></div>
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
                  <span className="text-slate-500">Taxa inicial ({priceResult.initial_fee_minutes || 120}min inclusos)</span>
                  <span>R${priceResult.initial_fee?.toFixed(2)}</span>
                </div>
                {priceResult.extra_day_minutes > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Horas diurnas extras ({priceResult.extra_day_minutes}min × R${priceResult.day_rate}/h)</span>
                    <span>R${priceResult.day_cost?.toFixed(2)}</span>
                  </div>
                )}
                {priceResult.extra_night_minutes > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Horas noturnas extras ({priceResult.extra_night_minutes}min × R${priceResult.night_rate}/h)</span>
                    <span>R${priceResult.night_cost?.toFixed(2)}</span>
                  </div>
                )}
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

            <p className="text-[10px] text-slate-400 mb-3 text-center">
              A CuidaU é uma plataforma de tecnologia. Não fornece materiais médicos, medicamentos ou equipamentos. O cliente deve garantir que todos os materiais necessários estejam disponíveis antes do atendimento.
            </p>

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