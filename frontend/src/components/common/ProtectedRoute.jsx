import { Navigate } from "react-router-dom";

const ROLE_HOME = {
  client:     "/dashboard/client",
  nurse:      "/dashboard/professional",
  technician: "/dashboard/professional",
  caregiver:  "/dashboard/professional",
  admin:      "/admin",
};

const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem("token");
  const role  = localStorage.getItem("role");

  // Not logged in → go to login
  if (!token) return <Navigate to="/login" replace />;

  // Wrong role → redirect to their correct home
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={ROLE_HOME[role] || "/login"} replace />;
  }

  return children;
};

export default ProtectedRoute;