import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem("token");
  const role  = localStorage.getItem("role");

  if (!token) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(role)) {
    // Redirect to correct dashboard
    const dest = ["nurse","technician","caregiver"].includes(role)
      ? "/dashboard/professional"
      : "/dashboard/client";
    return <Navigate to={dest} replace />;
  }
  return children;
};

export default ProtectedRoute;