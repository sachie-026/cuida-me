import HeroSection from "../components/sections/HeroSection";
import {
  TrustBar, HowItWorks, Professionals,
  Stats, Safety, Testimonials, CTASection
} from "../components/sections/Sections";
import RegisterSection from "../components/sections/RegisterSection";

const Home = () => (
  <main>
    <HeroSection />
    <TrustBar />
    <HowItWorks />
    <Professionals />
    <Stats />
    <Safety />
    <Testimonials />
    <RegisterSection />
    <CTASection />
  </main>
);

export default Home;
