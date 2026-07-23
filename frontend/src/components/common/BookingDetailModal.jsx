import { useState } from "react";
import { X, MapPin, Clock, User, Star, Phone, MessageSquare, CheckCircle, AlertCircle } from "lucide-react";
import CareBadges from "./CareBadges";
import VerifiedBadge from "./VerifiedBadge";

const STATUS_CONFIG = {
  pending:    { label: "Pendente",      color: "bg-yellow-100 text-yellow-700" },
  accepted:   { label: "Confirmado",    color: "bg-blue-100 text-blue-700" },
  checked_in: { label: "Em andamento",  color: "bg-purple-100 text-purple-700" },
  completed:  { label: "Concluído",     color: "bg-green-100 text-green-700" },
  cancelled:  { label: "Cancelado",     color: "bg-red-100 text-red-600" },
};

const BookingDetailModal = ({ booking, onClose, onAccept, onDecline, onChat }) => {
  if (!booking) return null;

  const cfg = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending;
  const isPending = booking.status === "pending";
  const isAccepted = booking.status === "accepted";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.color}`}>{cfg.label}</span>
            <h3 className="font-display text-lg font-bold text-navy mt-2">{booking.service_type || "Atendimento"}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* Schedule */}
        <div className="flex items-center gap-2 text-sm text-slate-600 mb-3">
          <Clock size={14} className="text-slate-400" />
          <span>
            {booking.scheduled_start && new Date(booking.scheduled_start).toLocaleDateString("pt-BR", { weekday:"long", day:"numeric", month:"long" })}
            {" · "}
            {booking.scheduled_start && new Date(booking.scheduled_start).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}
            {booking.scheduled_end && ` – ${new Date(booking.scheduled_end).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}`}
          </span>
        </div>
        {booking.duration_hours && (
          <p className="text-xs text-slate-500 mb-3">⏱ Duração: {booking.duration_hours}h</p>
        )}

        {/* Services / Care badges */}
        {booking.services?.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Serviços</p>
            <CareBadges services={booking.services} isNight={booking.shift === "night"} isUrgent={booking.is_urgent} isHoliday={booking.is_holiday} size="lg" />
          </div>
        )}

        {/* Client info */}
        <div className="p-3 bg-slate-50 rounded-xl mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Cliente</p>
          <div className="flex items-center gap-2 mb-1">
            <User size={14} className="text-slate-400" />
            <span className="text-sm font-medium text-navy">{booking.client_name || "Cliente"}</span>
            {booking.client_verified && <VerifiedBadge type="client" verified={true} size="sm" />}
          </div>
          {booking.client_reliability && (
            <p className="text-xs text-slate-500">Confiabilidade: {booking.client_reliability}%</p>
          )}
        </div>

        {/* Location — approximate before accept, full after */}
        <div className="p-3 bg-slate-50 rounded-xl mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
            {isPending ? "Localização aproximada" : "Endereço"}
          </p>
          <div className="flex items-start gap-2">
            <MapPin size={14} className="text-slate-400 mt-0.5" />
            <span className="text-sm text-slate-600">
              {isPending
                ? (booking.approximate_location || booking.city || "Região não informada")
                : (booking.address || booking.city || "Endereço não informado")}
            </span>
          </div>
          {isPending && (
            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
              <AlertCircle size={11} /> Endereço completo disponível após aceitar
            </p>
          )}
        </div>

        {/* Pricing */}
        <div className="p-3 bg-green-50 rounded-xl mb-4 border border-green-100">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase">Seu ganho</p>
            <p className="text-lg font-bold text-green-700">R$ {Number(booking.pro_payout || booking.total_price || 0).toFixed(2)}</p>
          </div>
        </div>

        {/* Notes */}
        {booking.notes && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Observações</p>
            <p className="text-sm text-slate-600">{booking.notes}</p>
          </div>
        )}

        {/* Emergency contact */}
        {(booking.emergency_name || booking.emergency_phone) && (
          <div className="p-3 bg-red-50 rounded-xl mb-4 border border-red-100">
            <p className="text-xs font-semibold text-red-600 uppercase mb-1">Contato de emergência</p>
            <p className="text-sm text-red-700">{booking.emergency_name} · {booking.emergency_phone}</p>
          </div>
        )}

        {/* Reschedule request */}
        {booking.reschedule_status === "requested" && (
          <div className="p-3 bg-amber-50 rounded-xl mb-4 border border-amber-200">
            <p className="text-xs font-semibold text-amber-700 uppercase mb-1">Solicitação de reagendamento</p>
            <p className="text-sm text-amber-600">
              Nova data: {booking.reschedule_new_start && new Date(booking.reschedule_new_start).toLocaleDateString("pt-BR")}
              {" · "}
              {booking.reschedule_new_start && new Date(booking.reschedule_new_start).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-2">
          {isPending && onAccept && (
            <>
              <button onClick={() => onAccept(booking.id)} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                <CheckCircle size={14} /> Aceitar
              </button>
              <button onClick={() => onDecline(booking.id)} className="btn-outline flex-1 text-red-500 border-red-200 hover:bg-red-50">
                Recusar
              </button>
            </>
          )}
          {isAccepted && onChat && (
            <button onClick={() => onChat(booking.id)} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
              <MessageSquare size={14} /> Conversar com cliente
            </button>
          )}
          {!isPending && (
            <button onClick={onClose} className="btn-outline flex-1">Fechar</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingDetailModal;