import { motion } from 'framer-motion';

export default function CTA(){
  return (
    <section id="pricing" className="scroll-mt-24 mx-auto max-w-7xl px-16 pb-20">
      <div className="rounded-[1rem] border border-white/10 bg-gradient-to-br from-purple-600/20 via-slate-900/70 to-indigo-600/20 p-10 shadow-2xl shadow-purple-500/10 backdrop-blur-xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        >
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Ready to reduce bias across every document?</p>
              <h2 className="mt-4 text-4xl font-semibold text-white">Make your writing inclusive today</h2>
              <p className="mt-4 max-w-2xl text-lg text-slate-300">Start a free trial or book a demo to bring inclusive language workflows into your team's editing process.</p>
            </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:justify-end">
            <a className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 px-7 py-3 text-sm font-semibold text-white transition hover:opacity-95">Start Free</a>
          </div>
        </div>
      </motion.div> 
    </div>
    </section>
  );
}
