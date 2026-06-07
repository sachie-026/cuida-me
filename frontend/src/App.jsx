import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "react-hot-toast";
import "./i18n";

import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import Home from "./pages/Home";
import Login from "./pages/auth/Login";
import ClientDashboard from "./pages/client/Dashboard";
import ProfessionalDashboard from "./pages/professional/Dashboard";

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "";

// Layout wrapper for public pages (with nav + footer)
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

          {/* Dashboards (auth protected — add ProtectedRoute later) */}
          <Route path="/dashboard/client" element={<ClientDashboard />} />
          <Route path="/dashboard/professional" element={<ProfessionalDashboard />} />
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

export default App;
