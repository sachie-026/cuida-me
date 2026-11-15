import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, MapPin, Loader, Save } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const emptyForm = {
  label: "", cep: "", street: "", number: "", complement: "",
  neighborhood: "", city: "", state: "", reference: "", is_default: false,
};

/** Add / edit a Service Address.
 * Props: address (existing row or null for new), onClose, onSaved(row) */
const ServiceAddressModal = ({ address, onClose, onSaved }) => {
  const { t } = useTranslation();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [form, setForm] = useState(emptyForm);
  const [cepLoading, setCepLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (address) {
      setForm({
        label: address.label || "",
        cep: address.cep || "",
        street: address.street || "",
        number: address.number || "",
        complement: address.complement || "",
        neighborhood: address.neighborhood || "",
        city: address.city || "",
        state: address.state || "",
        reference: address.reference || "",
        is_default: !!address.is_default,
      });
    } else {
      setForm(emptyForm);
    }
  }, [address?.id]);

  const set = (k) => (e) => {
    const v = e?.target ? e.target.value : e;
    setForm((p) => ({ ...p, [k]: v }));
  };

  // CEP autofill — ViaCEP via backend proxy
  const handleCepBlur = async () => {
    const digits = (form.cep || "").replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/addresses/cep/${digits}`, { headers });
      setForm((p) => ({
        ...p,
        street: data.street || p.street,
        neighborhood: data.neighborhood || p.neighborhood,
        city: data.city || p.city,
        state: data.state || p.state,
        cep: data.cep || p.cep,
      }));
    } catch (err) {
      if (err.response?.status === 404) {
        toast(t("service_address.cep_not_found"));
      } else {
        toast.error(t("service_address.cep_error"));
      }
    } finally {
      setCepLoading(false);
    }
  };

  const handleSave = async () => {
    // Minimal validation — street + number + city + state
    if (!form.street.trim() || !form.city.trim() || !form.state.trim()) {
      toast.error(t("service_address.required_fields"));
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, cep: form.cep?.replace(/\D/g, "") || null };
      let row;
      if (address?.id) {
        const { data } = await axios.patch(`${API}/api/addresses/${address.id}`, payload, { headers });
        row = data;
      } else {
        const { data } = await axios.post(`${API}/api/addresses`, payload, { headers });
        row = data;
      }
      toast.success(t("service_address.saved"));
      onSaved?.(row);
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("service_address.save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-navy flex items-center gap-2">
            <MapPin size={18} className="text-blue-500" />
            {address?.id ? t("service_address.edit_title") : t("service_address.add_title")}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="form-label">{t("service_address.label")}</label>
            <input className="form-input" value={form.label} onChange={set("label")} placeholder={t("service_address.label_placeholder")} />
          </div>

          <div>
            <label className="form-label">{t("service_address.cep")}</label>
            <div className="relative">
              <input className="form-input pr-10" value={form.cep} onChange={set("cep")} onBlur={handleCepBlur} placeholder="00000-000" maxLength={9} />
              {cepLoading && (
                <Loader size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-400" />
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="form-label">{t("service_address.street")} *</label>
              <input className="form-input" value={form.street} onChange={set("street")} />
            </div>
            <div>
              <label className="form-label">{t("service_address.number")}</label>
              <input className="form-input" value={form.number} onChange={set("number")} />
            </div>
          </div>

          <div>
            <label className="form-label">{t("service_address.complement")}</label>
            <input className="form-input" value={form.complement} onChange={set("complement")} placeholder={t("service_address.complement_placeholder")} />
          </div>

          <div>
            <label className="form-label">{t("service_address.neighborhood")}</label>
            <input className="form-input" value={form.neighborhood} onChange={set("neighborhood")} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="form-label">{t("service_address.city")} *</label>
              <input className="form-input" value={form.city} onChange={set("city")} />
            </div>
            <div>
              <label className="form-label">{t("service_address.state")} *</label>
              <input className="form-input" value={form.state} onChange={set("state")} maxLength={2} placeholder="SP" />
            </div>
          </div>

          <div>
            <label className="form-label">{t("service_address.reference")}</label>
            <textarea className="form-input" rows={2} value={form.reference} onChange={set("reference")} placeholder={t("service_address.reference_placeholder")} />
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input type="checkbox" checked={!!form.is_default} onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))} className="accent-blue-500 w-4 h-4" />
            <span className="text-sm text-slate-600">{t("service_address.make_default")}</span>
          </label>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50">
            {saving ? <><Loader size={14} className="animate-spin" /> {t("service_address.saving")}</>
                    : <><Save size={14} /> {t("service_address.save")}</>}
          </button>
          <button onClick={onClose} disabled={saving} className="btn-outline flex-1">
            {t("service_address.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ServiceAddressModal;