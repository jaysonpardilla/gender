import { motion } from 'framer-motion';

export default function StatsRibbon(){
  const stats = [
    { value: '10K+', label: 'Documents analyzed' },
    { value: '5K+', label: 'Active users' },
    { value: '120+', label: 'Universities' },
    { value: '24/7', label: 'Support' },
  ];

  return (
    <div id="features" className="scroll-mt-24 mx-auto max-w-7xl px-16 pb-10">
      <div className="mt-9 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
        >
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/20">
              <div className="text-3xl font-semibold text-white">{s.value}</div>
              <div className="mt-2 text-sm text-slate-400">{s.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
