import { useState } from "react";
import { Star, X, ThumbsUp, ThumbsDown } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const POSITIVE_TAGS_PRO = [
  "⏰ Pontual", "👩‍⚕️ Profissional e competente", "❤️ Compassivo(a)",
  "😊 Respeitoso(a)", "💬 Ótima comunicação", "🩺 Cuidado de qualidade",
  "🤝 Confiável", "📋 Seguiu instruções", "🌟 Superou expectativas", "⭐ Contrataria novamente",
];
const NEGATIVE_TAGS_PRO = [
  "⏰ Chegou atrasado(a)", "❌ Não compareceu", "💬 Comunicação ruim",
  "😕 Comportamento não profissional", "⚠ Não seguiu instruções",
  "🩺 Cuidado de baixa qualidade", "🚫 Serviço incompleto", "😠 Falta de respeito",
  "🧹 Higiene inadequada", "🚨 Preocupação com segurança",
];
const NEUTRAL_TAGS_PRO = [
  "Pequeno atraso", "Comunicação poderia melhorar", "Mais atenção aos detalhes",
  "Melhor explicação dos procedimentos", "Serviço mediano",
];
const POSITIVE_TAGS_CLIENT = [
  "⏰ Pontual", "😊 Respeitoso(a)", "🤝 Educado(a)", "🏡 Ambiente organizado",
  "❤️ Família acolhedora", "🙏 Paciente e cooperativo", "💬 Boa comunicação",
  "📋 Bem preparado", "💳 Pagamento sem problemas", "⭐ Atenderia novamente",
];
const NEGATIVE_TAGS_CLIENT = [
  "⏰ Cliente atrasado", "🚫 Família ausente", "❌ Informações incorretas",
  "💬 Comunicação ruim", "😠 Comportamento desrespeitoso", "🚪 Acesso difícil",
  "🧹 Ambiente inadequado", "💳 Problema com pagamento",
  "📦 Materiais indisponíveis", "🚨 Preocupação com segurança",
];
const NEUTRAL_TAGS_CLIENT = [
  "Pequeno atraso", "Comunicação poderia melhorar", "Organização poderia melhorar",
  "Cooperação da família poderia melhorar", "Problemas menores de agenda",
];

const EvaluationModal = ({ booking, evaluatorRole, onClose, onSubmitted }) => {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [comment, setComment] = useState("");
  const [wouldAgain, setWouldAgain] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const isClientEvaluating = evaluatorRole === "client";
  const positiveTags = isClientEvaluating ? POSITIVE_TAGS_PRO : POSITIVE_TAGS_CLIENT;
  const negativeTags = isClientEvaluating ? NEGATIVE_TAGS_PRO : NEGATIVE_TAGS_CLIENT;
  const neutralTags = isClientEvaluating ? NEUTRAL_TAGS_PRO : NEUTRAL_TAGS_CLIENT;

  const tags = rating >= 4 ? positiveTags : rating === 3 ? neutralTags : rating >= 1 ? negativeTags : [];

  const toggleTag = (tag) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleSubmit = async () => {
    if (rating === 0) { toast.error("Selecione uma avaliação."); return; }
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
      toast.success("Avaliação enviada!");
      onSubmitted?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao enviar avaliação.");
    } finally { setSubmitting(false); }
  };

  const ratingLabels = ["", "Muito ruim", "Ruim", "Regular", "Bom", "Excelente"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-navy">
            {isClientEvaluating ? "Avaliar profissional" : "Avaliar cliente"}
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
          {rating > 0 && <p className="text-sm font-semibold text-navy">{ratingLabels[rating]}</p>}
        </div>

        {/* Tags */}
        {rating > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
              {rating >= 4 ? "O que foi bom?" : rating === 3 ? "O que poderia melhorar?" : "O que houve?"}
            </p>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <button key={tag} onClick={() => toggleTag(tag)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    selectedTags.includes(tag) ? "bg-blue-100 border-blue-300 text-blue-700 font-semibold" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}>{tag}</button>
              ))}
            </div>
          </div>
        )}

        {/* Comment */}
        {rating > 0 && (
          <div className="mb-5">
            <label className="form-label">Comentários adicionais (opcional)</label>
            <textarea className="form-input min-h-[60px]" maxLength={500}
              placeholder="Conte-nos mais sobre sua experiência..."
              value={comment} onChange={e => setComment(e.target.value)} />
            <p className="text-xs text-slate-400 text-right mt-0.5">{comment.length}/500</p>
          </div>
        )}

        {/* Would hire/accept again? */}
        {rating > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
              {isClientEvaluating ? "Contrataria novamente?" : "Aceitaria outro atendimento deste cliente?"}
            </p>
            <div className="flex gap-2">
              {[
                { val: "yes", label: "✅ Sim", cls: "bg-green-50 border-green-200 text-green-700" },
                { val: "maybe", label: "🤔 Talvez", cls: "bg-amber-50 border-amber-200 text-amber-700" },
                { val: "no", label: "❌ Não", cls: "bg-red-50 border-red-200 text-red-600" },
              ].map(opt => (
                <button key={opt.val} onClick={() => setWouldAgain(opt.val)}
                  className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors ${
                    wouldAgain === opt.val ? opt.cls + " ring-2 ring-offset-1 ring-blue-300" : "bg-slate-50 border-slate-200 text-slate-500"
                  }`}>{opt.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* Privacy notice */}
        {rating > 0 && (
          <p className="text-xs text-slate-400 mb-4">
            Seu feedback detalhado é privado e ajuda a CuidaU a melhorar a plataforma. Apenas a avaliação geral pode ser visível.
          </p>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-outline flex-1">Cancelar</button>
          <button onClick={handleSubmit} disabled={rating === 0 || submitting}
            className="btn-primary flex-1 disabled:opacity-50">
            {submitting ? "Enviando..." : "Enviar avaliação"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EvaluationModal;