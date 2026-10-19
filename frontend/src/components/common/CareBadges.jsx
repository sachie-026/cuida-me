/**
 * CareBadges — displays emoji badges for selected services/booking context.
 * Note: BADGE_MAP keys are Portuguese strings matching API data from booking.services.
 * Display labels are translated via i18n using slug keys.
 */
import { useTranslation } from "react-i18next";

const BADGE_MAP = {
  // Basic Care
  "Companhia e supervisão": { emoji: "👵", key: "companionship" },
  "Auxílio de mobilidade": { emoji: "🚶", key: "mobility" },
  "Auxílio alimentar": { emoji: "🍽️", key: "feeding" },
  "Higiene pessoal": { emoji: "🚿", key: "hygiene" },
  "Cuidados no leito": { emoji: "🛌", key: "bed_care" },
  // Nursing Care
  "Administração de medicamentos orais": { emoji: "💊", key: "oral_meds" },
  "Administração de medicamentos tópicos": { emoji: "💊", key: "topical_meds" },
  "Lembrete de medicamentos": { emoji: "💊", key: "med_reminders" },
  "Administração de insulina": { emoji: "💉", key: "insulin" },
  "Curativos simples": { emoji: "🩹", key: "simple_dressing" },
  "Curativos complexos": { emoji: "🩹", key: "complex_dressing" },
  "Aferição de sinais vitais": { emoji: "🩺", key: "vital_signs" },
  "Monitoramento de glicemia": { emoji: "🩸", key: "glucose" },
  // Specialized Care
  "Oxigenoterapia": { emoji: "🫁", key: "oxygen" },
  "Alimentação por sonda": { emoji: "🧪", key: "tube_feeding" },
  "Cuidados com cateter urinário": { emoji: "🚽", key: "catheter" },
  "Administração de medicamentos intramusculares": { emoji: "💉", key: "im_meds" },
  "Administração de medicamentos endovenosos": { emoji: "💉", key: "iv_meds" },
  "Precauções de controle de infecção": { emoji: "🦠", key: "infection_control" },
};

const CONTEXT_KEYS = {
  night: "night",
  urgent: "urgent",
  holiday: "holiday",
};

const CONTEXT_EMOJIS = {
  night: "🌙",
  urgent: "⚡",
  holiday: "📅",
};

const CareBadges = ({ services = [], isNight = false, isUrgent = false, isHoliday = false, size = "sm" }) => {
  const { t } = useTranslation();
  const sizeClass = size === "lg" ? "text-sm px-2 py-1" : "text-xs px-1.5 py-0.5";

  const serviceBadges = services
    .filter(s => BADGE_MAP[s])
    .map(s => ({ emoji: BADGE_MAP[s].emoji, label: t(`care_badges.services.${BADGE_MAP[s].key}`) }));

  const contextBadges = [
    ...(isNight ? [{ emoji: CONTEXT_EMOJIS.night, label: t("care_badges.context.night") }] : []),
    ...(isUrgent ? [{ emoji: CONTEXT_EMOJIS.urgent, label: t("care_badges.context.urgent") }] : []),
    ...(isHoliday ? [{ emoji: CONTEXT_EMOJIS.holiday, label: t("care_badges.context.holiday") }] : []),
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