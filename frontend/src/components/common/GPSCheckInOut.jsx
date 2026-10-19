import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Clock, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const GPSCheckInOut = ({ booking, onUpdate }) => {
  const { t } = useTranslation();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [loading, setLoading] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [waitingTimer, setWaitingTimer] = useState(null);

  const isAccepted = booking.status === "accepted";
  const isCheckedIn = booking.status === "checked_in";

  // 15-min arrival waiting timer
  useEffect(() => {
    if (!isCheckedIn || !booking.arrival_timer_start) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - new Date(booking.arrival_timer_start).getTime()) / 1000 / 60;
      const remaining = Math.max(0, 15 - elapsed);
      setWaitingTimer(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [isCheckedIn, booking.arrival_timer_start]);

  const getGPS = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(t("gps_checkin.gps_unavailable")); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => reject(err.code === 1 ? t("gps_checkin.allow_location") : t("gps_checkin.location_error")),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  const handleCheckIn = async () => {
    setLoading(true); setGpsError(null);
    try {
      const gps = await getGPS();
      const { data } = await axios.post(`${API}/api/bookings/${booking.id}/checkin`, gps, { headers });
      toast.success(data.message);
      if (data.flagged) toast(t("gps_checkin.out_of_range"), { icon: "📍" });
      onUpdate?.();
    } catch (err) {
      const msg = typeof err === "string" ? err : err.response?.data?.detail || t("gps_checkin.checkin_error");
      setGpsError(msg); toast.error(msg);
    } finally { setLoading(false); }
  };

  const handleCheckOut = async () => {
    setLoading(true); setGpsError(null);
    try {
      const gps = await getGPS();
      const { data } = await axios.post(`${API}/api/bookings/${booking.id}/checkout`, gps, { headers });
      toast.success(data.message);
      onUpdate?.();
    } catch (err) {
      const msg = typeof err === "string" ? err : err.response?.data?.detail || t("gps_checkin.checkout_error");
      setGpsError(msg); toast.error(msg);
    } finally { setLoading(false); }
  };

  const handleNoShow = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/bookings/${booking.id}/client-no-show`, {}, { headers });
      toast.success(data.message);
      onUpdate?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("gps_checkin.noshow_error"));
    } finally { setLoading(false); }
  };

  const handleTerminateEarly = async (reason, isSerious = false) => {
    setLoading(true);
    try {
      let gps = { latitude: null, longitude: null };
      try { gps = await getGPS(); } catch {}
      const { data } = await axios.post(`${API}/api/bookings/${booking.id}/terminate-early`, {
        reason, is_serious: isSerious, ...gps
      }, { headers });
      toast.success(data.message);
      onUpdate?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("gps_checkin.terminate_error"));
    } finally { setLoading(false); }
  };

  if (!isAccepted && !isCheckedIn) return null;

  const sendQuickMessage = async (text) => {
    try {
      await axios.post(`${API}/api/messages`, {
        booking_id: booking.id,
        content: text,
      }, { headers });
      toast.success(t("gps_checkin.message_sent"));
    } catch { toast.error(t("gps_checkin.message_error")); }
  };

  return (
    <div className="p-4 rounded-xl border border-blue-200 bg-blue-50 space-y-3">
      <div className="flex items-center gap-2">
        <MapPin size={16} className="text-blue-500" />
        <p className="text-sm font-semibold text-navy">
          {isAccepted ? t("gps_checkin.checkin_title") : t("gps_checkin.in_progress")}
        </p>
      </div>

      {/* Quick messages */}
      {isAccepted && (
        <button onClick={() => sendQuickMessage(t("gps_checkin.on_my_way_message"))}
          className="w-full text-xs py-2 rounded-lg bg-green-100 text-green-700 font-semibold hover:bg-green-200 transition-colors">
          🚗 {t("gps_checkin.on_my_way")}
        </button>
      )}

      {gpsError && (
        <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle size={13} className="text-red-500" />
          <p className="text-xs text-red-600">{gpsError}</p>
        </div>
      )}

      {/* Check-in button */}
      {isAccepted && (
        <button onClick={handleCheckIn} disabled={loading}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
          <MapPin size={14} /> {loading ? t("gps_checkin.getting_location") : t("gps_checkin.do_checkin")}
        </button>
      )}

      {/* Checked in — show timer + checkout + actions */}
      {isCheckedIn && (
        <>
          <div className="flex items-center gap-2 text-xs text-green-600">
            <CheckCircle size={13} />
            <span>{t("gps_checkin.checked_in_at")} {booking.actual_checkin && new Date(booking.actual_checkin).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>

          {/* Arrival waiting timer */}
          {waitingTimer !== null && waitingTimer > 0 && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <Clock size={13} className="text-amber-500" />
              <p className="text-xs text-amber-700">
                {t("gps_checkin.waiting_client", { minutes: Math.floor(waitingTimer) })}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={handleCheckOut} disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50">
              <CheckCircle size={13} /> {loading ? "..." : t("gps_checkin.checkout")}
            </button>
            {waitingTimer !== null && waitingTimer <= 0 && (
              <button onClick={handleNoShow} disabled={loading}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-1.5">
                <XCircle size={13} /> No-show
              </button>
            )}
          </div>

          {/* Early termination */}
          <button onClick={() => {
            const reason = prompt(t("gps_checkin.early_termination_prompt"));
            if (reason) handleTerminateEarly(reason);
          }} className="w-full text-xs text-slate-500 hover:text-red-500 py-1 transition-colors">
            {t("gps_checkin.early_termination")}
          </button>
        </>
      )}
    </div>
  );
};

export default GPSCheckInOut;