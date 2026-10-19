import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Logo from "../components/common/Logo";

const NotFound = () => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-hero-gradient flex flex-col items-center justify-center px-4 text-center">
      <Logo size="lg" className="mb-8" />
      <h1 className="font-display text-7xl font-bold text-navy mb-3">404</h1>
      <p className="text-slate-500 text-lg mb-8">{t("not_found.message")}</p>
      <Link to="/" className="btn-primary">{t("not_found.back_home")}</Link>
    </div>
  );
};

export default NotFound;