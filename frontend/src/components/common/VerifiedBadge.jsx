import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle, X, Shield } from "lucide-react";

/**
 * VerifiedBadge — displays a verified badge with tappable info modal.
 * @param {string} type - "client" | "professional"
 * @param {boolean} verified - whether the user is verified
 * @param {string} size - "sm" | "md" | "lg"
 */
const VerifiedBadge = ({ type = "professional", verified = false, size = "sm" }) => {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);

  if (!verified) return null;

  const label = type === "client" ? t("verified_badge.client_label") : t("verified_badge.pro_label");
  const sizeClass = {
    sm: "text-xs gap-1 px-1.5 py-0.5",
    md: "text-xs gap-1.5 px-2 py-1",
    lg: "text-sm gap-2 px-3 py-1.5",
  }[size];
  const iconSize = size === "lg" ? 14 : 12;

  return (
    <>
      <button onClick={() => setShowInfo(true)}
        className={`inline-flex items-center font-semibold rounded-full bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors cursor-pointer ${sizeClass}`}>
        <CheckCircle size={iconSize} className="text-green-500" />
        {label}
      </button>

      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowInfo(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Shield size={20} className="text-green-500" />
                <h3 className="font-bold text-navy">{label}</h3>
              </div>
              <button onClick={() => setShowInfo(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X size={16} className="text-slate-400" />
              </button>
            </div>
            {type === "client" ? (
              <div>
                <p className="text-sm text-slate-600 mb-3">
                  {t("verified_badge.client_desc1")}
                </p>
                <p className="text-sm text-slate-600">
                  {t("verified_badge.client_desc2")}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-600 mb-3">
                  {t("verified_badge.pro_desc")}
                </p>
                <p className="text-sm text-slate-600 mb-3">{t("verified_badge.verified_items_intro")}</p>
                <div className="space-y-2">
                  {(t("verified_badge.verified_items", { returnObjects: true }) || []).map(item => (
                    <div key={item} className="flex items-center gap-2">
                      <CheckCircle size={13} className="text-green-500 flex-shrink-0" />
                      <span className="text-sm text-slate-600">{item}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-4">
                  {t("verified_badge.seal_note")}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default VerifiedBadge;