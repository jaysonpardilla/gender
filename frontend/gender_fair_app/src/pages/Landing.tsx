import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import StatsRibbon from '../components/StatsRibbon';
import BentoGrid from '../components/BentoGrid';
import LivePlayground from '../components/LivePlayground';
import ShowcaseCards from '../components/ShowcaseCards';
import HowItWorks from '../components/HowItWorks';
import CTA from '../components/CTA';
import Footer from '../components/Footer';

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-white selection:bg-purple-300 selection:text-slate-900 text-[18px] leading-7">
      <Navbar />

      <main>
        <Hero />
        <StatsRibbon /> 
        <LivePlayground />
        <ShowcaseCards />  
        <HowItWorks />
        <BentoGrid />
        <CTA />
      </main>

      <Footer />
    </div>
  );
}
