import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import HeroSection from "../components/sections/HeroSection";
import {
  TrustBar, WhyChoose, TrustHighlights, HowItWorks, Professionals,
  Stats, Safety, Testimonials, CTASection
} from "../components/sections/Sections";

const ROLE_HOME = {
  client:     "/dashboard/client",
  nurse:             "/dashboard/professional",
  technician:        "/dashboard/professional",
  nursing_assistant: "/dashboard/professional",
  caregiver:         "/dashboard/professional",
  admin:      "/admin",
};

const Home = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role  = localStorage.getItem("role");
    if (token && role && ROLE_HOME[role]) {
      navigate(ROLE_HOME[role], { replace: true });
    }
  }, [navigate]);

  return (
    <main>
      <HeroSection />
      <TrustBar />
      <WhyChoose />
      <TrustHighlights />
      <HowItWorks />
      <Professionals />
      <Stats />
      <Safety />
      <Testimonials />
      <CTASection />
    </main>
  );
};

export default Home;