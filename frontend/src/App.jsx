import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "react-hot-toast";
import "./i18n";

import Navbar         from "./components/layout/Navbar";
import Footer         from "./components/layout/Footer";
import ProtectedRoute from "./components/common/ProtectedRoute";

import Home                  from "./pages/Home";
import Login                 from "./pages/auth/Login";
import Register              from "./pages/auth/Register";
import NotFound              from "./pages/NotFound";
import ClientDashboard       from "./pages/client/Dashboard";
import ClientProfile         from "./pages/client/Profile";
import NewBooking            from "./pages/client/NewBooking";
import ProfessionalDashboard from "./pages/professional/Dashboard";
import ProfessionalProfile   from "./pages/professional/Profile";
import AdminDashboard        from "./pages/admin/Dashboard";

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "";

const CLIENT_ROLES = ["client"];
const PRO_ROLES    = ["nurse", "technician", "caregiver"];
const ADMIN_ROLES  = ["admin"];

const PublicLayout = ({ children }) => (
  <><Navbar />{children}<Footer /></>
);

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        <Routes>
          {/* Public */}
          <Route path="/"         element={<PublicLayout><Home /></PublicLayout>} />
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Client only */}
          <Route path="/dashboard/client" element={
            <ProtectedRoute allowedRoles={CLIENT_ROLES}><ClientDashboard /></ProtectedRoute>
          } />
          <Route path="/profile/client" element={
            <ProtectedRoute allowedRoles={CLIENT_ROLES}><ClientProfile /></ProtectedRoute>
          } />
          <Route path="/booking/new" element={
            <ProtectedRoute allowedRoles={CLIENT_ROLES}><NewBooking /></ProtectedRoute>
          } />

          {/* Professional only */}
          <Route path="/dashboard/professional" element={
            <ProtectedRoute allowedRoles={PRO_ROLES}><ProfessionalDashboard /></ProtectedRoute>
          } />
          <Route path="/profile/professional" element={
            <ProtectedRoute allowedRoles={PRO_ROLES}><ProfessionalProfile /></ProtectedRoute>
          } />

          {/* Admin only */}
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminDashboard /></ProtectedRoute>
          } />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

export default App;