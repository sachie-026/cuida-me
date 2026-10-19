import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Star, X, ThumbsUp, ThumbsDown } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

// Tags use emoji + translated labels; the full string (emoji + label) is sent to API
const TAG_KEYS_PRO_POSITIVE = [
  { key: "punctual", emoji: "⏰" },
  { key: "professional", emoji: "👩‍⚕️" },
  { key: "compassionate", emoji: "❤️" },
  { key: "respectful", emoji: "😊" },
  { key: "great_communication", emoji: "💬" },
  { key: "quality_care", emoji: "🩺" },
  { key: "reliable", emoji: "🤝" },
  { key: "followed_instructions", emoji: "📋" },
  { key: "exceeded_expectations", emoji: "🌟" },
  { key: "would_hire_again", emoji: "⭐" },
];
const TAG_KEYS_PRO_NEGATIVE = [
  { key: "arrived_late", emoji: "⏰" },
  { key: "no_show", emoji: "❌" },
  { key: "poor_communication", emoji: "💬" },
  { key: "unprofessional", emoji: "😕" },
  { key: "didnt_follow_instructions", emoji: "⚠" },
  { key: "low_quality_care", emoji: "🩺" },
  { key: "incomplete_service", emoji: "🚫" },
  { key: "disrespectful", emoji: "😠" },
  { key: "poor_hygiene", emoji: "🧹" },
  { key: "safety_concern", emoji: "🚨" },
];
const TAG_KEYS_PRO_NEUTRAL = [
  { key: "slight_delay" },
  { key: "could_improve_communication" },
  { key: "more_attention_detail" },
  { key: "better_explanation" },
  { key: "average_service" },
];
const TAG_KEYS_CLIENT_POSITIVE = [
  { key: "punctual", emoji: "⏰" },
  { key: "respectful", emoji: "😊" },
  { key: "polite", emoji: "🤝" },
  { key: "organized_environment", emoji: "🏡" },
  { key: "welcoming_family", emoji: "❤️" },
  { key: "patient_cooperative", emoji: "🙏" },
  { key: "good_communication", emoji: "💬" },
  { key: "well_prepared", emoji: "📋" },
  { key: "smooth_payment", emoji: "💳" },
  { key: "would_serve_again", emoji: "⭐" },
];
const TAG_KEYS_CLIENT_NEGATIVE = [
  { key: "client_late", emoji: "⏰" },
  { key: "family_absent", emoji: "🚫" },
  { key: "incorrect_info", emoji: "❌" },
  { key: "poor_communication", emoji: "💬" },
  { key: "disrespectful_behavior", emoji: "😠" },
  { key: "difficult_access", emoji: "🚪" },
  { key: "inadequate_environment", emoji: "🧹" },
  { key: "payment_issue", emoji: "💳" },
  { key: "materials_unavailable", emoji: "📦" },
  { key: "safety_concern", emoji: "🚨" },
];
const TAG_KEYS_CLIENT_NEUTRAL = [
  { key: "slight_delay" },
  { key: "could_improve_communication" },
  { key: "could_improve_organization" },
  { key: "family_cooperation" },
  { key: "minor_schedule_issues" },
];

const EvaluationModal = ({ booking, evaluatorRole, onClose, onSubmitted }) => {
  const { t } = useTranslation();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [comment, setComment] = useState("");
  const [wouldAgain, setWouldAgain] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const isClientEvaluating = evaluatorRole === "client";

  // Build tag list with translated labels
  const getTagLabel = (prefix, tag) => {
    const label = t(`evaluation.${prefix}.${tag.key}`);
    return tag.emoji ? `${tag.emoji} ${label}` : label;
  };

  const positiveTagKeys = isClientEvaluating ? TAG_KEYS_PRO_POSITIVE : TAG_KEYS_CLIENT_POSITIVE;
  const negativeTagKeys = isClientEvaluating ? TAG_KEYS_PRO_NEGATIVE : TAG_KEYS_CLIENT_NEGATIVE;
  const neutralTagKeys = isClientEvaluating ? TAG_KEYS_PRO_NEUTRAL : TAG_KEYS_CLIENT_NEUTRAL;
  const tagPrefix = isClientEvaluating ? "tags_pro" : "tags_client";

  const currentTagKeys = rating >= 4 ? positiveTagKeys : rating === 3 ? neutralTagKeys : rating >= 1 ? negativeTagKeys : [];
  const tagCategory = rating >= 4 ? "positive" : rating === 3 ? "neutral" : "negative";

  const toggleTag = (tagStr) => {
    setSelectedTags(prev => prev.includes(tagStr) ? prev.filter(t => t !== tagStr) : [...prev, tagStr]);
  };

  const handleSubmit = async () => {
    if (rating === 0) { toast.error(t("evaluation.select_rating")); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/ratings`, {
        booking_id: booking.id,
        rating,
        tags: selectedTags,
        comment: comment.trim(),
        would_again: wouldAgain,
        evaluator_role: evaluatorRole,
      }, { headers });
      toast.success(t("evaluation.submitted_success"));
      onSubmitted?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("evaluation.submit_error"));
    } finally { setSubmitting(false); }
  };

  const ratingLabelKey = ["", "very_bad", "bad", "average", "good", "excellent"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-navy">
            {isClientEvaluating ? t("evaluation.rate_professional") : t("evaluation.rate_client")}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* Star rating */}
        <div className="text-center mb-5">
          <div className="flex justify-center gap-1 mb-2">
            {[1,2,3,4,5].map(s => (
              <button key={s} onMouseEnter={() => setHoveredStar(s)} onMouseLeave={() => setHoveredStar(0)}
                onClick={() => { setRating(s); setSelectedTags([]); }}
                className="p-1 transition-transform hover:scale-110">
                <Star size={32} className={`${(hoveredStar || rating) >= s ? "fill-amber-400 text-amber-400" : "text-slate-200"} transition-colors`} />
              </button>
            ))}
          </div>
          {rating > 0 && <p className="text-sm font-semibold text-navy">{t(`evaluation.rating_labels.${ratingLabelKey[rating]}`)}</p>}
        </div>

        {/* Tags */}
        {rating > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
              {rating >= 4 ? t("evaluation.what_was_good") : rating === 3 ? t("evaluation.what_could_improve") : t("evaluation.what_happened")}
            </p>
            <div className="flex flex-wrap gap-2">
              {currentTagKeys.map(tag => {
                const tagStr = getTagLabel(`${tagPrefix}_${tagCategory}`, tag);
                return (
                  <button key={tag.key} onClick={() => toggleTag(tagStr)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      selectedTags.includes(tagStr) ? "bg-blue-100 border-blue-300 text-blue-700 font-semibold" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}>{tagStr}</button>
                );
              })}
            </div>
          </div>
        )}

        {/* Comment */}
        {rating > 0 && (
          <div className="mb-5">
            <label className="form-label">{t("evaluation.comments_label")}</label>
            <textarea className="form-input min-h-[60px]" maxLength={500}
              placeholder={t("evaluation.comments_placeholder")}
              value={comment} onChange={e => setComment(e.target.value)} />
            <p className="text-xs text-slate-400 text-right mt-0.5">{comment.length}/500</p>
          </div>
        )}

        {/* Would hire/accept again? */}
        {rating > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
              {isClientEvaluating ? t("evaluation.would_hire_again") : t("evaluation.would_accept_again")}
            </p>
            <div className="flex gap-2">
              {[
                { val: "yes", labelKey: "yes", emoji: "✅", cls: "bg-green-50 border-green-200 text-green-700" },
                { val: "maybe", labelKey: "maybe", emoji: "🤔", cls: "bg-amber-50 border-amber-200 text-amber-700" },
                { val: "no", labelKey: "no", emoji: "❌", cls: "bg-red-50 border-red-200 text-red-600" },
              ].map(opt => (
                <button key={opt.val} onClick={() => setWouldAgain(opt.val)}
                  className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors ${
                    wouldAgain === opt.val ? opt.cls + " ring-2 ring-offset-1 ring-blue-300" : "bg-slate-50 border-slate-200 text-slate-500"
                  }`}>{opt.emoji} {t(`evaluation.would_options.${opt.labelKey}`)}</button>
              ))}
            </div>
          </div>
        )}

        {/* Privacy notice */}
        {rating > 0 && (
          <p className="text-xs text-slate-400 mb-4">
            {t("evaluation.privacy_notice")}
          </p>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-outline flex-1">{t("evaluation.cancel")}</button>
          <button onClick={handleSubmit} disabled={rating === 0 || submitting}
            className="btn-primary flex-1 disabled:opacity-50">
            {submitting ? t("evaluation.submitting") : t("evaluation.submit")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EvaluationModal;