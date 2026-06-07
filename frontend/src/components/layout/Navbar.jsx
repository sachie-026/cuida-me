import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu, X } from "lucide-react";
import Logo from "../common/Logo";
import LanguageSwitcher from "../common/LanguageSwitcher";

const Navbar = () => {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { label: t("nav.how_it_works"), href: "/#how" },
    { label: t("nav.professionals"), href: "/#professionals" },
    { label: t("nav.safety"), href: "/#safety" },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300
        ${scrolled ? "bg-white/95 backdrop-blur-md shadow-sm border-b border-slate-100" : "bg-white/80 backdrop-blur-sm"}`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex-shrink-0">
          <Logo size="md" />
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-600 hover:text-blue-500 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Right side */}
        <div className="hidden md:flex items-center gap-3">
          <LanguageSwitcher />
          <Link
            to="/login"
            className="text-sm font-medium text-slate-600 hover:text-blue-500 transition-colors px-3 py-1.5"
          >
            {t("nav.login")}
          </Link>
          <Link to="/#register" className="btn-primary text-sm px-4 py-2">
            {t("nav.get_started")}
          </Link>
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden items-center gap-2">
          <LanguageSwitcher />
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 px-4 py-4 flex flex-col gap-3 shadow-lg">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="text-sm font-medium text-slate-700 py-2 border-b border-slate-100"
            >
              {link.label}
            </a>
          ))}
          <div className="flex flex-col gap-2 pt-2">
            <Link to="/login" className="btn-outline text-sm py-2.5 text-center">
              {t("nav.login")}
            </Link>
            <Link to="/#register" className="btn-primary text-sm py-2.5 text-center">
              {t("nav.get_started")}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
