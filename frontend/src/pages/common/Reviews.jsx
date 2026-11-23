// Reviews page — target of the pro's ProfileMenu → "Avaliações" entry.
//
// Shows reviews the professional has RECEIVED, with:
//   - overall average + count card
//   - per-review: stars, service type, reviewer first name, date, comment
//
// Clients don't have this entry in their ProfileMenu, but the route is
// role-neutral so an admin can view any pro's received reviews by hand.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Star, MessageSquareQuote, Loader } from "lucide-react";
import axios from "axios";
import Logo from "../../components/common/Logo";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const StarRow = ({ value }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star
        key={n}
        size={14}
        className={n <= value ? "fill-amber-400 text-amber-400" : "text-slate-200"}
      />
    ))}
  </div>
);

const Reviews = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("user_id");
  const headers = { Authorization: `Bearer ${token}` };

  const [data, setData] = useState({ reviews: [], count: 0, average: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    axios
      .get(`${API}/api/ratings/professional/${userId}`, { headers })
      .then((r) => {
        // Backward-compat with the raw-array shape just in case the backend
        // hasn't deployed yet: wrap it into the new shape so render still
        // works and we don't blow up on reduce.
        if (Array.isArray(r.data)) {
          const items = r.data;
          const total = items.reduce((s, x) => s + (x.rating || 0), 0);
          setData({
            reviews: items.map((x) => ({
              id: x.id,
              booking_id: x.booking_id,
              rating: x.rating,
              comment: x.comment,
              created_at: x.created_at,
              reviewer_name: t("reviews.client_fallback"),
            })),
            count: items.length,
            average: items.length ? Math.round((total / items.length) * 10) / 10 : 0,
          });
        } else {
          setData(r.data || { reviews: [], count: 0, average: 0 });
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line
  }, []);

  const dateLocale = i18n.language === "en" ? "en-US" : "pt-BR";

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" />
        <ProfileMenu />
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="font-display text-2xl font-bold text-navy flex items-center gap-2">
            <Star size={20} className="text-amber-400 fill-amber-400" />
            {t("reviews.title")}
          </h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader size={20} className="animate-spin" />
          </div>
        ) : error ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-red-500">{t("reviews.load_error")}</p>
          </div>
        ) : (
          <>
            {/* Summary card */}
            <div className="card p-5 mb-4 flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 flex flex-col items-center justify-center flex-shrink-0">
                <p className="text-2xl font-bold text-amber-700 leading-none">
                  {data.count > 0 ? data.average.toFixed(1) : "—"}
                </p>
                <Star size={12} className="fill-amber-400 text-amber-400 mt-0.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-navy">
                  {t("reviews.overall")}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t("reviews.count", { count: data.count })}
                </p>
              </div>
            </div>

            {/* Review list */}
            {data.count === 0 ? (
              <div className="card p-8 text-center">
                <MessageSquareQuote size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-500">{t("reviews.empty")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.reviews.map((r) => (
                  <div key={r.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy truncate">
                          {r.reviewer_name || t("reviews.client_fallback")}
                        </p>
                        {r.service_type && (
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {r.service_type}
                            {r.booking_code && (
                              <span className="text-slate-400"> · {r.booking_code}</span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <StarRow value={r.rating || 0} />
                        {r.created_at && (
                          <p className="text-[10px] text-slate-400 mt-1">
                            {new Date(r.created_at).toLocaleDateString(dateLocale, {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                    {r.comment && (
                      <p className="text-sm text-slate-600 leading-snug mt-1">
                        {r.comment}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Reviews;