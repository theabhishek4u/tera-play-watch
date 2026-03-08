import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import PlayerSection from "@/components/PlayerSection";
import FeaturesSection from "@/components/FeaturesSection";
import AboutSection from "@/components/AboutSection";
import Footer from "@/components/Footer";

const Index = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <HeroSection />
    <PlayerSection />
    <FeaturesSection />
    <AboutSection />
    <Footer />
  </div>
);

export default Index;
