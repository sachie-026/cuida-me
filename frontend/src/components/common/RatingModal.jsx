import { useState } from "react";
import { X, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const RatingModal = ({ booking, revieweeId, onClose, onDone }) => {
  const { t } = useTranslation();
  const [rating,  setRating]  = useState(0);
  const [hover,   setHover]   = useState(0);
  const [comment, setComment] = useState("");
  const [saving,  setSaving]  = useState(false);
  const token   = localStorage.getItem("token");
  const userId  = localStorage.getItem("user_id");
  const headers = { Authorization: `Bearer ${token}` };

  const RATING_LABELS = ["", t("rating_modal.bad"), t("rating_modal.fair"), t("rating_modal.good"), t("rating_modal.great"), t("rating_modal.excellent")];

  const handleSubmit = async () => {
    if (!rating) { toast.error(t("rating_modal.select_rating")); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/api/ratings`, {
        booking_id:  booking.id,
        reviewer_id: userId,
        reviewee_id: revieweeId,
        rating,
        comment: comment || null,
      }, { headers });
      toast.success(t("rating_modal.submitted"));
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("rating_modal.submit_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-hover w-full max-w-md p-6 z-10">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
          <X size={18} className="text-slate-400" />
        </button>

        <h2 className="font-display text-xl font-bold text-navy mb-1">{t("rating_modal.title")}</h2>
        <p className="text-slate-500 text-sm mb-6">{booking.service_type} · {new Date(booking.scheduled_start).toLocaleDateString("pt-BR")}</p>

        {/* Stars */}
        <div className="flex justify-center gap-2 mb-5">
          {[1,2,3,4,5].map(s => (
            <button key={s} type="button"
              onMouseEnter={() => setHover(s)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setRating(s)}
              className="transition-transform hover:scale-110">
              <Star size={36} className={`transition-colors
                ${(hover || rating) >= s ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
            </button>
          ))}
        </div>
        <p className="text-center text-sm font-medium text-slate-600 mb-5">
          {RATING_LABELS[hover || rating] || t("rating_modal.select_score")}
        </p>

        <div className="mb-5">
          <label className="form-label">{t("rating_modal.comment_label", { required: rating <= 3 ? "*" : t("rating_modal.optional") })}</label>
          <textarea className="form-input min-h-[90px]" value={comment} onChange={e => setComment(e.target.value)}
            placeholder={t("rating_modal.comment_placeholder")} />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-outline flex-1">{t("rating_modal.cancel")}</button>
          <button onClick={handleSubmit} disabled={saving || !rating}
            className="btn-primary flex-1 disabled:opacity-60">
            {saving ? t("rating_modal.submitting") : t("rating_modal.submit")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RatingModal;