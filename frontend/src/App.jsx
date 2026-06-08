import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "react-hot-toast";
import "./i18n";

import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import ProtectedRoute from "./components/common/ProtectedRoute";

import Home from "./pages/Home";
import Login from "./pages/auth/Login";
import ClientDashboard from "./pages/client/Dashboard";
import ProfessionalDashboard from "./pages/professional/Dashboard";
import NotFound from "./pages/NotFound";

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "";

const PublicLayout = ({ children }) => (
  <>
    <Navbar />
    {children}
    <Footer />
  </>
);

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        <Routes>
          {/* Public */}
          <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
          <Route path="/login" element={<Login />} />

          {/* Protected — client */}
          <Route path="/dashboard/client" element={
            <ProtectedRoute allowedRoles={["client"]}>
              <ClientDashboard />
            </ProtectedRoute>
          } />

          {/* Protected — professional */}
          <Route path="/dashboard/professional" element={
            <ProtectedRoute allowedRoles={["nurse","technician","caregiver"]}>
              <ProfessionalDashboard />
            </ProtectedRoute>
          } />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

export default App;