import { useState } from "react";
import { Share2, Copy, CheckCircle, MessageCircle } from "lucide-react";
import toast from "react-hot-toast";
import Logo from "../components/common/Logo";
import ProfileMenu from "../components/common/ProfileMenu";

const InvitePage = () => {
  const userId = localStorage.getItem("user_id") || "";
  const fullName = localStorage.getItem("full_name") || "Usuário";
  const role = localStorage.getItem("role") || "client";
  const [copied, setCopied] = useState(false);

  const referralCode = `${role === "client" ? "CLI" : "PRO"}${userId.substring(0, 6).toUpperCase()}`;
  const referralLink = `${window.location.origin}/register?ref=${referralCode}`;

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(false), 3000);
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(
      `Olá! Conheça a CuidaU — plataforma de cuidados de saúde domiciliar com profissionais verificados. Use meu link para se cadastrar: ${referralLink}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "CuidaU — Cuidado em casa",
          text: "Conheça a CuidaU! Profissionais de saúde verificados para cuidados domiciliares.",
          url: referralLink,
        });
      } catch {}
    } else {
      copyLink();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" />
        <ProfileMenu />
      </nav>

      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
          <Share2 size={28} className="text-blue-500" />
        </div>
        <h1 className="font-display text-2xl font-bold text-navy mb-2">Convide amigos</h1>
        <p className="text-sm text-slate-500 mb-8">
          Compartilhe a CuidaU com amigos e familiares. Quanto mais pessoas usarem, melhor fica para todos.
        </p>

        {/* Referral link */}
        <div className="card p-5 mb-6 text-left">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Seu link de convite</p>
          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-sm font-mono text-slate-600 truncate flex-1">{referralLink}</p>
            <button onClick={copyLink}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-semibold hover:bg-blue-600 flex-shrink-0">
              {copied ? <><CheckCircle size={12}/> Copiado</> : <><Copy size={12}/> Copiar</>}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">Código: <span className="font-mono font-semibold">{referralCode}</span></p>
        </div>

        {/* Share buttons */}
        <div className="space-y-3">
          <button onClick={shareWhatsApp}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500 text-white font-semibold hover:bg-green-600 transition-colors">
            <MessageCircle size={18} /> Compartilhar via WhatsApp
          </button>
          <button onClick={shareNative}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-900 transition-colors">
            <Share2 size={18} /> Compartilhar
          </button>
        </div>

        <p className="text-xs text-slate-400 mt-6">
          Quando alguém se cadastrar pelo seu link, o código de referência será salvo automaticamente.
        </p>
      </div>
    </div>
  );
};

export default InvitePage;