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
    if (saving) return;  // double-tap guard
    setSaving(true);
    try {
      const res = await axios.post(`${API}/api/ratings`, {
        booking_id:  booking.id,
        reviewee_id: revieweeId,
        rating,
        comment: comment?.trim() || null,
      }, { headers });
      // Verify we got a real assessment back (not an unexpected empty response)
      if (!res?.data?.id) {
        console.error("[RATING] Unexpected response:", res?.data);
        toast.error(t("rating_modal.submit_error"));
        return;
      }
      toast.success(t("rating_modal.submitted"));
      onDone?.(res.data);
      onClose?.();
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      console.error(`[RATING] Submit failed: status=${status}, detail=${detail}`, err);
      toast.error(detail || `${t("rating_modal.submit_error")}${status ? ` (${status})` : ""}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    // BUG FIX (24/11/2026): when this modal is mounted INSIDE another modal
    // that already has `onClick={onClose}` on its backdrop container
    // (ClientBookingDetailModal and BookingDetailModal do this), every
    // click on a star, textarea or button here bubbles up to the parent's
    // backdrop handler and silently closes the whole stack — the user
    // saw the history card instead of saving the rating. stopPropagation
    // on the outermost div stops the bubble before it reaches the parent.
    // We also bump z-index to z-[60] so this always sits above z-50
    // parent modals.
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      onClick={(e) => e.stopPropagation()}>
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

        {/* Flex-wrap + min-w-0 prevents the "Enviar avaliação" button from
            overflowing past the modal edge on narrow mobile screens. */}
        <div className="flex flex-wrap gap-2">
          <button onClick={onClose} className="btn-outline flex-1 min-w-0 whitespace-nowrap">
            {t("rating_modal.cancel")}
          </button>
          <button onClick={handleSubmit} disabled={saving || !rating}
            className="btn-primary flex-1 min-w-0 whitespace-nowrap disabled:opacity-60 text-center overflow-hidden text-ellipsis">
            {saving ? t("rating_modal.submitting") : t("rating_modal.submit")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RatingModal;