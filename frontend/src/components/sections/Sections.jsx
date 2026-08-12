import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, MapPin, Lock, BadgeCheck, Star } from "lucide-react";

/* ── useFadeIn hook ── */
export const useFadeIn = () => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) el.classList.add("visible"); },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
};

/* ── TrustBar ── */
export const TrustBar = () => {
  const { t } = useTranslation();
  const items = ["trust.coren","trust.background","trust.selfie","trust.lgpd","trust.whatsapp"];
  return (
    <div className="bg-navy py-4 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto flex flex-wrap justify-center gap-4 sm:gap-8">
        {items.map(key => (
          <div key={key} className="flex items-center gap-2 text-white/80 text-sm">
            <span className="text-green-400 font-bold">✓</span>
            {t(key)}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── Why Choose CuidaU ── */
export const WhyChoose = () => {
  const { t } = useTranslation();
  const ref = useFadeIn();

  const clientBenefits = [
    { title: t("why.client_1_title"), desc: t("why.client_1_desc") },
    { title: t("why.client_2_title"), desc: t("why.client_2_desc") },
    { title: t("why.client_3_title"), desc: t("why.client_3_desc") },
    { title: t("why.client_4_title"), desc: t("why.client_4_desc") },
    { title: t("why.client_5_title"), desc: t("why.client_5_desc") },
  ];

  const proBenefits = [
    { title: t("why.pro_1_title"), desc: t("why.pro_1_desc") },
    { title: t("why.pro_2_title"), desc: t("why.pro_2_desc") },
    { title: t("why.pro_3_title"), desc: t("why.pro_3_desc") },
    { title: t("why.pro_4_title"), desc: t("why.pro_4_desc") },
    { title: t("why.pro_5_title"), desc: t("why.pro_5_desc") },
  ];

  return (
    <section className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <h2 className="section-title mb-3">{t("why.title")}</h2>
          <p className="section-sub max-w-2xl mx-auto">{t("why.subtitle")}</p>
        </div>
        <div ref={ref} className="fade-in grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* For clients */}
          <div className="bg-blue-50/50 rounded-2xl p-8 border border-blue-100">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">👨‍👩‍👧</span>
              <h3 className="font-display text-xl font-bold text-navy">{t("why.for_clients")}</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">{t("why.for_clients_desc")}</p>
            <div className="space-y-4">
              {clientBenefits.map((b, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-green-500 font-bold text-sm mt-0.5 flex-shrink-0">✔</span>
                  <div>
                    <p className="text-sm font-semibold text-navy">{b.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <a href="/register" className="btn-primary w-full mt-8 text-center block py-3">{t("why.client_cta")}</a>
          </div>

          {/* For professionals */}
          <div className="bg-green-50/50 rounded-2xl p-8 border border-green-100">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">👩‍⚕️</span>
              <h3 className="font-display text-xl font-bold text-navy">{t("why.for_professionals")}</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">{t("why.for_professionals_desc")}</p>
            <div className="space-y-4">
              {proBenefits.map((b, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-green-500 font-bold text-sm mt-0.5 flex-shrink-0">✔</span>
                  <div>
                    <p className="text-sm font-semibold text-navy">{b.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <a href="/register" className="btn-primary w-full mt-8 text-center block py-3 bg-green-600 hover:bg-green-700 border-green-600">{t("why.pro_cta")}</a>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ── Trust Highlights ── */
export const TrustHighlights = () => {
  const { t } = useTranslation();
  const ref = useFadeIn();
  const items = [
    { icon: "✔", text: t("trust_hl.item_1") },
    { icon: "✔", text: t("trust_hl.item_2") },
    { icon: "✔", text: t("trust_hl.item_3") },
    { icon: "✔", text: t("trust_hl.item_4") },
    { icon: "✔", text: t("trust_hl.item_5") },
    { icon: "✔", text: t("trust_hl.item_6") },
    { icon: "✔", text: t("trust_hl.item_7") },
    { icon: "✔", text: t("trust_hl.item_8") },
  ];
  return (
    <section className="py-20 bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="section-title mb-3">{t("trust_hl.title")}</h2>
          <p className="section-sub max-w-2xl mx-auto">{t("trust_hl.subtitle")}</p>
        </div>
        <div ref={ref} className="fade-in grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-3 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <span className="text-green-500 font-bold text-lg flex-shrink-0">{item.icon}</span>
              <span className="text-sm font-medium text-navy">{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── HowItWorks ── */
export const HowItWorks = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState("client");
  const ref = useFadeIn();
  const steps = tab === "client"
    ? Object.values(t("how.client_steps", { returnObjects: true }))
    : Object.values(t("how.pro_steps", { returnObjects: true }));
  const icons = tab === "client"
    ? ["👤","🔍","📅","✅"]
    : ["📄","🗓️","💼","💰"];

  return (
    <section id="how" className="py-20 bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8">
          <span className="section-label">{t("how.label")}</span>
          <h2 className="section-title mb-3">{t("how.title")}</h2>
          <p className="section-sub max-w-xl mx-auto">{t("how.subtitle")}</p>
        </div>
        {/* Tabs */}
        <div className="flex justify-center mb-8">
          <div className="flex rounded-xl overflow-hidden border-2 border-slate-200 bg-white">
            {["client","pro"].map(type => (
              <button
                key={type}
                onClick={() => setTab(type)}
                className={`px-5 py-2.5 text-sm font-semibold transition-all duration-200
                  ${tab === type ? "bg-blue-500 text-white" : "text-slate-500 hover:text-blue-500"}`}
              >
                {t(`how.tab_${type}`)}
              </button>
            ))}
          </div>
        </div>
        {/* Steps */}
        <div ref={ref} className="fade-in grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((step, i) => (
            <div key={i} className="card p-5 hover:-translate-y-1 transition-transform duration-300">
              <div className="text-3xl mb-3">{icons[i]}</div>
              <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold mb-3">
                {i + 1}
              </div>
              <h4 className="font-semibold text-navy text-sm mb-2">{step.title}</h4>
              <p className="text-xs text-slate-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── Professionals ── */
export const Professionals = () => {
  const { t } = useTranslation();
  const ref = useFadeIn();
  const profs = [
    { key: "nurse",             emoji: "👩‍⚕️", gradient: "from-blue-100 to-blue-200" },
    { key: "technician",        emoji: "🩺",    gradient: "from-green-100 to-green-200" },
    { key: "nursing_assistant", emoji: "🩹",    gradient: "from-blue-50 to-blue-100" },
    { key: "caregiver",         emoji: "🤝",    gradient: "from-blue-50 to-green-100" },
  ];

  return (
    <section id="professionals" className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <span className="section-label">{t("professionals.label")}</span>
          <h2 className="section-title mb-3">{t("professionals.title")}</h2>
          <p className="section-sub max-w-xl mx-auto">{t("professionals.subtitle")}</p>
        </div>
        <div ref={ref} className="fade-in grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {profs.map(({ key, emoji, gradient }) => {
            const data = t(`professionals.${key}`, { returnObjects: true });
            return (
              <div key={key} className="card overflow-hidden hover:-translate-y-1 hover:shadow-hover transition-all duration-300">
                <div className={`bg-gradient-to-br ${gradient} p-6 text-center`}>
                  <div className="text-4xl mb-2">{emoji}</div>
                  <h3 className="font-display text-lg font-semibold text-navy">{data.title}</h3>
                  <p className="text-xs text-blue-600 font-medium mt-1">{data.badge}</p>
                </div>
                <div className="p-5">
                  {data.services.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 py-2 border-b border-slate-50 last:border-0">
                      <span className="text-green-500 font-bold text-sm mt-0.5 flex-shrink-0">✓</span>
                      <span className="text-xs text-slate-700">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

/* ── Stats ── */
export const Stats = () => {
  const { t } = useTranslation();
  const ref = useFadeIn();
  const stats = [
    { num: "GPS",    label: "Check-in e check-out com verificação de localização", accent: false },
    { num: "100%",   label: "Pagamento seguro via PIX ou cartão com split automático", accent: true },
    { num: "✓",      label: "Profissionais e clientes verificados com identidade e documentos", accent: false },
    { num: "24/7",   label: "Suporte dedicado e central de ajuda disponíveis", accent: true },
  ];

  return (
    <section className="py-20 bg-navy">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <span className="inline-block bg-white/10 text-white/80 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase mb-3">
            Nossa missão
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-white">
            Conectar profissionais verificados a clientes que precisam de cuidado,{" "}
            <em className="not-italic text-amber-400">com segurança e agilidade</em>
          </h2>
        </div>
        <div ref={ref} className="fade-in grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
          {stats.map((s, i) => (
            <div key={i}>
              <div className={`font-display text-4xl md:text-5xl font-bold mb-2 ${s.accent ? "text-amber-400" : "text-white"}`}>
                {s.num}
              </div>
              <p className="text-white/60 text-sm leading-relaxed">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── Safety ── */
export const Safety = () => {
  const { t } = useTranslation();
  const ref = useFadeIn();
  const safetyItems = [
    { key: "identity", icon: <BadgeCheck size={22} className="text-blue-500" />, bg: "bg-blue-100" },
    { key: "coren",    icon: <ShieldCheck size={22} className="text-green-500" />, bg: "bg-green-100" },
    { key: "gps",      icon: <MapPin size={22} className="text-blue-500" />, bg: "bg-blue-100" },
    { key: "lgpd",     icon: <Lock size={22} className="text-green-500" />, bg: "bg-green-100" },
  ];
  const checklist = t("safety.checklist", { returnObjects: true });

  return (
    <section id="safety" className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <span className="section-label">{t("safety.label")}</span>
        <h2 className="section-title mb-12 max-w-lg">{t("safety.title")}</h2>
        <div ref={ref} className="fade-in grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          {/* Safety items */}
          <div className="space-y-4">
            {safetyItems.map(({ key, icon, bg }) => {
              const item = t(`safety.items.${key}`, { returnObjects: true });
              return (
                <div key={key} className="flex gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className={`w-11 h-11 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    {icon}
                  </div>
                  <div>
                    <h4 className="font-semibold text-navy text-sm mb-1">{item.title}</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Checklist visual */}
          <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-2xl p-6 border border-blue-100">
            <h3 className="font-display font-semibold text-navy text-lg mb-5">{t("safety.checklist_title")}</h3>
            <div className="space-y-3">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">✓</span>
                  <span className="text-sm text-slate-700">{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 pt-5 border-t border-blue-200">
              <p className="text-xs text-slate-500">{t("safety.review_note")}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ── Testimonials ── */
export const Testimonials = () => {
  const { t } = useTranslation();
  const ref = useFadeIn();
  const items = t("testimonials.items", { returnObjects: true });

  return (
    <section className="py-20 bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <span className="section-label">{t("testimonials.label")}</span>
          <h2 className="section-title">{t("testimonials.title")}</h2>
        </div>
        <div ref={ref} className="fade-in grid grid-cols-1 md:grid-cols-3 gap-6">
          {items.map((item, i) => (
            <div key={i} className="card p-6 hover:-translate-y-1 transition-transform duration-300">
              <div className="flex gap-0.5 mb-3">
                {[1,2,3,4,5].map(s => <Star key={s} size={14} className="fill-amber-400 text-amber-400" />)}
              </div>
              <p className="text-sm text-slate-700 leading-relaxed italic mb-5">"{item.text}"</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-gradient flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                  {item.name.split(" ").map(n => n[0]).slice(0,2).join("")}
                </div>
                <div>
                  <h5 className="font-semibold text-navy text-sm">{item.name}</h5>
                  <p className="text-xs text-slate-500">{item.location}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── CTA Section ── */
export const CTASection = () => {
  const { t } = useTranslation();

  return (
    <section className="py-24 bg-section-gradient text-center relative overflow-hidden">
      <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none" />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 relative z-10">
        <h2 className="font-display text-3xl md:text-5xl font-bold text-white mb-4">{t("cta.title")}</h2>
        <p className="text-white/75 text-lg mb-10">{t("cta.subtitle")}</p>
        <div className="flex flex-wrap justify-center gap-4">
          <a href="/register" className="btn-white">{t("cta.client")}</a>
          <a href="/register" className="btn-outline-white">{t("cta.pro")}</a>
        </div>
      </div>
    </section>
  );
};