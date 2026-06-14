import { useTranslation } from "react-i18next";
import { MapPin, Lock, ClipboardList, AlertCircle, Star } from "lucide-react";

const HeroCard = () => (
  <div className="space-y-3">
    {/* Professional card */}
    <div className="card p-5 hover:-translate-y-1 transition-transform duration-300">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-full bg-brand-gradient flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          EM
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-navy">Enf. Maria Santos</h4>
          <p className="text-xs text-slate-500">COREN-SP 123456 · Verificado ✓</p>
        </div>
        <span className="flex-shrink-0 bg-green-100 text-green-600 text-xs font-semibold px-2.5 py-1 rounded-full">
          Disponível
        </span>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">
        <span className="font-semibold text-navy">Especialidade:</span> Cuidados Domiciliares, Curativos Complexos<br />
        <span className="font-semibold text-navy">Distância:</span> 2.4 km · Hoje, 14h–20h
      </p>
      <div className="flex items-center gap-1.5 mt-2">
        {[1,2,3,4,5].map(i => <Star key={i} size={12} className="fill-amber-400 text-amber-400" />)}
        <span className="text-xs text-slate-500">4.9 · 87 atendimentos</span>
      </div>
    </div>

    {/* Mini cards */}
    <div className="grid grid-cols-2 gap-3">
      {[
        { icon: <MapPin size={20} className="text-blue-500" />, title: "GPS em tempo real", desc: "Check-in e check-out verificado" },
        { icon: <Lock size={20} className="text-green-500" />, title: "Pagamento seguro", desc: "PIX ou cartão com split automático" },
        { icon: <ClipboardList size={20} className="text-blue-500" />, title: "Prontuário digital", desc: "Registro clínico após cada visita" },
        { icon: <AlertCircle size={20} className="text-red-500" />, title: "Botão SOS", desc: "Para profissional e família" },
      ].map((item, i) => (
        <div key={i} className="card p-3.5 hover:-translate-y-0.5 transition-transform duration-300">
          <div className="mb-2">{item.icon}</div>
          <h5 className="text-xs font-bold text-navy mb-0.5">{item.title}</h5>
          <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
        </div>
      ))}
    </div>
  </div>
);

const HeroSection = () => {
  const { t } = useTranslation();

  return (
    <section
      id="hero"
      className="min-h-screen pt-16 flex items-center relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, #ffffff 0%, #EFF6FF 60%, #DBEAFE 100%)" }}
    >
      {/* Background blobs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-green-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3 pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10 w-full">
        {/* Left: copy */}
        <div>
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-600 px-3 py-1.5 rounded-full text-xs font-semibold mb-5">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {t("hero.badge")}
          </div>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-navy leading-tight tracking-tight mb-5">
            {t("hero.title_1")}{" "}
            <em className="not-italic gradient-text">{t("hero.title_2")}</em>
          </h1>
          <p className="text-slate-600 text-lg leading-relaxed mb-8 max-w-lg">
            {t("hero.subtitle")}
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="/register" className="btn-primary">
              {t("hero.cta_client")}
            </a>
            <a href="/register" className="btn-outline">
              {t("hero.cta_pro")}
            </a>
          </div>
        </div>

        {/* Right: app preview */}
        <div className="w-full max-w-md mx-auto lg:mx-0">
          <HeroCard />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;