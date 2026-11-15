import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Save, Upload, CheckCircle, AlertTriangle, MapPin, Plus, Edit2, Trash2, Star } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";
import PhoneVerificationModal from "../../components/common/PhoneVerificationModal";
import VerificationCenter from "../../components/common/VerificationCenter";
import ProfilePhotoUpload from "../../components/common/ProfilePhotoUpload";
import ServiceAddressModal from "../../components/common/ServiceAddressModal";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const ClientProfile = () => {
  const { t }       = useTranslation();
  const navigate  = useNavigate();
  const userId    = localStorage.getItem("user_id");
  const token     = localStorage.getItem("token");
  const headers   = { Authorization: `Bearer ${token}` };
  const [loading, setLoading]      = useState(true);
  const [saving,  setSaving]       = useState(false);
  const [clientDocs, setClientDocs]= useState([]);
  const [docUploading, setDocUploading] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  const [user, setUser] = useState({ full_name: "", phone: "", cpf: "", email: "", is_verified: false });
  const [patient, setPatient] = useState({});
  // Change 44 — service addresses
  const [addresses, setAddresses] = useState([]);
  const [editingAddress, setEditingAddress] = useState(null); // null | row | {}
  const [showAddressModal, setShowAddressModal] = useState(false);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/users/${userId}`, { headers }),
      axios.get(`${API}/api/users/${userId}/patient`, { headers }).catch(() => ({ data: null })),
      axios.get(`${API}/api/documents/my-documents`, { headers }).catch(() => ({ data: [] })),
      axios.get(`${API}/api/addresses`, { headers }).catch(() => ({ data: [] })),
    ]).then(([uRes, pRes, docRes, aRes]) => {
      setUser(uRes.data);
      if (pRes.data) setPatient(pRes.data);
      setClientDocs(Array.isArray(docRes.data) ? docRes.data : []);
      setAddresses(Array.isArray(aRes.data) ? aRes.data : []);
    }).finally(() => setLoading(false));
  }, []);

  // ── Service-address actions ────────────────────────────────────────────────
  const openAddAddress = () => { setEditingAddress(null); setShowAddressModal(true); };
  const openEditAddress = (a) => { setEditingAddress(a); setShowAddressModal(true); };
  const onAddressSaved = (row) => {
    setAddresses(prev => {
      const idx = prev.findIndex(x => x.id === row.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = row;
        if (row.is_default) next.forEach(x => { if (x.id !== row.id) x.is_default = false; });
        return next;
      }
      const next = [row, ...prev];
      if (row.is_default) next.forEach(x => { if (x.id !== row.id) x.is_default = false; });
      return next;
    });
  };
  const setAddressDefault = async (id) => {
    try {
      await axios.patch(`${API}/api/addresses/${id}/default`, {}, { headers });
      setAddresses(prev => prev.map(x => ({ ...x, is_default: x.id === id })));
      toast.success(t("service_address.default_set"));
    } catch { toast.error(t("service_address.default_error")); }
  };
  const deleteAddress = async (id) => {
    if (!window.confirm(t("service_address.confirm_delete"))) return;
    try {
      await axios.delete(`${API}/api/addresses/${id}`, { headers });
      setAddresses(prev => prev.filter(x => x.id !== id));
      toast.success(t("service_address.deleted"));
    } catch { toast.error(t("service_address.delete_error")); }
  };

  const setU = k => e => setUser(p => ({ ...p, [k]: e.target.value }));
  const setP = k => e => setPatient(p => ({ ...p, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/api/users/${userId}`, {
        full_name: user.full_name, phone: user.phone, cpf: user.cpf,
      }, { headers });
      localStorage.setItem("full_name", user.full_name);
      toast.success(t("client_profile.toast_saved"));
    } catch {
      toast.error(t("client_profile.toast_save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" />
        <div className="flex items-center gap-3"><LanguageSwitcher /><ProfileMenu /></div>
      </nav>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={() => navigate("/dashboard/client")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-500 mb-6 transition-colors">
          <ArrowLeft size={16} /> {t("client_profile.back")}
        </button>
        <h1 className="font-display text-2xl font-bold text-navy mb-6">{t("client_profile.title")}</h1>

        {loading ? <p className="text-slate-400 text-center py-10">{t("client_profile.loading")}</p> : (
          <div className="space-y-5">
            {/* Personal info */}
            <div className="card p-6">
              <h3 className="font-semibold text-navy mb-4">{t("client_profile.personal_info")}</h3>
              <div className="mb-4">
                <ProfilePhotoUpload
                  userId={userId}
                  currentPhotoUrl={user.profile_photo_url}
                  onPhotoChange={(url) => setUser(prev => ({ ...prev, profile_photo_url: url }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="form-label">{t("client_profile.full_name")}</label><input className="form-input" value={user.full_name} onChange={setU("full_name")} /></div>
                <div><label className="form-label">{t("client_profile.cpf")}</label><input className="form-input" value={user.cpf || ""} onChange={setU("cpf")} /></div>
                <div><label className="form-label">{t("client_profile.email")}</label><input className="form-input" value={user.email} disabled className="form-input bg-slate-50 text-slate-400 cursor-not-allowed" /></div>
                <div><label className="form-label">{t("client_profile.whatsapp")}</label><input className="form-input" value={user.phone || ""} onChange={setU("phone")} placeholder="(11) 99999-9999" /></div>
              </div>
            </div>

            {/* Patient info — removed per suggestion: patient data moves to booking flow */}

            {/* Change 44 — Service Addresses */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-navy flex items-center gap-2">
                    <MapPin size={16} className="text-blue-500" />
                    {t("service_address.section_title")}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{t("service_address.section_desc")}</p>
                </div>
                <button onClick={openAddAddress} className="btn-outline text-xs flex items-center gap-1.5">
                  <Plus size={13} /> {t("service_address.add")}
                </button>
              </div>

              {addresses.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">{t("service_address.empty")}</p>
              ) : (
                <div className="space-y-2">
                  {addresses.map(a => (
                    <div key={a.id} className={`p-3 rounded-xl border ${a.is_default ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="text-sm font-semibold text-navy truncate">
                              {a.label || t("service_address.unnamed")}
                            </p>
                            {a.is_default && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
                                <Star size={9} /> {t("service_address.default")}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {[
                              a.street && a.number ? `${a.street}, ${a.number}` : a.street,
                              a.complement,
                              a.neighborhood,
                              a.city && a.state ? `${a.city} - ${a.state}` : (a.city || a.state),
                              a.cep,
                            ].filter(Boolean).join(" · ")}
                          </p>
                          {a.reference && <p className="text-[11px] text-slate-400 mt-0.5 italic">{a.reference}</p>}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {!a.is_default && (
                            <button onClick={() => setAddressDefault(a.id)}
                              title={t("service_address.make_default")}
                              className="p-1.5 rounded-lg hover:bg-white text-slate-500 hover:text-blue-600">
                              <Star size={14} />
                            </button>
                          )}
                          <button onClick={() => openEditAddress(a)}
                            title={t("service_address.edit")}
                            className="p-1.5 rounded-lg hover:bg-white text-slate-500 hover:text-blue-600">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => deleteAddress(a.id)}
                            title={t("service_address.delete")}
                            className="p-1.5 rounded-lg hover:bg-white text-slate-500 hover:text-red-500">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Verification Center */}
            <VerificationCenter role="client" userId={userId} />

            {/* Client Identity + Phone Verification */}
            <div className="card p-6">
              <h3 className="font-semibold text-navy mb-2">{t("client_profile.identity_title")}</h3>
              <p className="text-xs text-slate-500 mb-4">{t("client_profile.identity_subtitle")}</p>

              {/* 47b: Persistent verification badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${
                  user.is_verified ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                  {user.is_verified ? t("client_profile.docs_verified") : t("client_profile.docs_pending")}
                </span>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${
                  user.phone_verified ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                  {user.phone_verified ? t("client_profile.phone_verified") : t("client_profile.phone_not_verified")}
                </span>
              </div>

              {/* Phone verification section */}
              {!user.phone_verified && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl mb-4">
                  <p className="text-sm font-semibold text-navy mb-1">{t("client_profile.verify_phone_title")}</p>
                  <p className="text-xs text-slate-500 mb-3">{t("client_profile.verify_phone_desc")}</p>
                  <button onClick={() => setShowPhoneModal(true)} className="btn-primary text-sm">
                    {t("client_profile.verify_phone_btn")}
                  </button>
                </div>
              )}
              {showPhoneModal && (
                <PhoneVerificationModal
                  phone={user.phone || ""}
                  onClose={() => setShowPhoneModal(false)}
                  onVerified={() => { setUser(p => ({ ...p, phone_verified: true })); setShowPhoneModal(false); }}
                />
              )}

              {user.is_verified ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                  <CheckCircle size={16} className="text-green-500"/>
                  <span className="text-sm font-semibold text-green-700">{t("client_profile.identity_verified")}</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-3">
                    <AlertTriangle size={16} className="text-amber-500"/>
                    <span className="text-xs text-amber-700 font-medium">{t("client_profile.send_docs_prompt")}</span>
                  </div>
                  {[
                    {key:"client_id", labelKey:"doc_photo_id", noteKey:"doc_photo_id_note"},
                    {key:"client_selfie", labelKey:"doc_selfie", noteKey:"doc_selfie_note"},
                  ].map(d => {
                    const existing = clientDocs.find(cd=>cd.doc_type===d.key);
                    return (
                      <div key={d.key} className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <p className="text-sm font-semibold text-navy">{t(`client_profile.${d.labelKey}`)}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{t(`client_profile.${d.noteKey}`)}</p>
                          </div>
                          {existing ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              existing.status==="approved"?"bg-green-100 text-green-700":existing.status==="rejected"?"bg-red-100 text-red-600":"bg-amber-100 text-amber-700"
                            }`}>{existing.status==="approved"?t("client_profile.status_approved"):existing.status==="rejected"?t("client_profile.status_rejected"):t("client_profile.status_reviewing")}</span>
                          ) : <span className="text-xs text-slate-400">{t("client_profile.not_sent")}</span>}
                        </div>
                        {existing?.status==="rejected" && existing?.rejection_reason && (
                          <div className="flex items-start gap-2 p-2 mb-2 bg-red-50 border border-red-200 rounded-lg">
                            <span className="text-xs text-red-600"><strong>{t("client_profile.reason")}:</strong> {existing.rejection_reason}</span>
                          </div>
                        )}
                        <label className={`flex items-center gap-2 cursor-pointer w-fit px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          docUploading?"bg-slate-200 text-slate-400":"bg-blue-100 text-blue-700 hover:bg-blue-200"}`}>
                          <Upload size={13}/>
                          <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" disabled={docUploading} onChange={async(e)=>{
                            const file=e.target.files[0]; if(!file) return;
                            if(file.size>10*1024*1024){toast.error(t("client_profile.max_size"));return;}
                            setDocUploading(true);
                            try{
                              const fd=new FormData(); fd.append("file",file); fd.append("doc_type",d.key);
                              const{data}=await axios.post(`${API}/api/documents/upload`,fd,{headers:{...headers,"Content-Type":"multipart/form-data"}});
                              if(!data||(!data.id&&!data.url)){toast.error(t("client_profile.upload_invalid"));setDocUploading(false);return;}
                              toast.success(t("client_profile.doc_sent"));
                              setClientDocs(prev=>{const idx=prev.findIndex(x=>x.doc_type===d.key);if(idx>=0){const u=[...prev];u[idx]={...u[idx],...data};return u;}return[...prev,data];});
                            }catch(err){
                              const status=err.response?.status;const detail=err.response?.data?.detail||err.message;
                              console.error(`[48b] Upload failed: doc_type=${d.key}, status=${status}, detail=${detail}`);
                              toast.error(`${t("client_profile.upload_failed")} (${status||"rede"}): ${detail||t("client_profile.try_again")}`);
                            }finally{setDocUploading(false);}
                          }}/>
                          {docUploading?t("client_profile.uploading"):existing?t("client_profile.resend"):t("client_profile.send")}
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          <button onClick={handleSave} disabled={saving}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60">
              <Save size={16} /> {saving ? t("client_profile.saving") : t("client_profile.save")}
            </button>

            {/* 2-2: Professional profile section */}
            {(() => {
              const roles = JSON.parse(localStorage.getItem("roles") || "[]");
              const hasPro = localStorage.getItem("has_pro") === "true" || roles.some(r => ["nurse","technician","nursing_assistant","caregiver","professional_pending"].includes(r));
              const proRole = roles.find(r => ["nurse","technician","nursing_assistant","caregiver"].includes(r));

              const goToPro = (path) => {
                if (proRole) localStorage.setItem("role", proRole);
                else localStorage.setItem("role", "nurse");
                navigate(path);
              };

              return (
                <div className="card p-6 mt-4">
                  <h3 className="font-semibold text-navy mb-2">{t("client_profile.pro_section_title")}</h3>
                  {hasPro ? (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                          ✓ {proRole ? t(`roles.${proRole}`) : t("client_profile.pro_pending")}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mb-3">{t("client_profile.pro_linked")}</p>
                      <div className="flex gap-2">
                        <button onClick={() => goToPro("/profile/professional")} className="btn-primary text-sm">
                          {t("client_profile.open_pro_profile")}
                        </button>
                        <button onClick={() => goToPro("/dashboard/professional")} className="btn-outline text-sm">
                          {t("client_profile.pro_dashboard")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-slate-500 mb-3">{t("client_profile.no_pro_profile")}</p>
                      <button onClick={() => navigate("/register/professional")} className="btn-outline text-sm">
                        {t("client_profile.request_pro")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

          </div>
        )}

        {/* Change 44 — Address add/edit modal */}
        {showAddressModal && (
          <ServiceAddressModal
            address={editingAddress}
            onClose={() => setShowAddressModal(false)}
            onSaved={onAddressSaved}
          />
        )}
      </div>
    </div>
  );
};

export default ClientProfile;