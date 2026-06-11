import { useState } from "react";
import { X, Star } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const RatingModal = ({ booking, revieweeId, onClose, onDone }) => {
  const [rating,  setRating]  = useState(0);
  const [hover,   setHover]   = useState(0);
  const [comment, setComment] = useState("");
  const [saving,  setSaving]  = useState(false);
  const token   = localStorage.getItem("token");
  const userId  = localStorage.getItem("user_id");
  const headers = { Authorization: `Bearer ${token}` };

  const handleSubmit = async () => {
    if (!rating) { toast.error("Selecione uma avaliação de 1 a 5 estrelas."); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/api/ratings`, {
        booking_id:  booking.id,
        reviewer_id: userId,
        reviewee_id: revieweeId,
        rating,
        comment: comment || null,
      }, { headers });
      toast.success("Avaliação enviada!");
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao enviar avaliação.");
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

        <h2 className="font-display text-xl font-bold text-navy mb-1">Avaliar atendimento</h2>
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
          {["","Ruim","Regular","Bom","Ótimo","Excelente!"][hover || rating] || "Selecione uma nota"}
        </p>

        <div className="mb-5">
          <label className="form-label">Comentário {rating <= 3 ? "*" : "(opcional)"}</label>
          <textarea className="form-input min-h-[90px]" value={comment} onChange={e => setComment(e.target.value)}
            placeholder="Conte como foi o atendimento..." />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-outline flex-1">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving || !rating}
            className="btn-primary flex-1 disabled:opacity-60">
            {saving ? "Enviando..." : "Enviar avaliação"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RatingModal;