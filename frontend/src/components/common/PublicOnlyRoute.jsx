import { Navigate } from "react-router-dom";

const ROLE_HOME = {
  client:     "/dashboard/client",
  nurse:      "/dashboard/professional",
  technician: "/dashboard/professional",
  caregiver:  "/dashboard/professional",
  admin:      "/admin",
};

// Prevents logged-in users from accessing login/register pages
const PublicOnlyRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  const role  = localStorage.getItem("role");

  if (token && role) {
    return <Navigate to={ROLE_HOME[role] || "/dashboard/client"} replace />;
  }

  return children;
};

export default PublicOnlyRoute;