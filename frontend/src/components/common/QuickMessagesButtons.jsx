import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader, Send } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

/** Change 44a — One-tap quick-message chips.
 *
 * Fires a dedicated notification event via POST /bookings/{id}/quick-message,
 * NOT a chat message. The recipient sees it in their notification center / push.
 *
 * Props:
 *   - booking: needs {id, status}
 *   - side:    "pro" | "client" — which set of chips to render
 *   - onSent:  optional callback after a successful fire
 *
 * Safe no-op when booking / status is outside the allowed set.
 * Server enforces role per message_type, so even if the UI showed the wrong
 * chip it would come back 403 (handled with a toast).
 */
const ALLOWED_STATUSES = ["accepted", "professional_arrived", "checked_in"];

const QuickMessagesButtons = ({ booking, side, onSent }) => {
  const { t } = useTranslation();
  const [busyKind, setBusyKind] = useState(null);
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  if (!booking?.id || !booking?.status) return null;
  if (!ALLOWED_STATUSES.includes(booking.status)) return null;
  if (side !== "pro" && side !== "client") return null;

  const chips =
    side === "pro"
      ? [
          { kind: "on_the_way", label: t("quick_messages.on_the_way"), icon: "🚗" },
        ]
      : [
          { kind: "client_ready",   label: t("quick_messages.client_ready"),   icon: "✓" },
          { kind: "client_waiting", label: t("quick_messages.client_waiting"), icon: "⏱" },
        ];

  const send = async (kind) => {
    if (busyKind) return;
    setBusyKind(kind);
    try {
      await axios.post(
        `${API}/api/bookings/${booking.id}/quick-message`,
        { message_type: kind },
        { headers }
      );
      toast.success(t("quick_messages.sent"));
      onSent?.(kind);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(detail || t("quick_messages.send_error"));
    } finally {
      setBusyKind(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => {
        const isBusy = busyKind === c.kind;
        return (
          <button
            key={c.kind}
            onClick={(e) => { e.stopPropagation(); send(c.kind); }}
            disabled={!!busyKind}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 transition-colors">
            {isBusy ? <Loader size={12} className="animate-spin" /> : <span>{c.icon}</span>}
            {c.label}
          </button>
        );
      })}
    </div>
  );
};

export default QuickMessagesButtons;