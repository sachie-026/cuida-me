import { useTranslation } from "react-i18next";

const LanguageSwitcher = ({ className = "" }) => {
  const { i18n } = useTranslation();
  const current = i18n.language;

  const toggle = () => {
    const next = current === "pt-BR" ? "en" : "pt-BR";
    i18n.changeLanguage(next);
  };

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg
        border border-slate-200 bg-white hover:border-blue-500
        text-xs font-semibold text-slate-600 hover:text-blue-500
        transition-all duration-200 ${className}`}
      aria-label="Switch language"
    >
      <span>{current === "pt-BR" ? "🇧🇷" : "🇺🇸"}</span>
      <span>{current === "pt-BR" ? "PT" : "EN"}</span>
    </button>
  );
};

export default LanguageSwitcher;
