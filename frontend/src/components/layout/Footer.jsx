import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import Logo from "../common/Logo";

const Footer = () => {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-slate-900 text-slate-400">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo size="md" className="brightness-0 invert mb-4" />
            <p className="text-sm leading-relaxed max-w-xs">{t("footer.tagline")}</p>
          </div>

          {/* Platform */}
          <div>
            <h5 className="text-white font-semibold text-sm mb-4">{t("footer.platform")}</h5>
            {[
              ["footer.how_it_works", "/#how"],
              ["footer.for_clients", "/#register"],
              ["footer.for_pros", "/#register"],
              ["footer.pricing", "/pricing"],
            ].map(([key, href]) => (
              <a key={key} href={href} className="block text-sm text-slate-400 hover:text-white mb-2 transition-colors">
                {t(key)}
              </a>
            ))}
          </div>

          {/* Support */}
          <div>
            <h5 className="text-white font-semibold text-sm mb-4">{t("footer.support")}</h5>
            {[
              ["footer.help", "/help"],
              ["footer.contact", "/contact"],
              ["footer.whatsapp", "#"],
              ["footer.report", "/report"],
            ].map(([key, href]) => (
              <a key={key} href={href} className="block text-sm text-slate-400 hover:text-white mb-2 transition-colors">
                {t(key)}
              </a>
            ))}
          </div>

          {/* Legal */}
          <div>
            <h5 className="text-white font-semibold text-sm mb-4">{t("footer.legal")}</h5>
            {[
              ["footer.terms", "/terms"],
              ["footer.privacy", "/privacy"],
              ["footer.conduct", "/conduct"],
              ["footer.cookies", "/cookies"],
            ].map(([key, href]) => (
              <Link key={key} to={href} className="block text-sm text-slate-400 hover:text-white mb-2 transition-colors">
                {t(key)}
              </Link>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 pt-5 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-xs">© {year} Cuida.me · {t("footer.rights")}</p>
          <span className="text-xs bg-white/10 px-3 py-1 rounded-full">
            🔒 {t("footer.lgpd_badge")}
          </span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
