import logo from '../assets/logo.png';

export default function Footer() {
  return (
    <footer id="about" className="scroll-mt-24 bg-slate-950 text-slate-300">
      <div className="relative overflow-hidden bg-slate-900/95 px-6 py-9 shadow-inner shadow-black/20 sm:px-8 lg:px-12">
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-violet-600/10 to-transparent" aria-hidden="true" />
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[1.8fr_1fr_1fr_1fr] lg:items-start">
            <div className="space-y-5">
              <div className="flex items-center gap-3 text-2xl font-semibold text-white">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-3xl bg-gradient-to-br from-purple-900 to-indigo-800 text-white shadow-xl shadow-violet-500/20">
                  <img src={logo} alt="FairScript logo" className="h-17 w-17" />
                </span>
                FairScript
              </div>
              <p className="max-w-md text-md leading-5 text-slate-400">
                Empowering teams with inclusive language review tools, fair reporting, and real-time editing confidence across documents and workflows.
              </p>
              <div className="flex flex-wrap gap-3 text-sm">
                <a href="#features" className="rounded-full bg-white/5 px-4 py-2 text-slate-100 transition hover:bg-white/15">Features</a>
                <a href="#reports" className="rounded-full bg-white/5 px-4 py-2 text-slate-100 transition hover:bg-white/15">Reports</a>
                <a href="#guide" className="rounded-full bg-white/5 px-4 py-2 text-slate-100 transition hover:bg-white/15">Word Guide</a>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Product</h3>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                <li>
                  <a href="#features" className="transition hover:text-white">Features</a>
                </li>
                <li>
                  <a href="#reports" className="transition hover:text-white">Reports</a>
                </li>
                <li>
                  <a href="#guide" className="transition hover:text-white">Word Guide</a>
                </li>
                <li>
                  <a href="#pricing" className="transition hover:text-white">Pricing</a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Company</h3>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                <li>
                  <a href="#about" className="transition hover:text-white">About</a>
                </li>
                <li>
                  <a href="#blog" className="transition hover:text-white">Blog</a>
                </li>
                <li>
                  <a href="#careers" className="transition hover:text-white">Careers</a>
                </li>
                <li>
                  <a href="#contact" className="transition hover:text-white">Contact</a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Stay connected</h3>
              <p className="mt-4 text-sm leading-5 text-slate-400">
                Subscribe for product updates, inclusive language tips, and release news.
              </p>
              <form className="mt-6 flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  aria-label="Email address"
                  placeholder="Your email"
                  className="min-w-0 flex-1 rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20"
                />
                <button
                  type="submit"
                  className="rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110"
                >
                  Subscribe
                </button>
              </form>
              <div className="mt-8 flex items-center gap-3 text-slate-400">
                <span className="text-sm uppercase tracking-[0.16em]">Follow</span>
                <a href="#" className="transition hover:text-white">LinkedIn</a>
                <a href="#" className="transition hover:text-white">Twitter</a>
                <a href="#" className="transition hover:text-white">GitHub</a>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-white/10 pt-6 text-sm text-slate-500 text-center">
            <p>© {new Date().getFullYear()} FairScript. Built for inclusive communication.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
