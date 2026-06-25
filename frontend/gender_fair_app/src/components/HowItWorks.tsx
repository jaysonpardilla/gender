import { motion } from 'framer-motion';

export default function HowItWorks(){
  const steps = [
    {title: 'Upload or Paste', desc: 'PDF, DOCX or plain text'},
    {title: 'Analyze', desc: 'Real-time inclusive suggestions'},
    {title: 'Export', desc: 'Apply replacements or export report'}
  ];

  return (
    <section id="word-guide" className="scroll-mt-10 mx-auto max-w-7xl px-16 py-0 mb-10">
      <h3 className="text-2xl font-bold text-white">How it works</h3>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {steps.map((s, idx) => (
          <div key={s.title} className="rounded-xl bg-white/5 border border-white/10 p-6">
            <motion.div initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: idx * 0.1 }}>
              <div className="text-lg font-semibold text-white">{s.title}</div>
              <div className="text-sm text-slate-300 mt-2">{s.desc}</div>
            </motion.div>
          </div>
        ))}
      </div>
    </section>
  );
}
