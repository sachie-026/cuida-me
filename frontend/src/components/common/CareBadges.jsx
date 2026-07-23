/**
 * CareBadges — displays emoji badges for selected services/booking context.
 */
const BADGE_MAP = {
  // Basic Care
  "Companhia e supervisão": "👵",
  "Auxílio de mobilidade": "🚶",
  "Auxílio alimentar": "🍽️",
  "Higiene pessoal": "🚿",
  "Cuidados no leito": "🛌",
  // Nursing Care
  "Administração de medicamentos orais": "💊",
  "Administração de medicamentos tópicos": "💊",
  "Lembrete de medicamentos": "💊",
  "Administração de insulina": "💉",
  "Curativos simples": "🩹",
  "Curativos complexos": "🩹",
  "Aferição de sinais vitais": "🩺",
  "Monitoramento de glicemia": "🩸",
  // Specialized Care
  "Oxigenoterapia": "🫁",
  "Alimentação por sonda": "🧪",
  "Cuidados com cateter urinário": "🚽",
  "Administração de medicamentos intramusculares": "💉",
  "Administração de medicamentos endovenosos": "💉",
  "Precauções de controle de infecção": "🦠",
};

const CONTEXT_BADGES = {
  night: { emoji: "🌙", label: "Noturno" },
  urgent: { emoji: "⚡", label: "Urgente" },
  holiday: { emoji: "📅", label: "Feriado" },
};

const CareBadges = ({ services = [], isNight = false, isUrgent = false, isHoliday = false, size = "sm" }) => {
  const sizeClass = size === "lg" ? "text-sm px-2 py-1" : "text-xs px-1.5 py-0.5";

  const serviceBadges = services
    .filter(s => BADGE_MAP[s])
    .map(s => ({ emoji: BADGE_MAP[s], label: s }));

  const contextBadges = [
    ...(isNight ? [CONTEXT_BADGES.night] : []),
    ...(isUrgent ? [CONTEXT_BADGES.urgent] : []),
    ...(isHoliday ? [CONTEXT_BADGES.holiday] : []),
  ];

  const all = [...serviceBadges, ...contextBadges];
  if (all.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {all.map((b, i) => (
        <span key={i} className={`inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 font-medium ${sizeClass}`}
          title={b.label}>
          {b.emoji} {size === "lg" && b.label}
        </span>
      ))}
    </div>
  );
};

export default CareBadges;