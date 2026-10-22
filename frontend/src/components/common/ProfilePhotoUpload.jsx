import { useState, useRef } from "react";
import { Camera, Trash2, Loader } from "lucide-react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const ProfilePhotoUpload = ({ userId, currentPhotoUrl, onPhotoChange }) => {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef(null);
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
      toast.error(t("profile_photo.invalid_type"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("profile_photo.too_large"));
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const { data } = await axios.post(
        `${API}/api/users/${userId}/profile-photo`,
        formData,
        { headers: { ...headers, "Content-Type": "multipart/form-data" } }
      );
      toast.success(t("profile_photo.upload_success"));
      onPhotoChange?.(data.profile_photo_url);
    } catch {
      toast.error(t("profile_photo.upload_error"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t("profile_photo.confirm_delete"))) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/api/users/${userId}/profile-photo`, { headers });
      toast.success(t("profile_photo.delete_success"));
      onPhotoChange?.(null);
    } catch {
      toast.error(t("profile_photo.delete_error"));
    } finally {
      setDeleting(false);
    }
  };

  const initials = (localStorage.getItem("full_name") || "?")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        {currentPhotoUrl ? (
          <img
            src={currentPhotoUrl}
            alt="Profile"
            className="w-20 h-20 rounded-full object-cover border-2 border-slate-200"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xl font-bold border-2 border-slate-200">
            {initials}
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
            <Loader size={20} className="text-white animate-spin" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
          uploading ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-blue-100 text-blue-700 hover:bg-blue-200"
        }`}>
          <Camera size={14} />
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".jpg,.jpeg,.png"
            onChange={handleUpload}
            disabled={uploading}
          />
          {uploading ? t("profile_photo.uploading") : currentPhotoUrl ? t("profile_photo.change") : t("profile_photo.add")}
        </label>
        {currentPhotoUrl && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            <Trash2 size={12} /> {deleting ? "..." : t("profile_photo.remove")}
          </button>
        )}
      </div>
    </div>
  );
};

export default ProfilePhotoUpload;