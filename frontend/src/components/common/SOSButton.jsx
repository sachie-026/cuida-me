import { useState } from "react";
import { Phone, X, AlertTriangle } from "lucide-react";

const EMERGENCY_NUMBERS = [
  { label: "SAMU", number: "192", emoji: "🚑", desc: "Serviço de Atendimento Móvel de Urgência" },
  { label: "Bombeiros", number: "193", emoji: "🚒", desc: "Corpo de Bombeiros" },
  { label: "Polícia Militar", number: "190", emoji: "👮", desc: "Emergências policiais" },
];

const SOSButton = ({ emergencyContact }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-40 w-12 h-12 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 transition-all hover:scale-105 flex items-center justify-center text-sm font-bold">
        SOS
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={22} className="text-red-500" />
                <h3 className="font-bold text-navy text-lg">Assistência de Emergência</h3>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X size={16} className="text-slate-400" />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Se esta é uma emergência com risco de vida, entre em contato com os serviços de emergência imediatamente.
            </p>

            <div className="space-y-2 mb-4">
              {EMERGENCY_NUMBERS.map(e => (
                <a key={e.number} href={`tel:${e.number}`}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-red-300 hover:bg-red-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{e.emoji}</span>
                    <div>
                      <p className="text-sm font-semibold text-navy">{e.label} — {e.number}</p>
                      <p className="text-xs text-slate-500">{e.desc}</p>
                    </div>
                  </div>
                  <Phone size={16} className="text-red-500" />
                </a>
              ))}
            </div>

            {emergencyContact?.name && emergencyContact?.phone && (
              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Contato de confiança</p>
                <a href={`tel:${emergencyContact.phone}`}
                  className="flex items-center justify-between p-3 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📞</span>
                    <div>
                      <p className="text-sm font-semibold text-navy">{emergencyContact.name}</p>
                      <p className="text-xs text-slate-500">{emergencyContact.phone}</p>
                    </div>
                  </div>
                  <Phone size={16} className="text-blue-500" />
                </a>
              </div>
            )}

            <p className="text-[10px] text-slate-400 mt-4 text-center">
              A CuidaU não recebe alertas de emergência. Este botão é apenas um atalho para ligar para serviços de emergência.
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default SOSButton;