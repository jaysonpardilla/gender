import { motion } from 'framer-motion';
import { FileText, Upload, Sparkles } from 'lucide-react';

export default function BentoGrid(){
  return (
    <section className="mx-auto max-w-7xl px-16 pb-12">
      <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20 backdrop-blur-xl">
            <motion.div whileHover={{ y: -6 }}>
              <div className="inline-flex items-center justify-center rounded-3xl bg-gradient-to-br from-purple-500 to-indigo-500 p-3 text-white shadow-lg">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-xl font-semibold text-white">Text input</h3>
              <p className="mt-3 text-base text-slate-400">Paste or type content into the editor and get instant analysis.</p>
            </motion.div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20 backdrop-blur-xl">
            <motion.div whileHover={{ y: -6 }}>
              <div className="inline-flex items-center justify-center rounded-3xl bg-gradient-to-br from-purple-500 to-indigo-500 p-3 text-white shadow-lg">
                <Upload className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-xl font-semibold text-white">PDF upload</h3>
              <p className="mt-3 text-base text-slate-400">Upload documents for deep review without losing formatting.</p>
            </motion.div>
          </div>
        </div>

        <div className="rounded-[1rem] border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-slate-950/90 p-8 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
          <motion.div whileHover={{ y: -6 }}>
            <div className="inline-flex items-center justify-center rounded-full bg-white/5 px-4 py-2 text-sm uppercase tracking-[0.25em] text-slate-300">Real-time replacement engine</div>
            <h3 className="mt-6 text-3xl font-semibold text-white">Smart suggestions, seamless edits</h3>
            <p className="mt-4 text-base text-slate-400">Our engine highlights biased phrases and suggests inclusive alternatives as you review your drafts.</p>

            <div className="mt-8 flex items-center gap-3 text-slate-300">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-3xl bg-purple-500/10 text-purple-300"><Sparkles className="h-5 w-5" /></div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Live updates</p>
                <p className="text-sm font-semibold text-white">Every change is reflected instantly.</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
