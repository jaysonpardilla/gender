
export default function ProductShowcase(){
  const cards = ['Dashboard','New Analysis','Upload Document','Reports','Word Guide','Profile'];
  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory">
        {cards.map((c) => (
          <div key={c} className="snap-center min-w-[280px] rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur hover:scale-105 transition">
            <div className="h-40 bg-gradient-to-br from-purple-700 to-indigo-600 rounded-lg shadow-inner" />
            <div className="mt-4 text-white font-semibold">{c}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
