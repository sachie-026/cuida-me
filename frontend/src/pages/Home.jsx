import HeroSection from "../components/sections/HeroSection";
import {
  TrustBar, HowItWorks, Professionals,
  Stats, Safety, Testimonials, CTASection
} from "../components/sections/Sections";

const Home = () => (
  <main>
    <HeroSection />
    <TrustBar />
    <HowItWorks />
    <Professionals />
    <Stats />
    <Safety />
    <Testimonials />
    <CTASection />
  </main>
);

export default Home;
