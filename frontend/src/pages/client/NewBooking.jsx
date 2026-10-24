import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Star, CheckCircle, Clock, Sun, Moon, AlertCircle } from "lucide-react";
import VerifiedBadge from "../../components/common/VerifiedBadge";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

// 24h time slots in 30-min intervals (same as professional availability)
const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

// v2: No fixed durations — Start Time + End Time with minute precision

const CATEGORY_KEYS = ["caregiver","nursing_assistant","technician","nurse"];

const RELATION_KEYS = ["parent","spouse","child","grandparent","other_family","friend","other"];
const GENDER_KEYS   = ["male","female","other","prefer_not"];

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
  const { t }      = useTranslation();
  const navigate   = useNavigate();
  const userId     = localStorage.getItem("user_id");
  const token      = localStorage.getItem("token");
  const headers    = {Authorization:`Bearer ${token}`};

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
      setSvcLoadState("error"); setSvcError(t("client_booking.timeout_error"));
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
          setSvcError(t("client_booking.no_services_error"));
        }
      })
      .catch((err) => {
        clearTimeout(timeout);
        console.error(`[44c] Critical load failed: ${err.message}, userId=${userId}`);
        setSvcError(t("client_booking.unexpected_error"));
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
    if (selectedSvcs.length===0) { toast.error(t("client_booking.select_service_error")); return; }
    if (!date || !startTime || !endTime) { toast.error(t("client_booking.fill_datetime_error")); return; }
    if (!durationInfo || durationInfo.totalMinutes < 120) { toast.error(t("client_booking.min_duration_error")); return; }
    if (!emergencyContact.name || !emergencyContact.phone) { toast.error(t("client_booking.emergency_required")); return; }
    setLoading(true);
    const svcParam = encodeURIComponent(selectedSvcs.join(","));
    // Send local date+time without UTC conversion — availability slots are stored in local time
    const startLocal = `${date}T${startTime}:00`;
    let endLocal = `${date}T${endTime}:00`;
    // Handle overnight: if end <= start, bump to next day
    if (endTime <= startTime) {
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      endLocal = `${nextDay.toISOString().split("T")[0]}T${endTime}:00`;
    }
    axios.get(`${API}/api/professionals/nearby?services=${svcParam}&start_time=${encodeURIComponent(startLocal)}&end_time=${encodeURIComponent(endLocal)}`, {headers})
      .then(r => { setProfessionals(r.data.professionals||[]); setStep(2); })
      .catch(() => toast.error(t("client_booking.search_error")))
      .finally(() => setLoading(false));
  };

  const handleSelectPro = async (pro) => {
    setSelectedPro(pro);
    setLoading(true);
    // Send local date+time without UTC conversion — pricing uses local time
    const startLocal = `${date}T${startTime}:00`;
    let endLocal = `${date}T${endTime}:00`;
    if (endTime <= startTime) {
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      endLocal = `${nextDay.toISOString().split("T")[0]}T${endTime}:00`;
    }
    try {
      const priceRes = await axios.post(`${API}/api/professionals/calculate-price`, {
        professional_id: pro.id,
        start_time: startLocal,
        end_time: endLocal,
        is_urgent: isUrgent, distance_km: 0,
      }, {headers});
      if (!priceRes.data?.total) {
        toast.error(t("client_booking.price_calc_error"));
        return;
      }
      setPriceResult(priceRes.data);
      setStep(3);
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.message;
      toast.error(detail || t("client_booking.price_calc_generic_error"));
    }
    finally { setLoading(false); }
  };

  const handleConfirm = async () => {
    if (!selectedPro||!priceResult) { toast.error(t("client_booking.select_pro_first")); return; }
    setSubmitting(true);
    try {
      // Ensure patient record exists — auto-create for "myself" mode if needed
      let activePatient = patient;
      if (!activePatient) {
        const userName = localStorage.getItem("full_name") || t("client_booking.default_patient");
        const patRes = await axios.post(`${API}/api/users/${userId}/patient`, {
          patient_name: patientMode === "myself" ? userName : patientForm.patient_name,
          age: patientMode === "other" ? (parseInt(patientForm.age)||null) : null,
          relation: patientMode === "other" ? patientForm.relation : "self",
          address: patientMode === "other" ? patientForm.address : "",
          is_own_account: patientMode === "myself",
          emergency_contact_name: emergencyContact.name,
          emergency_contact_phone: emergencyContact.phone,
        }, {headers});
        activePatient = patRes.data;
        setPatient(activePatient);
      }
      // Send local date+time without UTC conversion — consistent with search and pricing
      const startLocal = `${date}T${startTime}:00`;
      let endLocal = `${date}T${endTime}:00`;
      if (endTime <= startTime) {
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        endLocal = `${nextDay.toISOString().split("T")[0]}T${endTime}:00`;
      }
      await axios.post(`${API}/api/bookings`, {
        patient_id: activePatient.id, professional_id: selectedPro.id,
        service_type: selectedSvcs.join(", "), services: selectedSvcs,
        duration_hours: durationInfo?.hours || Math.round(durationInfo?.totalMinutes/60),
        shift,
        scheduled_start: startLocal, scheduled_end: endLocal,
        is_urgent: isUrgent, distance_km: 0,
        markup_pct: selectedPro.markup_pct || 0,
        notes,
      }, {headers});
      toast.success(t("client_booking.booking_created"));
      navigate("/dashboard/client");
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.message;
      toast.error(detail || t("client_booking.booking_error"));
    }
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
          <ArrowLeft size={16}/> {step>1?t("client_booking.back"):t("client_booking.cancel")}
        </button>
        <h1 className="font-display text-2xl font-bold text-navy mb-1">{t("client_booking.title")}</h1>
        <p className="text-slate-500 text-sm mb-6">{t("client_booking.step_of", { step, total: 3 })}</p>
        <StepDots total={3} current={step}/>

        {/* 47a: Verification gate — docs block, phone is informational until SMS goes live */}
        {!isVerified && (
          <div className="card p-6 mb-4 border-2 border-amber-300 bg-amber-50">
            <div className="flex items-start gap-3">
              <AlertCircle size={24} className="text-amber-500 flex-shrink-0 mt-0.5"/>
              <div>
                <p className="font-bold text-navy mb-1">{t("client_booking.verify_needed")}</p>
                <p className="text-sm text-slate-600 mb-2">{t("client_booking.verify_send_docs")}</p>
                <button onClick={()=>navigate("/profile/client")} className="btn-primary text-sm">{t("client_booking.verify_identity")}</button>
              </div>
            </div>
          </div>
        )}
        {isVerified && !phoneVerified && (
          <div className="card p-4 mb-4 border border-blue-200 bg-blue-50">
            <div className="flex items-center gap-3">
              <span className="text-lg">📱</span>
              <div className="flex-1">
                <p className="text-sm text-blue-700 font-medium">{t("client_booking.phone_verify_pending")}</p>
                <p className="text-xs text-blue-500">{t("client_booking.phone_verify_desc")}</p>
              </div>
            </div>
          </div>
        )}

        {step===1 && (
          <div className={`card p-6 space-y-5 ${!isVerified ? "opacity-50 pointer-events-none" : ""}`}>
            {/* Patient picker */}
            <div>
              <label className="form-label">{t("client_booking.who_receives")} *</label>
              <div className="flex gap-2 mt-1">
                {[{key:"myself",labelKey:"patient_myself"},{key:"other",labelKey:"patient_other"}].map(o=>(
                  <button key={o.key} type="button" onClick={()=>setPatientMode(o.key)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                      patientMode===o.key?"bg-blue-500 text-white border-blue-500":"border-slate-200 text-slate-600 hover:border-blue-400"
                    }`}>{t(`client_booking.${o.labelKey}`)}</button>
                ))}
              </div>
            </div>

            {patientMode==="other" && (
              <div className="space-y-3 p-4 bg-slate-50 rounded-xl">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("client_booking.patient_data")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="form-label">{t("client_booking.patient_name")} *</label><input className="form-input" value={patientForm.patient_name} onChange={e=>setPatientForm(p=>({...p,patient_name:e.target.value}))}/></div>
                  <div><label className="form-label">{t("client_booking.patient_age")}</label><input className="form-input" type="number" value={patientForm.age} onChange={e=>setPatientForm(p=>({...p,age:e.target.value}))}/></div>
                  <div><label className="form-label">{t("client_booking.patient_relation")} *</label>
                    <select className="form-input" value={patientForm.relation} onChange={e=>setPatientForm(p=>({...p,relation:e.target.value}))}>
                      <option value="">{t("client_booking.select_placeholder")}</option>
                      {RELATION_KEYS.map(k=><option key={k} value={t(`client_booking.relations.${k}`)}>{t(`client_booking.relations.${k}`)}</option>)}
                    </select>
                  </div>
                  <div><label className="form-label">{t("client_booking.patient_gender")}</label>
                    <select className="form-input" value={patientForm.gender} onChange={e=>setPatientForm(p=>({...p,gender:e.target.value}))}>
                      <option value="">{t("client_booking.select_placeholder")}</option>
                      {GENDER_KEYS.map(k=><option key={k} value={t(`client_booking.genders.${k}`)}>{t(`client_booking.genders.${k}`)}</option>)}
                    </select>
                  </div>
                </div>
                <div><label className="form-label">{t("client_booking.patient_address")} *</label><input className="form-input" value={patientForm.address} onChange={e=>setPatientForm(p=>({...p,address:e.target.value}))}/></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="form-label">{t("client_booking.patient_phone")}</label><input className="form-input" type="tel" value={patientForm.phone} onChange={e=>setPatientForm(p=>({...p,phone:e.target.value}))}/></div>
                  <div><label className="form-label">{t("client_booking.patient_emergency")}</label><input className="form-input" value={patientForm.emergency_name} onChange={e=>setPatientForm(p=>({...p,emergency_name:e.target.value}))}/></div>
                </div>
                <div><label className="form-label">{t("client_booking.patient_diagnosis")}</label><textarea className="form-input min-h-[60px]" value={patientForm.diagnoses} onChange={e=>setPatientForm(p=>({...p,diagnoses:e.target.value}))}/></div>
              </div>
            )}

            <div>
              <label className="form-label">{t("client_booking.services_needed")} * <span className="text-slate-400 font-normal">({t("client_booking.select_all_needed")})</span></label>

              {/* 44b: Loading state (15s cap) */}
              {Object.keys(servicesMap).length===0 && !svcError && (
                <div className="flex items-center gap-3 p-4 mt-2 bg-slate-50 rounded-xl">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                  <span className="text-sm text-slate-500">{t("client_booking.loading_services")}</span>
                </div>
              )}

              {/* 44b: Error state with retry */}
              {svcError && (
                <div className="p-4 mt-2 bg-red-50 border border-red-200 rounded-xl text-center">
                  <p className="text-sm text-red-600 mb-2">{svcError}</p>
                  <button onClick={loadData} className="btn-primary text-sm">{t("client_booking.try_again")}</button>
                </div>
              )}

              {/* 44b: Content state */}
              {Object.keys(servicesMap).length > 0 && (
                <div className="mt-2 space-y-4">

                  {/* 44f: "Not sure which one you need?" */}
                  <button type="button" onClick={() => setShowGuide(!showGuide)}
                    className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1">
                    {showGuide ? `✕ ${t("client_booking.close_help")}` : `🤔 ${t("client_booking.not_sure")}`}
                  </button>

                  {/* 44g: Guided fallback — step-by-step questions */}
                  {showGuide && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-4">
                      <p className="text-sm font-semibold text-navy">{t("client_booking.guide_title")}</p>

                      <div className="space-y-3">
                        <div className="p-3 bg-white rounded-lg border border-blue-100">
                          <p className="text-xs text-slate-700 mb-2 font-medium">{t("client_booking.guide_q1")}</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => { setShowGuide(false); toast(t("client_booking.guide_a1_toast"), {icon:"👇"}); }}
                              className="text-xs px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 font-semibold hover:bg-purple-200">{t("client_booking.guide_a1")}</button>
                            <button type="button" className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200"
                              onClick={() => document.getElementById("guide-q2")?.scrollIntoView({behavior:"smooth"})}>{t("client_booking.guide_no")}</button>
                          </div>
                        </div>

                        <div id="guide-q2" className="p-3 bg-white rounded-lg border border-blue-100">
                          <p className="text-xs text-slate-700 mb-2 font-medium">{t("client_booking.guide_q2")}</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => { setShowGuide(false); toast(t("client_booking.guide_a2_toast"), {icon:"👇"}); }}
                              className="text-xs px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 font-semibold hover:bg-blue-200">{t("client_booking.guide_a2")}</button>
                            <button type="button" className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200"
                              onClick={() => document.getElementById("guide-q3")?.scrollIntoView({behavior:"smooth"})}>{t("client_booking.guide_no")}</button>
                          </div>
                        </div>

                        <div id="guide-q3" className="p-3 bg-white rounded-lg border border-blue-100">
                          <p className="text-xs text-slate-700 mb-2 font-medium">{t("client_booking.guide_q3")}</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => { setShowGuide(false); toast(t("client_booking.guide_a3_toast"), {icon:"👇"}); }}
                              className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 font-semibold hover:bg-green-200">{t("client_booking.guide_a3")}</button>
                          </div>
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-400">{t("client_booking.guide_tip")}</p>
                    </div>
                  )}

                  {CATEGORY_KEYS.map(catKey=>{
                    const filterFn = catKey === "caregiver" ? (s) => s
                      : catKey === "nursing_assistant" ? (s) => !(servicesMap.caregiver||[]).includes(s)
                      : catKey === "technician" ? (s) => !(servicesMap.nursing_assistant||[]).includes(s)
                      : (s) => !(servicesMap.technician||[]).includes(s);
                    return (
                    <div key={catKey} className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-3 py-2">
                        <p className="text-xs font-semibold text-navy uppercase tracking-wide">{t(`roles.${catKey}`)}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{t(`client_booking.categories.${catKey}.desc`)}</p>
                        <p className="text-[10px] text-red-400 mt-0.5">{t(`client_booking.categories.${catKey}.not_cover`)}</p>
                      </div>
                      <div className="p-2 space-y-0.5">
                        {(servicesMap[catKey]||[]).filter(filterFn).map(svc=>(
                          <label key={svc} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                            selectedSvcs.includes(svc) ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50 border border-transparent"}`}>
                            <input type="checkbox" checked={selectedSvcs.includes(svc)} onChange={()=>toggleService(svc)} className="w-4 h-4 accent-blue-500 flex-shrink-0"/>
                            <span className={`text-sm ${selectedSvcs.includes(svc)?"text-navy font-medium":"text-slate-600"}`}>{svc}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}

              {/* 44i: Visually distinct when nothing selected + 44d: count */}
              {selectedSvcs.length > 0 ? (
                <p className="text-xs text-blue-600 mt-2 font-medium">✓ {t("client_booking.services_selected", { count: selectedSvcs.length })}</p>
              ) : Object.keys(servicesMap).length > 0 ? (
                <p className="text-xs text-red-500 mt-2 font-medium">⚠ {t("client_booking.select_at_least_one")}</p>
              ) : null}

              {/* 44h: One-line confirmation of selected services */}
              {selectedSvcs.length > 0 && (
                <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded-lg">
                  <p className="text-xs text-blue-700"><strong>{t("client_booking.summary")}:</strong> {selectedSvcs.slice(0,3).join(", ")}{selectedSvcs.length>3?` +${selectedSvcs.length-3} ${t("client_booking.more")}`:""}</p>
                </div>
              )}

              {selectedSvcs.some(s => s.toLowerCase().includes("medicamento") || s.toLowerCase().includes("insulina")) && (
                <div className="flex items-start gap-2 p-3 mt-2 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5"/>
                  <p className="text-xs text-amber-700">
                    <strong>{t("client_booking.legal_warning_title")}:</strong> {t("client_booking.legal_warning")}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="form-label">{t("client_booking.date")} *</label>
              <input className="form-input" type="date"
                min={new Date().toISOString().split("T")[0]}
                value={date} onChange={e=>setDate(e.target.value)}/>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">{t("client_booking.start_time")} *</label>
                <select className="form-input" value={startTime} onChange={e=>setStartTime(e.target.value)}>
                  <option value="">{t("client_booking.select_time")}</option>
                  {TIMES.map(tp => <option key={tp} value={tp}>{tp}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">{t("client_booking.end_time")} *</label>
                <select className="form-input" value={endTime} onChange={e=>setEndTime(e.target.value)}>
                  <option value="">{t("client_booking.select_time")}</option>
                  {TIMES.map(tp => <option key={tp} value={tp}>{tp}</option>)}
                </select>
              </div>
            </div>

            {/* Auto-calculated duration display */}
            {durationInfo && (
              <div className={`p-3 rounded-xl border ${durationInfo.totalMinutes < 120 ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className={durationInfo.totalMinutes < 120 ? "text-red-500" : "text-blue-500"} />
                    <span className="text-sm font-semibold text-navy">
                      {t("client_booking.duration")}: {durationInfo.hours}h{durationInfo.minutes > 0 ? `${durationInfo.minutes}min` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {durationInfo.isOvernight && <span className="text-xs text-purple-600 font-medium">{t("client_booking.overnight")}</span>}
                  </div>
                </div>
                {durationInfo.totalMinutes < 120 && (
                  <p className="text-xs text-red-600 mt-1">{t("client_booking.min_2h")}</p>
                )}
              </div>
            )}

            {/* Long booking recommendation */}
            {durationInfo && durationInfo.totalMinutes > 720 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5"/>
                <p className="text-xs text-amber-700">
                  <strong>{t("client_booking.recommendation")}:</strong> {t("client_booking.long_booking_tip")}
                </p>
              </div>
            )}

            {isUrgent && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle size={16} className="text-red-500"/>
                <p className="text-xs text-red-600 font-medium">{t("client_booking.urgent_surcharge")}</p>
              </div>
            )}

            {/* Emergency contact — required for both modes */}
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">{t("client_booking.emergency_title")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="form-label">{t("client_booking.emergency_name")} *</label>
                  <input className="form-input" value={emergencyContact.name} onChange={e=>setEmergencyContact(p=>({...p,name:e.target.value}))} placeholder={t("client_booking.emergency_name_placeholder")}/></div>
                <div><label className="form-label">{t("client_booking.emergency_phone")} *</label>
                  <input className="form-input" type="tel" value={emergencyContact.phone} onChange={e=>setEmergencyContact(p=>({...p,phone:e.target.value}))} placeholder="(11) 99999-9999"/></div>
              </div>
            </div>

            <div>
              <label className="form-label">{t("client_booking.observations")}</label>
              <textarea className="form-input min-h-[80px]" value={notes} onChange={e=>setNotes(e.target.value)}
                placeholder={t("client_booking.observations_placeholder")}/>
            </div>

            <button onClick={handleStep1Next} disabled={loading} className="btn-primary w-full disabled:opacity-60">
              {loading?t("client_booking.searching"):t("client_booking.choose_pro")}
            </button>
          </div>
        )}

        {step===2 && (
          <div>
            {professionals.length===0 ? (
              <div className="card p-8 text-center">
                <p className="text-navy font-semibold mb-2">{t("client_booking.no_pro_available")}</p>
                <p className="text-slate-500 text-sm mb-4">{t("client_booking.no_pro_desc")}</p>
                <p className="text-slate-500 text-sm mb-4">{t("client_booking.notify_question")}</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button onClick={async()=>{
                    try{
                      await axios.post(`${API}/api/alerts`,{
                        alert_type:"patient", services:selectedSvcs,
                        preferred_date:date, preferred_time:startTime,
                        duration_hours:durationInfo?.hours||2, radius_km:50,
                      },{headers});
                      toast.success(t("client_booking.alert_created"));
                    }catch{toast.error(t("client_booking.alert_error"));}
                  }} className="btn-primary flex items-center justify-center gap-2">
                    🔔 {t("client_booking.notify_me")}
                  </button>
                  <button onClick={()=>setStep(1)} className="btn-outline">{t("client_booking.go_back_adjust")}</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 mb-2">{t("client_booking.pros_available", { count: professionals.length })}</p>
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
                            <p className="font-semibold text-navy text-sm">{pro.full_name||t("client_booking.pro_fallback")}</p>
                            <p className="text-xs text-slate-500">{t(`roles.${pro.role}`)||pro.role} · {pro.city}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                            <Star size={13} className="fill-amber-400 text-amber-400"/> {pro.rating_avg?.toFixed(1) || "—"} <span className="text-slate-400">({pro.rating_count || 0})</span>
                          </div>
                          <VerifiedBadge type="professional" verified={pro.approval_status === "approved"} size="sm" />
                          {pro.completed_count > 0 && (
                            <span className="text-xs text-slate-400">{t("client_booking.completed_count", { count: pro.completed_count })}</span>
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
                          <span className="text-[10px] text-slate-400 mt-1 block">+{pro.markup_pct}% {t("client_booking.pro_markup")}</span>
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
                        {proPrice ? (
                          <div className="text-right">
                            <p className="text-lg font-bold text-green-700">R$ {Number(proPrice).toFixed(0)}</p>
                            <p className="text-[10px] text-slate-400">{t("client_booking.estimated_value")}</p>
                          </div>
                        ) : (
                          <div className="text-right">
                            <p className="text-xs text-red-400">{t("client_booking.value_unavailable")}</p>
                          </div>
                        )}
                        <button onClick={()=>handleSelectPro(pro)} disabled={loading || !proPrice}
                          className="btn-primary text-sm px-4 py-2 disabled:opacity-60">
                          {loading&&selectedPro?.id===pro.id?"...": proPrice ? t("client_booking.schedule_btn") : t("client_booking.unavailable_btn")}
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
            <h3 className="font-semibold text-navy">{t("client_booking.confirm_title")}</h3>
            <div className="bg-slate-50 rounded-xl p-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">{t("client_booking.confirm_pro")}</span><span className="font-medium text-navy">{selectedPro.full_name||"—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t("client_booking.confirm_service")}</span><span className="font-medium text-navy">{selectedSvcs.length} {t("client_booking.confirm_services_count")}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t("client_booking.confirm_duration")}</span><span className="font-medium text-navy">{priceResult.duration_hours}h ({priceResult.duration_minutes}min)</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t("client_booking.confirm_date")}</span><span className="font-medium text-navy">{new Date(`${date}T${startTime}`).toLocaleString("pt-BR")} – {endTime}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t("client_booking.confirm_patient")}</span><span className="font-medium text-navy">{patientMode==="myself"?(patient?.patient_name||t("client_booking.patient_myself")):patientForm.patient_name}</span></div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">{t("client_booking.requested_services")}</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedSvcs.map(s=><span key={s} className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">{s}</span>)}
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-5 text-center">
                <p className="text-xs text-slate-500 mb-1">{t("client_booking.total_value")}</p>
                <p className="text-3xl font-bold text-navy">R${priceResult.total?.toFixed(2)}</p>
                <p className="text-xs text-slate-400 mt-2">💳 {t("client_booking.payment_after_confirm")}</p>
              </div>
            </div>

            {isUrgent && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <Clock size={15} className="text-amber-500"/>
                <p className="text-xs text-amber-700 font-medium">{t("client_booking.urgent_notify")}</p>
              </div>
            )}

            <p className="text-[10px] text-slate-400 mb-3 text-center">
              {t("client_booking.disclaimer")}
            </p>

            <button onClick={handleConfirm} disabled={submitting}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60">
              <CheckCircle size={16}/>
              {submitting?t("client_booking.confirming"):`${t("client_booking.confirm_booking")} · R$${priceResult.total?.toFixed(2)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewBooking;