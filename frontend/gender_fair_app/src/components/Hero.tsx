import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, FileText } from 'lucide-react';
import heroImage from '../assets/hero-section-right.png';

export default function Hero() {
  return (
    <section id="hero" className="scroll-mt-24 relative overflow-hidden px-6 py-10 lg:px-5 lg:py-15">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.25),_transparent_15%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_20%)]" />
      <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-slate-950/70 to-transparent" />
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-16 lg:grid-cols-[0.80fr_1.16fr] lg:items-center">
          <div className="relative z-10">
          <motion.div
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200 shadow-sm shadow-slate-950/20">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-violet-400" />
              RULE-BASED • ACCURATE • REAL-TIME
            </div>

            <h1 className="mt-8 max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Promote Inclusive Writing with{' '}
              <span className="bg-gradient-to-r from-purple-400 via-fuchsia-400 to-indigo-300 bg-clip-text text-transparent">
                Gender-Fair Language Analysis
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Detect gender bias, receive intelligent suggestions, and improve fairness in academic and professional writing with one polished platform.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 px-7 py-3 text-sm font-semibold text-white shadow-xl shadow-purple-500/25 transition hover:opacity-95"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/signup"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-7 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/10"
              >
                Create Account
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              {['PDF', 'DOCX', 'TXT', 'Real-Time'].map((tag) => {
                const TagIcon = tag === 'Rule-Based' || tag === 'Real-Time' ? Sparkles : FileText;
                return (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-slate-200 shadow-sm shadow-slate-950/20"
                  >
                    <TagIcon className="h-3.5 w-3.5 text-violet-300" />
                    {tag}
                  </span>
                );
              })}
            </div>
          </motion.div>
          </div>

          <div className="relative">
          <motion.div
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          >
            <div className="mx-auto max-w-[980px] overflow-hidden rounded-[1rem] shadow-2xl shadow-slate-950/40 lg:max-w-none">
              <img src={heroImage} alt="Hero dashboard preview" className="w-full rounded-[1rem] object-cover" />
            </div>
          </motion.div>
        </div>
        </div>
      </div>
    </section>
  );
}
