import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Upload, CheckCircle, Clock, XCircle, AlertTriangle, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";
import VerificationCenter from "../../components/common/VerificationCenter";
import AvailabilityCalendar from "../../components/professional/AvailabilityCalendar";

const API    = process.env.REACT_APP_API_URL || "http://localhost:8000";
const STATES = ["SP","RJ","MG","RS","PR","BA","CE","GO","DF","SC","PE","Outro"];
const MARKUP_OPTIONS = [0,5,10,15,20,25,30];

const DOC_KEYS = ["photo_id","diploma","coren_negative","criminal","selfie","vaccination"];
const DOC_NURSING_ONLY = { coren_negative: true };

const DocStatusBadge = ({status}) => {
  const { t } = useTranslation();
  if (!status) return <span className="text-xs text-slate-400">{t("pro_profile.doc_status_none")}</span>;
  const map = {
    approved:{color:"bg-green-100 text-green-700", icon:<CheckCircle size={12}/>},
    pending: {color:"bg-amber-100 text-amber-700",icon:<Clock size={12}/>},
    rejected:{color:"bg-red-100 text-red-600",    icon:<XCircle size={12}/>},
    replacement_requested:{color:"bg-orange-100 text-orange-700",icon:<AlertTriangle size={12}/>},
  };
  const s = map[status]||map.pending;
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${s.color}`}>{s.icon}{t(`pro_profile.doc_status_${status}`)}</span>;
};

const UploadZone = ({docType,label,note,existingDoc,onUploaded,onDeleted}) => {
  const { t } = useTranslation();
  const [uploading,setUploading] = useState(false);
  const [deleting,setDeleting] = useState(false);
  const token   = localStorage.getItem("token");
  const headers = {Authorization:`Bearer ${token}`};

  const handleChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = ["image/jpeg","image/png","image/jpg","application/pdf"];
    if (!allowed.includes(file.type)) { toast.error(t("pro_profile.upload_invalid_type")); return; }
    if (file.size > 10*1024*1024)     { toast.error(t("pro_profile.upload_too_large")); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("doc_type", docType);
      const {data} = await axios.post(`${API}/api/documents/upload`, formData, {
        headers:{...headers,"Content-Type":"multipart/form-data"},
      });
      if (!data || (!data.id && !data.url)) { toast.error(t("pro_profile.upload_invalid_response")); setUploading(false); return; }
      toast.success(t("pro_profile.upload_success", { label }));
      onUploaded(data);
    } catch(err) {
      const status = err.response?.status; const detail = err.response?.data?.detail || err.message;
      console.error(`[48b] Upload failed: doc_type=${docType}, status=${status}, detail=${detail}`);
      toast.error(t("pro_profile.upload_failed", { status: status||t("pro_profile.network"), detail: detail||t("pro_profile.try_again") }));
    } finally { setUploading(false); }
  };

  const handleDelete = async () => {
    if (!existingDoc?.id) return;
    if (!window.confirm(t("pro_profile.confirm_delete_doc", { label }))) return;
    setDeleting(true);
    try {
      const {data} = await axios.delete(`${API}/api/documents/${existingDoc.id}`, {headers});
      toast.success(data.message || t("pro_profile.doc_deleted"));
      onDeleted?.(existingDoc.id);
    } catch(err) {
      toast.error(err.response?.data?.detail || t("pro_profile.doc_delete_error"));
    } finally { setDeleting(false); }
  };

  const canDelete = existingDoc && existingDoc.status !== "approved";

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div><p className="text-sm font-semibold text-navy">{label}</p><p className="text-xs text-slate-500 mt-0.5">{note}</p></div>
        <DocStatusBadge status={existingDoc?.status}/>
      </div>
      {existingDoc?.file_url && !existingDoc.file_url.includes("placeholder.com") && (
        <a href={existingDoc.file_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline block mb-2">{t("pro_profile.view_doc")} ↗</a>
      )}
      {existingDoc?.status === "rejected" && existingDoc?.rejection_reason && (
        <div className="flex items-start gap-2 p-2 mb-2 bg-red-50 border border-red-200 rounded-lg">
          <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5"/>
          <div>
            <p className="text-xs text-red-600"><span className="font-semibold">{t("pro_profile.rejection_reason")}:</span> {existingDoc.rejection_reason}</p>
            {existingDoc.admin_feedback && existingDoc.admin_feedback !== existingDoc.rejection_reason && (
              <p className="text-xs text-red-500 mt-0.5"><span className="font-semibold">{t("pro_profile.message")}:</span> {existingDoc.admin_feedback}</p>
            )}
          </div>
        </div>
      )}
      {existingDoc?.status === "replacement_requested" && (
        <div className="flex items-start gap-2 p-2 mb-2 bg-orange-50 border border-orange-200 rounded-lg">
          <AlertTriangle size={14} className="text-orange-500 flex-shrink-0 mt-0.5"/>
          <div>
            <p className="text-xs text-orange-600 font-semibold">{t("pro_profile.doc_status_replacement_requested")}</p>
            {(existingDoc.admin_feedback || existingDoc.rejection_reason) && (
              <p className="text-xs text-orange-500 mt-0.5">{existingDoc.admin_feedback || existingDoc.rejection_reason}</p>
            )}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className={`flex items-center gap-2 cursor-pointer w-fit px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
          uploading?"bg-slate-200 text-slate-400 cursor-not-allowed":"bg-blue-100 text-blue-700 hover:bg-blue-200"}`}>
          <Upload size={13}/>
          <input type="file" className="hidden" onChange={(e) => {
            if (existingDoc && !window.confirm(t("pro_profile.confirm_replace_doc"))) {
              e.target.value = ""; return;
            }
            handleChange(e);
          }} accept=".jpg,.jpeg,.png,.pdf" disabled={uploading}/>
          {uploading ? t("pro_profile.uploading") : existingDoc ? t("pro_profile.replace_doc") : t("pro_profile.send_doc")}
        </label>
        {canDelete && (
          <button onClick={handleDelete} disabled={deleting}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition-colors">
            <Trash2 size={12}/> {deleting ? "..." : t("pro_profile.delete")}
          </button>
        )}
      </div>
    </div>
  );
};

const VerificationBanner = ({approvalStatus,hasAllDocs,docs=[]}) => {
  const { t } = useTranslation();
  if (approvalStatus==="approved") return null;
  const rejectedDocs = docs.filter(d=>d.status==="rejected");
  const approvedDocs = docs.filter(d=>d.status==="approved");
  return (
    <div className={`rounded-xl p-4 mb-6 flex items-start gap-3 ${
      approvalStatus==="rejected"||rejectedDocs.length>0?"bg-red-50 border border-red-200":"bg-amber-50 border border-amber-200"}`}>
      <AlertTriangle size={20} className={approvalStatus==="rejected"||rejectedDocs.length>0?"text-red-500":"text-amber-500"}/>
      <div>
        <p className={`font-semibold text-sm ${approvalStatus==="rejected"||rejectedDocs.length>0?"text-red-700":"text-amber-700"}`}>
          {rejectedDocs.length>0 ? t("pro_profile.banner_docs_rejected", { count: rejectedDocs.length })
            :approvalStatus==="rejected" ? t("pro_profile.banner_registration_rejected") : t("pro_profile.banner_pending_verification")}
        </p>
        <p className={`text-xs mt-0.5 ${approvalStatus==="rejected"||rejectedDocs.length>0?"text-red-600":"text-amber-600"}`}>
          {rejectedDocs.length>0
            ? t("pro_profile.banner_fix_rejected")
            :!hasAllDocs
            ? t("pro_profile.banner_send_all_docs")
            : t("pro_profile.banner_docs_sent")}
        </p>
        {approvedDocs.length>0 && (
          <p className="text-xs text-green-600 mt-1">{t("pro_profile.banner_approved_count", { count: approvedDocs.length })}</p>
        )}
      </div>
    </div>
  );
};

const CAREGIVER_TERMS_KEY = "pro_profile.caregiver_terms";

const CategorySwitch = ({ userId, currentRole }) => {
  const { t } = useTranslation();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const [catData, setCatData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [independentMode, setIndependentMode] = useState(false);
  const [indCorenNum, setIndCorenNum] = useState("");
  const [indCorenState, setIndCorenState] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState("");

  const roleLabel = (role) => t(`pro_profile.role_${role}`);

  const VERIFY_COLOR = { approved: "bg-green-100 text-green-700", pending: "bg-amber-100 text-amber-700", rejected: "bg-red-100 text-red-600" };

  const loadCategories = () => {
    axios.get(`${API}/api/professionals/categories`, { headers })
      .then(r => setCatData(r.data))
      .catch(() => setCatData({ original_role: currentRole, active_category: currentRole, available_to_add: [], categories: [] }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadCategories(); }, []);

  const handleSwitch = async (target) => {
    if (target !== currentRole && !accepted) { toast.error(t("pro_profile.cat_accept_terms_error")); return; }
    setSwitching(true); setBlocked(false);
    try {
      const { data } = await axios.post(`${API}/api/professionals/switch-category`, {
        target_category: target, accept_terms: true,
      }, { headers });
      toast.success(data.message);
      setAccepted(false); setSelectedTarget(null);
      loadCategories();
    } catch (err) {
      const msg = err.response?.data?.detail || t("pro_profile.cat_switch_error");
      if (msg.includes("pendentes") || msg.includes("Conclua")) { setBlocked(true); setBlockReason(msg); }
      toast.error(msg);
    } finally { setSwitching(false); }
  };

  const handleDeactivate = async (cat) => {
    try {
      const { data } = await axios.post(`${API}/api/professionals/category/${cat}/deactivate`, {}, { headers });
      toast.success(data.message); loadCategories();
    } catch (err) { toast.error(err.response?.data?.detail || t("pro_profile.error_generic")); }
  };

  const handleReactivate = async (cat) => {
    try {
      const { data } = await axios.post(`${API}/api/professionals/category/${cat}/reactivate`, {}, { headers });
      toast.success(data.message); loadCategories();
    } catch (err) { toast.error(err.response?.data?.detail || t("pro_profile.error_generic")); }
  };

  if (loading || !catData) return null;

  return (
    <div className="card p-6" id="categories">
      <h3 className="font-semibold text-navy mb-1">{t("pro_profile.cat_title")}</h3>
      <p className="text-xs text-slate-500 mb-4">{t("pro_profile.cat_subtitle", { role: roleLabel(currentRole) })}</p>

      {/* 45h: Category records list */}
      <div className="space-y-2 mb-4">
        {/* Primary role — always shown */}
        <div className={`p-3 rounded-xl border-2 ${catData.active_category === currentRole ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-navy">{roleLabel(currentRole)}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{t("pro_profile.cat_primary")}</span>
              {catData.active_category === currentRole && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{t("pro_profile.cat_active")}</span>}
            </div>
            {catData.active_category !== currentRole && (
              <button onClick={() => handleSwitch(currentRole)} className="text-xs text-blue-600 font-semibold hover:underline">{t("pro_profile.cat_activate")}</button>
            )}
          </div>
        </div>

        {/* Additional category records */}
        {(catData.categories || []).map(cat => (
          <div key={cat.role} className={`p-3 rounded-xl border-2 ${
            catData.active_category === cat.role ? "border-green-500 bg-green-50" :
            !cat.is_active ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200"}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-navy">{roleLabel(cat.role)}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${VERIFY_COLOR[cat.verification_status] || VERIFY_COLOR.pending}`}>
                    {cat.verification_status === "approved" ? t("pro_profile.cat_verified") : cat.verification_status === "rejected" ? t("pro_profile.cat_rejected") : t("pro_profile.cat_pending_status")}
                  </span>
                  {catData.active_category === cat.role && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{t("pro_profile.cat_active")}</span>}
                  {!cat.is_active && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">{t("pro_profile.cat_deactivated")}</span>}
                </div>
                <p className="text-xs text-slate-500">{t("pro_profile.cat_rates", { day: cat.rate_day, night: cat.rate_night })}</p>
              </div>
              <div className="flex gap-1.5">
                {cat.is_active && catData.active_category !== cat.role && (
                  <button onClick={() => { setSelectedTarget(cat.role); setAccepted(false); }} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 font-semibold hover:bg-blue-100">{t("pro_profile.cat_activate")}</button>
                )}
                {cat.is_active && cat.role !== currentRole && (
                  <button onClick={() => handleDeactivate(cat.role)} className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500 font-semibold hover:bg-red-100">{t("pro_profile.cat_deactivate")}</button>
                )}
                {!cat.is_active && (
                  <button onClick={() => handleReactivate(cat.role)} className="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-600 font-semibold hover:bg-green-100">{t("pro_profile.cat_reactivate")}</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add new category — derived (terms only) or independent (needs docs) */}
      {catData.available_to_add?.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-500 mb-2">{t("pro_profile.cat_add_label")}:</p>
          <div className="flex flex-wrap gap-2">
            {catData.available_to_add.map(cat => (
              <button key={cat} onClick={() => { setSelectedTarget(cat); setAccepted(false); setIndependentMode(false); }}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-semibold hover:bg-blue-100">
                + {roleLabel(cat)}
              </button>
            ))}
          </div>
          {/* 45d: Independent category — roles NOT in derived list */}
          {["nurse","technician","nursing_assistant","caregiver"].filter(c =>
            c !== currentRole && !(catData.available_to_add || []).includes(c) && !(catData.categories || []).some(r => r.role === c)
          ).length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-slate-400 mb-1">{t("pro_profile.cat_independent_label")}:</p>
              <div className="flex flex-wrap gap-2">
                {["nurse","technician","nursing_assistant","caregiver"].filter(c =>
                  c !== currentRole && !(catData.available_to_add || []).includes(c) && !(catData.categories || []).some(r => r.role === c)
                ).map(cat => (
                  <button key={cat} onClick={() => { setSelectedTarget(cat); setAccepted(false); setIndependentMode(true); }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 font-semibold hover:bg-purple-100">
                    + {roleLabel(cat)} ({t("pro_profile.cat_independent")})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Terms acceptance for derived switching */}
      {selectedTarget && !independentMode && selectedTarget !== currentRole && (
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 mb-3">
          <p className="text-sm font-semibold text-navy mb-2">{t("pro_profile.cat_terms_for", { role: roleLabel(selectedTarget) })}</p>
          <label className="flex items-start gap-3 cursor-pointer mb-3">
            <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} className="accent-blue-500 mt-0.5" />
            <span className="text-xs text-slate-600">{t("pro_profile.cat_terms_confirm")}</span>
          </label>
          <div className="flex gap-2">
            <button onClick={() => setSelectedTarget(null)} className="btn-outline text-xs flex-1">{t("pro_profile.cancel")}</button>
            <button onClick={() => handleSwitch(selectedTarget)} disabled={!accepted || switching}
              className="btn-primary text-xs flex-1 disabled:opacity-50">{switching ? "..." : t("pro_profile.confirm")}</button>
          </div>
        </div>
      )}

      {/* 45d: Independent category — shows doc requirements */}
      {selectedTarget && independentMode && (
        <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 mb-3">
          <p className="text-sm font-semibold text-navy mb-2">{t("pro_profile.cat_add_independent", { role: roleLabel(selectedTarget) })}</p>
          <p className="text-xs text-slate-500 mb-3">{t("pro_profile.cat_independent_docs_required")}</p>
          {selectedTarget !== "caregiver" && (
            <div className="space-y-2 mb-3">
              <input className="form-input text-sm" placeholder={t("pro_profile.cat_coren_placeholder")} value={indCorenNum} onChange={e => setIndCorenNum(e.target.value)} />
              <input className="form-input text-sm" placeholder={t("pro_profile.cat_state_placeholder")} value={indCorenState} onChange={e => setIndCorenState(e.target.value)} maxLength={2} />
            </div>
          )}
          <label className="flex items-start gap-3 cursor-pointer mb-3">
            <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} className="accent-blue-500 mt-0.5" />
            <span className="text-xs text-slate-600">{t("pro_profile.cat_independent_terms")}</span>
          </label>
          <div className="flex gap-2">
            <button onClick={() => { setSelectedTarget(null); setIndependentMode(false); }} className="btn-outline text-xs flex-1">{t("pro_profile.cancel")}</button>
            <button onClick={async () => {
              if (!accepted) { toast.error(t("pro_profile.cat_accept_terms_error")); return; }
              setSwitching(true);
              try {
                const { data } = await axios.post(`${API}/api/professionals/add-independent-category`, {
                  category: selectedTarget, accept_terms: true,
                  council_number: indCorenNum || null, council_state: indCorenState || null,
                }, { headers });
                toast.success(data.message);
                setSelectedTarget(null); setIndependentMode(false);
                loadCategories();
              } catch (err) { toast.error(err.response?.data?.detail || t("pro_profile.error_generic")); }
              finally { setSwitching(false); }
            }} disabled={!accepted || switching}
              className="btn-primary text-xs flex-1 disabled:opacity-50">{switching ? "..." : t("pro_profile.cat_add_category")}</button>
          </div>
        </div>
      )}

      {blocked && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5"/>
          <p className="text-xs text-amber-700">{blockReason}</p>
        </div>
      )}
    </div>
  );
};

const ProfessionalProfile = () => {
  const { t } = useTranslation();
  const navigate  = useNavigate();
  const userId    = localStorage.getItem("user_id");
  const token     = localStorage.getItem("token");
  const headers   = {Authorization:`Bearer ${token}`};

  // 2-B: Read role from localStorage but override from backend if needed
  const [activeRole, setActiveRole] = useState(localStorage.getItem("role") || "nurse");
  const role = activeRole;

  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState("");
  const [servicesMap,    setServicesMap]     = useState({});
  const [user,           setUser]           = useState({full_name:"",phone:"",cpf:"",email:""});
  const [prof,           setProf]           = useState({council_number:"",council_state:"",services_offered:[],specialties:[],service_radius:15,city:"",state:"",markup_pct:0});
  const [docs,           setDocs]           = useState([]);
  const [approvalStatus, setApprovalStatus] = useState("pending");
  const [pricingTable,   setPricingTable]   = useState(null);
  const [specialtiesOptions, setSpecialtiesOptions] = useState([]);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/professionals/services`),
      axios.get(`${API}/api/users/${userId}`, {headers}),
      axios.get(`${API}/api/professionals/${userId}`, {headers}).catch(()=>({data:{}})),
      axios.get(`${API}/api/documents/my-documents`, {headers}).catch(()=>({data:[]})),
    ]).then(([svcRes,uRes,pRes,dRes]) => {
      setServicesMap(svcRes.data);
      setUser(uRes.data);

      // 2-B: Detect actual pro role from multiple sources
      let detectedRole = localStorage.getItem("role");
      const proRoles = ["nurse","technician","nursing_assistant","caregiver"];

      // Source 1: Professional record's professional_category
      if (pRes.data?.professional_category && proRoles.includes(pRes.data.professional_category)) {
        detectedRole = pRes.data.professional_category;
      }
      // Source 2: User's role if it's a pro role
      else if (uRes.data.role && proRoles.includes(uRes.data.role)) {
        detectedRole = uRes.data.role;
      }
      // Source 3: Roles list from localStorage
      else {
        const roles = JSON.parse(localStorage.getItem("roles") || "[]");
        const foundRole = roles.find(r => proRoles.includes(r));
        if (foundRole) detectedRole = foundRole;
      }
      // Source 4: council_type=COREN → default nurse
      if (!proRoles.includes(detectedRole) && pRes.data?.council_type === "COREN") {
        detectedRole = "nurse";
      }
      // Final fallback
      if (!proRoles.includes(detectedRole)) detectedRole = "nurse";

      setActiveRole(detectedRole);
      localStorage.setItem("role", detectedRole);

      // Fetch pricing table for detected role
      if (detectedRole !== "client" && detectedRole !== "admin") {
        axios.get(`${API}/api/professionals/pricing-table/${detectedRole}`).then(r => setPricingTable(r.data)).catch(()=>{});
        axios.get(`${API}/api/professionals/specialties/${detectedRole}`).then(r => setSpecialtiesOptions(r.data.specialties||[])).catch(()=>{});
      }
      if (pRes.data?.id) {
        setProf({
          council_number:   pRes.data.council_number||"",
          council_state:    pRes.data.council_state||"",
          services_offered: pRes.data.services_offered||[],
          service_radius:   pRes.data.service_radius||15,
          city:             pRes.data.city||"",
          state:            pRes.data.state||"",
          markup_pct:       pRes.data.markup_pct||0,
        });
        setApprovalStatus(pRes.data.approval_status||"pending");
      }
      setDocs(Array.isArray(dRes.data)?dRes.data:[]);
    }).catch(()=>setError(t("pro_profile.load_error")))
    .finally(()=>setLoading(false));
  },[userId]);

  const setU = k => e => setUser(p=>({...p,[k]:e.target.value}));
  const setP = k => e => setProf(p=>({...p,[k]:e.target.value}));

  const toggleService = (svc) => {
    setProf(p=>({
      ...p,
      services_offered: p.services_offered.includes(svc)
        ? p.services_offered.filter(s=>s!==svc)
        : [...p.services_offered, svc]
    }));
  };

  // Services available for this role
  const availableServices = servicesMap[role] || [];

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      await axios.patch(`${API}/api/users/${userId}`, {full_name:user.full_name,phone:user.phone,cpf:user.cpf}, {headers});
      await axios.patch(`${API}/api/users/${userId}/professional-profile`, {
        council_number:   prof.council_number,
        council_state:    prof.council_state,
        services_offered: prof.services_offered,
        service_radius:   parseInt(prof.service_radius)||15,
        city:             prof.city,
        state:            prof.state,
        markup_pct:       parseInt(prof.markup_pct)||0,
      }, {headers});
      localStorage.setItem("full_name", user.full_name);
      toast.success(t("pro_profile.save_success"));
    } catch { setError(t("pro_profile.save_error")); }
    finally { setSaving(false); }
  };

  const getDoc = (type) => docs.find(d=>d.doc_type===type);
  const isNursingRole = ["nurse","technician","nursing_assistant"].includes(role);
  const requiredDocs = isNursingRole ? ["photo_id","diploma","criminal","selfie","coren_negative"] : ["photo_id","diploma","criminal","selfie"];
  const filteredDocKeys = DOC_KEYS.filter(key => !DOC_NURSING_ONLY[key] || isNursingRole);
  const hasAllDocs   = requiredDocs.every(tp=>docs.some(d=>d.doc_type===tp&&d.file_url));
  const handleDocUploaded = (newDoc) => {
    setDocs(prev => {
      const idx = prev.findIndex(d=>d.doc_type===newDoc.doc_type);
      if (idx>=0) { const u=[...prev]; u[idx]={...u[idx],...newDoc}; return u; }
      return [...prev,newDoc];
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm"/>
        <div className="flex items-center gap-3"><LanguageSwitcher/><ProfileMenu/></div>
      </nav>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={()=>navigate("/dashboard/professional")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-500 mb-6 transition-colors">
          <ArrowLeft size={16}/> {t("pro_profile.back_to_dashboard")}
        </button>
        <h1 className="font-display text-2xl font-bold text-navy mb-6">{t("pro_profile.page_title")}</h1>

        {loading ? (
          <p className="text-slate-400 text-center py-10">{t("pro_profile.loading")}</p>
        ) : (
          <div className="space-y-5">
            <VerificationBanner approvalStatus={approvalStatus} hasAllDocs={hasAllDocs} docs={docs}/>
            <VerificationCenter role={role} userId={userId} />

            {/* Personal info */}
            <div className="card p-6">
              <h3 className="font-semibold text-navy mb-4">{t("pro_profile.personal_info")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="form-label">{t("pro_profile.full_name")}</label><input className="form-input" value={user.full_name} onChange={setU("full_name")}/></div>
                <div><label className="form-label">{t("pro_profile.cpf")}</label><input className="form-input" value={user.cpf||""} onChange={setU("cpf")}/></div>
                <div><label className="form-label">{t("pro_profile.email")}</label><input className="form-input bg-slate-50 text-slate-400 cursor-not-allowed" value={user.email} readOnly/></div>
                <div><label className="form-label">{t("pro_profile.whatsapp")}</label><input className="form-input" value={user.phone||""} onChange={setU("phone")} placeholder="(11) 99999-9999"/></div>
              </div>
            </div>

            {/* Professional details */}
            <div className="card p-6">
              <h3 className="font-semibold text-navy mb-4">{t("pro_profile.professional_details")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div><label className="form-label">{t("pro_profile.coren_number")}</label><input className="form-input" value={prof.council_number} onChange={setP("council_number")} placeholder="123456"/></div>
                <div>
                  <label className="form-label">{t("pro_profile.coren_state")}</label>
                  <select className="form-input" value={prof.council_state} onChange={setP("council_state")}>
                    <option value="">{t("pro_profile.select")}</option>
                    {STATES.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="form-label">{t("pro_profile.city")}</label><input className="form-input" value={prof.city} onChange={setP("city")}/></div>
                <div>
                  <label className="form-label">{t("pro_profile.state")}</label>
                  <select className="form-input" value={prof.state} onChange={setP("state")}>
                    <option value="">{t("pro_profile.select")}</option>
                    {STATES.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="form-label">{t("pro_profile.service_radius")}</label><input className="form-input" type="number" value={prof.service_radius} onChange={setP("service_radius")}/></div>
              </div>

              {/* Specialties */}
              {specialtiesOptions.length > 0 && (
                <div className="mt-4">
                  <label className="form-label">{t("pro_profile.specialties_label")}</label>
                  <p className="text-xs text-slate-400 mb-2">{t("pro_profile.specialties_desc")}</p>
                  <div className="space-y-1">
                    {specialtiesOptions.map(spec => {
                      const selected = (prof.specialties || []).includes(spec);
                      return (
                        <label key={spec} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                          <input type="checkbox" checked={selected} onChange={() => {
                            const current = prof.specialties || [];
                            const updated = selected ? current.filter(s => s !== spec) : [...current, spec];
                            setProf(p => ({ ...p, specialties: updated }));
                          }} className="w-4 h-4 accent-blue-500 flex-shrink-0"/>
                          <span className={`text-sm ${selected ? "text-navy font-medium" : "text-slate-600"}`}>{spec}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <label className="form-label">{t("pro_profile.markup_label")}</label>
                <select className="form-input" value={prof.markup_pct} onChange={setP("markup_pct")}>
                  {MARKUP_OPTIONS.map(m=>(
                    <option key={m} value={m}>{m===0 ? t("pro_profile.markup_none") : t("pro_profile.markup_above", { pct: m })}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">{t("pro_profile.markup_note")}</p>
              </div>

              {/* Platform pricing table */}
              {pricingTable && (
                <div className="mt-6">
                  <label className="form-label">{t("pro_profile.pricing_label")}</label>
                  <p className="text-xs text-slate-400 mb-3">{t("pro_profile.pricing_desc", { markup: prof.markup_pct||0 })}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                      <p className="text-xs font-semibold text-amber-600 uppercase mb-1">{t("pro_profile.pricing_day")}</p>
                      <p className="text-xl font-bold text-navy">R$ {((pricingTable.day_rate * (1 + (prof.markup_pct||0)/100)) * 0.88).toFixed(2)}<span className="text-xs text-slate-400">{t("pro_profile.per_hour")}</span></p>
                      <p className="text-[10px] text-slate-400 mt-1">{t("pro_profile.pricing_base", { rate: pricingTable.day_rate, markup: prof.markup_pct||0 })}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200">
                      <p className="text-xs font-semibold text-indigo-600 uppercase mb-1">{t("pro_profile.pricing_night")}</p>
                      <p className="text-xl font-bold text-navy">R$ {((pricingTable.night_rate * (1 + (prof.markup_pct||0)/100)) * 0.88).toFixed(2)}<span className="text-xs text-slate-400">{t("pro_profile.per_hour")}</span></p>
                      <p className="text-[10px] text-slate-400 mt-1">{t("pro_profile.pricing_base", { rate: pricingTable.night_rate, markup: prof.markup_pct||0 })}</p>
                    </div>
                  </div>
                  <div className="mt-3 p-3 rounded-xl bg-green-50 border border-green-200">
                    <p className="text-xs font-semibold text-green-600 uppercase mb-1">{t("pro_profile.pricing_initial_fee")}</p>
                    <p className="text-lg font-bold text-navy">R$ {pricingTable.initial_fee?.toFixed(2)} <span className="text-xs text-slate-400">{t("pro_profile.pricing_initial_note")}</span></p>
                  </div>
                </div>
              )}

              {/* Services offered */}
              <div>
                <label className="form-label">{t("pro_profile.services_label")}</label>
                <p className="text-xs text-slate-400 mb-3">{t("pro_profile.services_desc")}</p>
                {availableServices.length===0 ? (
                  <p className="text-slate-400 text-sm">{t("pro_profile.services_loading")}</p>
                ) : (
                  <div className="space-y-4">
                    {[
                      {label:t("pro_profile.svc_group_basic"),svcs:servicesMap.caregiver||[]},
                      {label:t("pro_profile.svc_group_nursing_basic"),svcs:(servicesMap.nursing_assistant||[]).filter(s=>!(servicesMap.caregiver||[]).includes(s))},
                      {label:t("pro_profile.svc_group_technical"),svcs:(servicesMap.technician||[]).filter(s=>!(servicesMap.nursing_assistant||[]).includes(s))},
                      {label:t("pro_profile.svc_group_specialized"),svcs:(servicesMap.nurse||[]).filter(s=>!(servicesMap.technician||[]).includes(s))},
                    ].filter(g=>g.svcs.some(s=>availableServices.includes(s))).map(group=>(
                      <div key={group.label}>
                        <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">{group.label}</p>
                        <div className="flex flex-wrap gap-2">
                          {group.svcs.filter(s=>availableServices.includes(s)).map(svc=>(
                            <button key={svc} type="button" onClick={()=>toggleService(svc)}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                prof.services_offered.includes(svc)
                                  ?"bg-blue-500 text-white border-blue-500"
                                  :"border-slate-200 text-slate-600 hover:border-blue-400"
                              }`}>{svc}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {prof.services_offered.length>0 && (
                  <p className="text-xs text-blue-600 mt-3 font-medium">{t("pro_profile.services_selected", { count: prof.services_offered.length })}</p>
                )}
              </div>
            </div>

            {/* Availability Calendar */}
            <div className="card p-6">
              <AvailabilityCalendar userId={userId} />
            </div>

            {/* Category Switch (V9-6 / Change 43) */}
            {["nurse","technician","nursing_assistant"].includes(role) && (
              <CategorySwitch userId={userId} currentRole={role} />
            )}

            {/* Documents */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-navy">{t("pro_profile.documents_title")}</h3>
                {hasAllDocs && approvalStatus==="pending" && (
                  <span className="text-xs text-amber-600 font-medium">{t("pro_profile.documents_under_review")}</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-4">{t("pro_profile.documents_desc")}</p>
              <div className="space-y-3">
                {filteredDocKeys.map(key=>(
                  <UploadZone key={key} docType={key} label={t(`pro_profile.doc_${key}_label`)} note={t(`pro_profile.doc_${key}_note`)}
                    existingDoc={getDoc(key)} onUploaded={handleDocUploaded}
                    onDeleted={() => { setDocs(prev => prev.filter(d => d.doc_type !== key)); }}/>
                ))}
              </div>
            </div>

            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium">{error}</div>}

            <button onClick={handleSave} disabled={saving}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60">
              <Save size={16}/>{saving ? t("pro_profile.saving") : t("pro_profile.save")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfessionalProfile;