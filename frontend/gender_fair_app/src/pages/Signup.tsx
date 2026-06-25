/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../services/authService';

const animationStyles = `
  @keyframes float {
    0%, 100% { transform: translateX(0) translateY(0); opacity: 0.3; }
    50% { opacity: 0.7; }
    100% { transform: translateX(100vw) translateY(100vh); opacity: 0; }
  }
  @keyframes float-slow {
    0%, 100% { transform: translateX(0) translateY(0); opacity: 0.2; }
    50% { opacity: 0.5; }
    100% { transform: translateX(-100vw) translateY(-100vh); opacity: 0; }
  }
  .particle {
    position: fixed;
    pointer-events: none;
  }
  .particle-1 { animation: float 20s linear infinite; }
  .particle-2 { animation: float-slow 25s linear infinite; }
  .particle-3 { animation: float 22s linear infinite; }
  .particle-4 { animation: float-slow 24s linear infinite; }
  .particle-5 { animation: float 26s linear infinite; }
`;

export default function Signup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    password_confirm: '',
    role: 'user' as 'user' | 'admin',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.password_confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      await authService.signup(formData);
      navigate('/login');
    } catch (err: any) {
      console.error('Signup error:', err);
      let message = 'Signup failed. Please try again.';
      const data = err.response?.data;
      if (data) {
        if (typeof data === 'string') {
          message = data;
        } else if (data.detail) {
          message = data.detail;
        } else if (data.email?.[0]) {
          message = data.email[0];
        } else if (data.password?.[0]) {
          message = data.password[0];
        } else if (data.non_field_errors?.[0]) {
          message = data.non_field_errors[0];
        } else {
          message = JSON.stringify(data);
        }
      } else if (err.message) {
        message = err.message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };


  

  return (
    <>
      <style>{animationStyles}</style>
      <div className="h-screen bg-slate-950 text-slate-100 flex overflow-hidden">
        {/* Left artwork + content */}
        <div className="relative w-3/5 h-screen flex justify-center items-center overflow-hidden bg-gradient-to-b from-slate-900 to-slate-950">
          <div className="particle particle-1" style={{ left: '10%', top: '10%', width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#22d3ee', animationDelay: '0s' }} />
          <div className="particle particle-2" style={{ left: '20%', top: '30%', width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#a78bfa', animationDelay: '5s' }} />
          <div className="particle particle-3" style={{ left: '60%', top: '20%', width: '2px', height: '2px', borderRadius: '50%', backgroundColor: '#22d3ee', animationDelay: '10s' }} />
          <div className="particle particle-4" style={{ left: '30%', top: '70%', width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#a78bfa', animationDelay: '15s' }} />

          <div className="w-full h-full flex items-center justify-center">
            <svg
              viewBox="0 100 200 320"
              className="h-full w-full"
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow dx="0" dy="10" stdDeviation="18" floodColor="#000" floodOpacity="0.35" />
                </filter>
              </defs>

              <g filter="url(#shadow)">
                <path d="M200,0 C170,30 80,30 60,90 C40,150 80,210 110,240 C140,270 180,290 200,360 L0,360 L0,0 Z" fill="#0538A5" opacity="0.98" />
                <path d="M200,80 C174,110 84,110 68,168 C52,226 84,274 118,304 C152,334 182,354 200,420 L0,420 L0,80 Z" fill="#092571" opacity="0.96" />
              </g>
            </svg>
          </div>

          <div className="absolute left-12 top-1/2 transform -translate-y-1/2 z-20 hidden sm:block">
            <div className="max-w-md px-4" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial" }}>
              <h3 className="text-3xl sm:text-4xl font-extrabold text-cyan-200 leading-tight">Gender-Fair Writing</h3>
              <p className="mt-3 text-base text-slate-200 leading-relaxed max-w-lg">Smart tools to detect biased language, suggest gender-neutral alternatives, and generate inclusive reports for your documents.</p>

              <ul className="mt-6 space-y-4 text-sm text-slate-200">
                <li className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-cyan-300 flex-shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Bias detection & contextual suggestions</span>
                </li>

                <li className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-cyan-300 flex-shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M3 7h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M14 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M21 17H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M10 20l-3-3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Gender-neutral wording alternatives</span>
                </li>

                <li className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-cyan-300 flex-shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Exportable inclusive writing reports</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Form Right Side */}
        <div className="relative w-2/5 h-screen flex items-start justify-center px-4 overflow-y-auto bg-slate-950">
          <div className="particle particle-1" style={{ left: '15%', top: '15%', width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#a78bfa', animationDelay: '2s' }} />
          <div className="w-full max-w-sm relative rounded-[1.75rem] bg-slate-980/95 border-b-2 p-8 shadow-2xl shadow-black/40 sm:p-10">
            <div className="text-center">
              <h2 className="mt-4 text-2xl font-semibold text-white">Create your account</h2>
            </div>

            {error && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-11/12 sm:w-80 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200 z-30">
                  {error}
                </div>
              )}

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="first_name" className="block text-sm font-medium text-slate-300 mb-2">First Name</label>
                  <input
                    type="text"
                    id="first_name"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleChange}
                    required
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20"
                    placeholder="John"
                  />
                </div>

                <div>
                  <label htmlFor="last_name" className="block text-sm font-medium text-slate-300 mb-2">Last Name</label>
                  <input
                    type="text"
                    id="last_name"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleChange}
                    required
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20"
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">Email address</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  minLength={8}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20"
                  placeholder="••••••••"
                />
                <p className="text-xs text-slate-400 mt-1">At least 8 characters</p>
              </div>

              <div>
                <label htmlFor="password_confirm" className="block text-sm font-medium text-slate-300 mb-2">Confirm Password</label>
                <input
                  type="password"
                  id="password_confirm"
                  name="password_confirm"
                  value={formData.password_confirm}
                  onChange={handleChange}
                  required
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label htmlFor="role" className="block text-sm font-medium text-slate-300 mb-2">Role</label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition hover:brightness-110 disabled:opacity-50"
              >
                {loading ? 'Creating account...' : 'Sign Up'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-400">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-white hover:text-violet-200">
                Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
