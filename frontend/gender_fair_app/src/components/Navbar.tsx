import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import logo from '../assets/logo.png';

export default function Navbar() {
  return (
    <div className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/95 backdrop-blur-2xl">
      <motion.header
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
      <div className="mx-auto grid max-w-7xl grid-cols-3 items-center px-6 py-4">
        <div className="flex items-center gap-4">
          <a href="#hero" className="flex items-center gap-3 text-lg font-semibold text-white">
            <img src={logo} alt="FairScript logo" className="h-11 w-11 rounded-2xl object-contain" />
            <span className="hidden md:inline">FairScript</span>
          </a>
        </div>

        <nav className="flex justify-center items-center gap-8 text-xs font-medium uppercase tracking-[0.08em] text-slate-300">
          <a href="#features" className="transition hover:text-white">Features</a>
          <Link to="/reports" className="transition hover:text-white">Reports</Link>
          <a href="#word-guide" className="transition hover:text-white">Word Guide</a>
          <a href="#pricing" className="transition hover:text-white">Pricing</a>
          <a href="#about" className="transition hover:text-white">About</a>
        </nav>

        <div className="flex justify-end items-center gap-3">
          <Link
            to="/signup"
            className="hidden rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white md:inline-flex"
          >
            Signup
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-indigo-500 px-5 py-2 text-sm font-semibold text-white shadow-xl shadow-purple-500/20 transition hover:opacity-95"
          >
            Get Started
          </Link>
        </div>
      </div>
      </motion.header>
    </div>
  );
}
