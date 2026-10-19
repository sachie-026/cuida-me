import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import Logo from "../components/common/Logo";

const Privacy = () => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/"><Logo size="sm" /></Link>
      </nav>
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Link to="/" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-500 mb-6 transition-colors">
          <ArrowLeft size={15} /> {t("privacy.back_home")}
        </Link>
        <h1 className="font-display text-3xl font-bold text-navy mb-2">{t("privacy.title")}</h1>
        <p className="text-slate-500 text-sm mb-8">{t("privacy.last_updated")}</p>

        <div className="space-y-6 text-slate-600 text-sm leading-relaxed">
          <section>
            <h2 className="font-semibold text-navy text-base mb-2">{t("privacy.s1_title")}</h2>
            <p>{t("privacy.s1_text")}</p>
          </section>
          <section>
            <h2 className="font-semibold text-navy text-base mb-2">{t("privacy.s2_title")}</h2>
            <p>{t("privacy.s2_text")}</p>
          </section>
          <section>
            <h2 className="font-semibold text-navy text-base mb-2">{t("privacy.s3_title")}</h2>
            <p>{t("privacy.s3_text")}</p>
          </section>
          <section>
            <h2 className="font-semibold text-navy text-base mb-2">{t("privacy.s4_title")}</h2>
            <p>{t("privacy.s4_text")}</p>
          </section>
          <section>
            <h2 className="font-semibold text-navy text-base mb-2">{t("privacy.s5_title")}</h2>
            <p dangerouslySetInnerHTML={{ __html: t("privacy.s5_text") }} />
          </section>
          <section>
            <h2 className="font-semibold text-navy text-base mb-2">{t("privacy.s6_title")}</h2>
            <p>{t("privacy.s6_text")}</p>
          </section>
          <section>
            <h2 className="font-semibold text-navy text-base mb-2">{t("privacy.s7_title")}</h2>
            <p dangerouslySetInnerHTML={{ __html: t("privacy.s7_text") }} />
          </section>
        </div>
      </div>
    </div>
  );
};

export default Privacy;