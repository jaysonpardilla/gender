import { motion } from 'framer-motion';

export default function LivePlayground(){
  return (
    <section id="playground" className="scroll-mt-24 mx-auto max-w-7xl px-16 pb-12">
      <div className="rounded-[1rem] border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.55 }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Live bias replacement playground</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">See suggestions before you apply them</h2>
          </div>
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-200">
            Real-time edits • Transparent results
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_auto_1fr] items-center">
          <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Original</p>
            <div className="mt-5 rounded-3xl border border-white/10 bg-slate-900/90 p-6 text-lg leading-8 text-slate-200">
              The <span className="font-semibold text-rose-400">chairman</span> instructed <span className="font-semibold text-rose-400">his</span> employees.
            </div>
          </div>

          <div className="flex items-center justify-center text-4xl sm:text-5xl font-semibold text-slate-500" role="img" aria-hidden="true">→</div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Inclusive alternative</p>
            <div className="mt-5 rounded-3xl border border-white/10 bg-slate-900/90 p-6 text-lg leading-8 text-white">
              The <span className="font-semibold text-emerald-300">chairperson</span> instructed <span className="font-semibold text-emerald-300">their</span> employees.
            </div>
          </div>
        </div>
      </motion.div>
      </div>
    </section>
  );
}
