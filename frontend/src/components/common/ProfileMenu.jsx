import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, User, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";

const ProfileMenu = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const fullName = localStorage.getItem("full_name") || "Usuário";
  const role = localStorage.getItem("role") || "";
  const initials = fullName.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    toast.success("Até logo!");
    navigate("/login");
  };

  const roleLabel = {
    client:       "Cliente",
    nurse:        "Enfermeiro(a)",
    technician:   "Técnico de Enfermagem",
    caregiver:    "Cuidador(a)",
    admin:        "Admin",
  }[role] || role;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-brand-gradient flex items-center justify-center text-white text-xs font-bold">
          {initials}
        </div>
        <span className="hidden sm:block text-sm font-medium text-slate-700 max-w-[120px] truncate">
          {fullName.split(" ")[0]}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-hover border border-slate-100 z-50 overflow-hidden">
          {/* User info */}
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-navy truncate">{fullName}</p>
            <p className="text-xs text-slate-500 mt-0.5">{roleLabel}</p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              onClick={() => { setOpen(false); navigate(role === "client" ? "/dashboard/client" : "/dashboard/professional"); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <User size={15} className="text-slate-400" />
              Meu perfil
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={15} className="text-red-400" />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileMenu;