import { motion } from 'framer-motion';
import { ChartPie } from 'lucide-react';
import { ShieldCheck } from 'lucide-react';
import { FileText, Users } from 'lucide-react';

const cards = [
  { title: 'Dashboard', icon: ChartPie, description: 'Control the entire review cycle from one place.' },
  { title: 'New Analysis', icon: FileText, description: 'Submit text or files instantly and view results.' },
  { title: 'Upload Document', icon: Users, description: 'Support PDF/DOCX uploads for polished output.' },
  { title: 'Reports', icon: ShieldCheck, description: 'Generate fairness summaries and export metrics.' },
  { title: 'Word Guide', icon: ChartPie, description: 'Improve inclusive language with smart word rules.' },
];

export default function ShowcaseCards() {
  return (
    <section id="reports" className="scroll-mt-24 mx-auto max-w-7xl px-16 pb-12">
      <div className="grid gap-6 lg:grid-cols-5">
        {cards.map((card, idx) => (
          <div
            key={card.title}
            className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-slate-950/20 backdrop-blur-xl"
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06, duration: 0.45 }}
            >
              <div className="inline-flex items-center justify-center rounded-3xl bg-gradient-to-br from-purple-500 to-indigo-500 p-3 text-white shadow-xl">
                <card.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-white">{card.title}</h3>
              <p className="mt-3 text-base leading-7 text-slate-400">{card.description}</p>
            </motion.div>
          </div>
        ))}
      </div>
    </section>
  );
}
