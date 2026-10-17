import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Shield, CheckCircle } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const CATEGORY_KEYS = [
  { value: "nurse", requiresCoren: true },
  { value: "technician", requiresCoren: true },
  { value: "nursing_assistant", requiresCoren: true },
  { value: "caregiver", requiresCoren: false },
];

const BecomeProfessional = () => {
  const { t }    = useTranslation();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const fullName = localStorage.getItem("full_name") || "";
  const email = localStorage.getItem("email") || "";
  const headers = { Authorization: `Bearer ${token}` };

  const [selectedRole, setSelectedRole] = useState(null);
  const [corenNumber, setCorenNumber] = useState("");
  const [corenState, setCorenState] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!selectedRole) { toast.error(t("become_pro.error_select_category")); return; }
    const cat = CATEGORY_KEYS.find(c => c.value === selectedRole);
    if (cat.requiresCoren && (!corenNumber || !corenState)) {
      toast.error(t("become_pro.error_coren_required"));
      return;
    }

    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/auth/become-professional`, {
        professional_role: selectedRole,
        council_number: corenNumber || null,
        council_state: corenState || null,
      }, { headers });

      toast.success(data.message);

      // Update localStorage with new roles
      const currentRoles = JSON.parse(localStorage.getItem("roles") || "[]");
      if (!currentRoles.includes(selectedRole)) currentRoles.push(selectedRole);
      localStorage.setItem("roles", JSON.stringify(currentRoles));
      localStorage.setItem("has_pro", "true");

      setDone(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || t("become_pro.error_create"));
    } finally { setLoading(false); }
  };

  if (done) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <CheckCircle size={56} className="mx-auto mb-4 text-green-500" />
        <h2 className="font-display text-2xl font-bold text-navy mb-2">{t("become_pro.profile_created")}</h2>
        <p className="text-sm text-slate-500 mb-6">{t("become_pro.send_docs")}</p>
        <button onClick={() => { localStorage.setItem("role", selectedRole); navigate("/profile/professional"); }}
          className="btn-primary w-full mb-2">{t("become_pro.go_to_pro")}</button>
        <button onClick={() => navigate("/dashboard/client")}
          className="btn-outline w-full">{t("become_pro.back_to_client")}</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" /><ProfileMenu />
      </nav>

      <div className="max-w-md mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft size={20}/></button>
          <div>
            <h1 className="font-display text-2xl font-bold text-navy">{t("become_pro.title")}</h1>
            <p className="text-xs text-slate-500">{t("become_pro.subtitle")}</p>
          </div>
        </div>

        {/* Pre-filled identity data */}
        <div className="card p-4 mb-4 bg-green-50 border border-green-200">
          <p className="text-xs font-semibold text-green-700 uppercase mb-2">{t("become_pro.reused_data")}</p>
          <p className="text-sm text-navy">{fullName}</p>
          <p className="text-xs text-slate-500">{email}</p>
        </div>

        {/* Category selection */}
        <div className="card p-5 mb-4">
          <p className="font-semibold text-navy mb-3">{t("become_pro.select_category")}</p>
          <div className="space-y-2">
            {CATEGORY_KEYS.map(cat => (
              <button key={cat.value} onClick={() => setSelectedRole(cat.value)}
                className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                  selectedRole === cat.value ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
                <p className="text-sm font-semibold text-navy">{t(`become_pro.categories.${cat.value}.label`)}</p>
                <p className="text-xs text-slate-500">{t(`become_pro.categories.${cat.value}.desc`)}</p>
                {cat.requiresCoren && <p className="text-[10px] text-blue-500 mt-1">{t("become_pro.requires_coren")}</p>}
              </button>
            ))}
          </div>
        </div>

        {/* COREN fields (if required) */}
        {selectedRole && CATEGORY_KEYS.find(c => c.value === selectedRole)?.requiresCoren && (
          <div className="card p-5 mb-4">
            <p className="font-semibold text-navy mb-3 flex items-center gap-2"><Shield size={16} className="text-blue-500"/> {t("become_pro.coren_registration")}</p>
            <div className="space-y-3">
              <div>
                <label className="form-label">{t("become_pro.coren_number")}</label>
                <input className="form-input" placeholder={t("become_pro.coren_placeholder")} value={corenNumber}
                  onChange={e => setCorenNumber(e.target.value.replace(/\D/g, "").slice(0, 7))}
                  inputMode="numeric" pattern="[0-9]*" />
                {corenNumber && (corenNumber.length < 4 || corenNumber.length > 7) && (
                  <p className="text-xs text-red-500 mt-1">{t("become_pro.coren_digits_error")}</p>
                )}
              </div>
              <div>
                <label className="form-label">{t("become_pro.coren_state")}</label>
                <select className="form-input" value={corenState} onChange={e => setCorenState(e.target.value)}>
                  <option value="">{t("become_pro.select_state")}</option>
                  {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map(uf => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading || !selectedRole}
          className="btn-primary w-full disabled:opacity-50">
          {loading ? t("become_pro.creating") : t("become_pro.create")}
        </button>

        <p className="text-[10px] text-slate-400 text-center mt-3">
          {t("become_pro.after_note")}
        </p>
      </div>
    </div>
  );
};

export default BecomeProfessional;