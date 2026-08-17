import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "react-hot-toast";
import "./i18n";

import Navbar          from "./components/layout/Navbar";
import Footer          from "./components/layout/Footer";
import ProtectedRoute  from "./components/common/ProtectedRoute";
import PublicOnlyRoute from "./components/common/PublicOnlyRoute";

import Home                  from "./pages/Home";
import Login                 from "./pages/auth/Login";
import Register              from "./pages/auth/Register";
import ForgotPassword        from "./pages/auth/ForgotPassword";
import ResetPassword         from "./pages/auth/ResetPassword";
import Terms                 from "./pages/Terms";
import Privacy               from "./pages/Privacy";
import NotFound              from "./pages/NotFound";
import ClientDashboard       from "./pages/client/Dashboard";
import ClientProfile         from "./pages/client/Profile";
import NewBooking            from "./pages/client/NewBooking";
import ProfessionalDashboard from "./pages/professional/Dashboard";
import ProfessionalProfile   from "./pages/professional/Profile";
import Availability          from "./pages/professional/Availability";
import Alerts                from "./pages/alerts/Alerts";
import AliceChatWidget       from "./components/common/AliceChatWidget";
import InvitePage            from "./pages/InvitePage";
import EarningsPage          from "./pages/professional/Earnings";
import PaymentMethodsPage    from "./pages/client/PaymentMethods";
import MyActivity            from "./pages/client/MyActivity";
import AdminSettings         from "./pages/admin/Settings";
import AdminDashboard        from "./pages/admin/Dashboard";
import Messages              from "./pages/messages/Messages";

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "";
const CLIENT_ROLES     = ["client"];
const PRO_ROLES        = ["nurse", "technician", "nursing_assistant", "caregiver"];
const ADMIN_ROLES      = ["admin"];
const ALL_ROLES        = [...CLIENT_ROLES, ...PRO_ROLES, ...ADMIN_ROLES];

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
          <Route path="/"        element={<PublicLayout><Home /></PublicLayout>} />
          <Route path="/terms"   element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />

          {/* Auth */}
          <Route path="/login"           element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
          <Route path="/register"        element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
          <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>} />
          <Route path="/reset-password"  element={<ResetPassword />} />

          {/* Client */}
          <Route path="/dashboard/client" element={<ProtectedRoute allowedRoles={CLIENT_ROLES}><ClientDashboard /></ProtectedRoute>} />
          <Route path="/profile/client"   element={<ProtectedRoute allowedRoles={CLIENT_ROLES}><ClientProfile /></ProtectedRoute>} />
          <Route path="/booking/new"      element={<ProtectedRoute allowedRoles={CLIENT_ROLES}><NewBooking /></ProtectedRoute>} />

          {/* Professional */}
          <Route path="/dashboard/professional" element={<ProtectedRoute allowedRoles={PRO_ROLES}><ProfessionalDashboard /></ProtectedRoute>} />
          <Route path="/profile/professional"   element={<ProtectedRoute allowedRoles={PRO_ROLES}><ProfessionalProfile /></ProtectedRoute>} />
          <Route path="/availability"           element={<ProtectedRoute allowedRoles={PRO_ROLES}><Availability /></ProtectedRoute>} />
          <Route path="/alerts"                element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
          <Route path="/invite"                element={<ProtectedRoute><InvitePage /></ProtectedRoute>} />
          <Route path="/activity"              element={<ProtectedRoute><MyActivity /></ProtectedRoute>} />
          <Route path="/payment-methods"       element={<ProtectedRoute><PaymentMethodsPage /></ProtectedRoute>} />
          <Route path="/earnings"              element={<ProtectedRoute allowedRoles={PRO_ROLES}><EarningsPage /></ProtectedRoute>} />
          <Route path="/admin/settings"        element={<ProtectedRoute allowedRoles={["admin"]}><AdminSettings /></ProtectedRoute>} />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminDashboard /></ProtectedRoute>} />

          {/* Messages — all authenticated users */}
          <Route path="/messages" element={<ProtectedRoute allowedRoles={ALL_ROLES}><Messages /></ProtectedRoute>} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      <AliceChatWidget />
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

export default App;