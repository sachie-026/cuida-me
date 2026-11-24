// Item 3 (24/11/2026) — Reviews page with three tabs (Recebidas / Feitas /
// Pendentes). Shared by clients and pros via ProfileMenu → Avaliações.
//
// Tabs:
//   - Recebidas: ratings this user has received
//   - Feitas:    ratings this user has given to others
//   - Pendentes: completed bookings the user can still rate (not yet rated
//                AND rating window is still open per Rule #2 — until the
//                user's next booking request)
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Star, MessageSquareQuote, Loader } from "lucide-react";
import axios from "axios";
import Logo from "../../components/common/Logo";
import ProfileMenu from "../../components/common/ProfileMenu";
import RatingModal from "../../components/common/RatingModal";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";
const PRO_ROLES = ["nurse", "technician", "nursing_assistant", "caregiver"];

const StarRow = ({ value }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} size={14}
        className={n <= value ? "fill-amber-400 text-amber-400" : "text-slate-200"} />
    ))}
  </div>
);

const Reviews = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("user_id");
  const role = (localStorage.getItem("role") || "").toLowerCase();
  const isPro = PRO_ROLES.includes(role);
  const headers = { Authorization: `Bearer ${token}` };

  const [tab, setTab] = useState("received"); // received | given | pending
  const [received, setReceived] = useState({ reviews: [], count: 0, average: 0 });
  const [given, setGiven] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [ratingBooking, setRatingBooking] = useState(null);

  const load = useCallback(() => {
    if (!userId) { setLoading(false); return; }
    setLoading(true); setError(false);
    const p1 = axios.get(`${API}/api/ratings/professional/${userId}`, { headers })
      .then((r) => {
        const d = r.data;
        if (Array.isArray(d)) {
          const total = d.reduce((s, x) => s + (x.rating || 0), 0);
          setReceived({ reviews: d, count: d.length, average: d.length ? total / d.length : 0 });
        } else {
          setReceived(d || { reviews: [], count: 0, average: 0 });
        }
      });
    const p2 = axios.get(`${API}/api/ratings/user/${userId}/given`, { headers })
      .then((r) => setGiven(Array.isArray(r.data) ? r.data : []));
    const p3 = axios.get(`${API}/api/bookings/my-bookings`, { headers })
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        setPending(list.filter((b) => b.current_user_can_rate));
      });
    Promise.allSettled([p1, p2, p3])
      .then((results) => {
        if (results.every((x) => x.status === "rejected")) setError(true);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line
  }, []);

  useEffect(() => { load(); }, [load]);

  const dateLocale = i18n.language === "en" ? "en-US" : "pt-BR";
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString(dateLocale,
    { day: "2-digit", month: "short", year: "numeric" }) : "";

  const TabButton = ({ id, label, count }) => (
    <button onClick={() => setTab(id)}
      className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors
        ${tab === id ? "border-amber-400 text-navy" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
      {label}
      {typeof count === "number" && (
        <span className="ml-1.5 text-xs text-slate-400">({count})</span>
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <Logo size="sm" />
        <ProfileMenu />
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <ChevronLeft size={20} />
          </button>
          <h1 className="font-display text-2xl font-bold text-navy flex items-center gap-2">
            <Star size={20} className="text-amber-400 fill-amber-400" />
            {t("reviews.title")}
          </h1>
        </div>

        {/* Summary card — always visible for pros; still useful for clients
            whose pros have rated them. */}
        <div className="card p-5 mb-4 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex flex-col items-center justify-center flex-shrink-0">
            <p className="text-2xl font-bold text-amber-700 leading-none">
              {received.count > 0 ? received.average.toFixed(1) : "—"}
            </p>
            <Star size={12} className="fill-amber-400 text-amber-400 mt-0.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-navy">{t("reviews.overall")}</p>
            <p className="text-xs text-slate-500 mt-0.5">{t("reviews.count", { count: received.count })}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
          <TabButton id="received" label={t("reviews.tab_received")} count={received.count} />
          <TabButton id="given"    label={t("reviews.tab_given")}    count={given.length} />
          <TabButton id="pending"  label={t("reviews.tab_pending")}  count={pending.length} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader size={20} className="animate-spin" />
          </div>
        ) : error ? (
          <div className="card p-8 text-center"><p className="text-sm text-red-500">{t("reviews.load_error")}</p></div>
        ) : (
          <>
            {tab === "received" && (received.reviews.length === 0 ? (
              <div className="card p-8 text-center">
                <MessageSquareQuote size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-500">{t("reviews.empty_received")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {received.reviews.map((r) => (
                  <div key={r.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy truncate">
                          {r.reviewer_name || t("reviews.client_fallback")}
                        </p>
                        {r.service_type && (
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {r.service_type}
                            {r.booking_code && <span className="text-slate-400"> · {r.booking_code}</span>}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <StarRow value={r.rating || 0} />
                        {r.created_at && <p className="text-[10px] text-slate-400 mt-1">{fmtDate(r.created_at)}</p>}
                      </div>
                    </div>
                    {r.comment && <p className="text-sm text-slate-600 leading-snug mt-1">{r.comment}</p>}
                  </div>
                ))}
              </div>
            ))}

            {tab === "given" && (given.length === 0 ? (
              <div className="card p-8 text-center">
                <MessageSquareQuote size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-500">{t("reviews.empty_given")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {given.map((r) => (
                  <div key={r.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-500">{t("reviews.given_to")}</p>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          #{(r.booking_id || "").slice(0, 6).toUpperCase()}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <StarRow value={r.rating || 0} />
                        {r.created_at && <p className="text-[10px] text-slate-400 mt-1">{fmtDate(r.created_at)}</p>}
                      </div>
                    </div>
                    {r.comment && <p className="text-sm text-slate-600 leading-snug mt-1">{r.comment}</p>}
                  </div>
                ))}
              </div>
            ))}

            {tab === "pending" && (pending.length === 0 ? (
              <div className="card p-8 text-center">
                <MessageSquareQuote size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-500">{t("reviews.empty_pending")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pending.map((b) => (
                  <div key={b.id} className="card p-4 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy truncate">
                        {b.service_type || t("reviews.service_fallback")}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {isPro ? (b.client_name || t("reviews.client_fallback"))
                               : (b.professional_name || t("reviews.pro_fallback"))}
                        {b.scheduled_start && <span className="text-slate-400"> · {fmtDate(b.scheduled_start)}</span>}
                      </p>
                    </div>
                    <button onClick={() => setRatingBooking(b)}
                      className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                      <Star size={12} /> {t("reviews.rate_button")}
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      {ratingBooking && (
        <RatingModal booking={ratingBooking}
          revieweeId={isPro ? ratingBooking.user_id : (ratingBooking.professional_user_id || undefined)}
          onClose={() => setRatingBooking(null)}
          onDone={() => { setRatingBooking(null); load(); }} />
      )}
    </div>
  );
};

export default Reviews;