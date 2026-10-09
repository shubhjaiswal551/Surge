import React, { useState, useEffect } from 'react';
import GoogleButton from '../components/auth/GoogleButton';
import LoginForm from '../components/auth/LoginForm';
import SignupForm from '../components/auth/SignupForm';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

type AuthTab = 'login' | 'signup';

const LogoMark: React.FC = () => {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/logo.png"
        alt="SafeCrowd Logo"
        className="h-10 w-auto max-w-[48px] object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.08)] shrink-0"
      />
      <div className="flex flex-col leading-tight">
        <span className="text-slate-900 font-bold tracking-tight text-base font-sans">
          SafeCrowd
        </span>
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono font-semibold">
          Control Center
        </span>
      </div>
    </div>
  );
};

const Landing: React.FC = () => {
  const [tab, setTab] = useState<AuthTab>('login');
  const { loading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      const hasDemo = sessionStorage.getItem('safecrowd_demo_user');
      if (user || hasDemo) {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [loading, user, navigate]);

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] text-slate-900 flex flex-col justify-between">
      {/* Top Header */}
      <header className="w-full border-b border-slate-200/80 px-8 py-3 flex items-center justify-between bg-white/80 backdrop-blur-xl sticky top-0 z-20">
        <LogoMark />
        <div className="flex items-center gap-4 text-xs font-sans">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-700 font-medium text-xs shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Node Gateway Online</span>
          </div>
          <span className="text-slate-400 hidden sm:inline text-xs font-medium">
            v1.2.0 Stable
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-5xl grid lg:grid-cols-12 gap-10 items-center">
          {/* Left info column */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-[#0071e3] text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0071e3]"></span>
              <span>Surveillance Intelligence System</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-tight">
                Real-Time Crowd Anomaly & Surge Detection.
              </h1>
              <p className="text-slate-600 text-sm leading-relaxed max-w-xl">
                Automated computer vision surveillance pipeline engineered for transit hubs,
                public squares, and high-density venues. Continuously monitors spatial flow vectors,
                density thresholds, and anomalous bottlenecks.
              </p>
            </div>

            {/* Technical Parameters Matrix */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-white/85 border border-slate-200/80 shadow-xs backdrop-blur-md">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Model Pipeline</div>
                <div className="text-xs font-mono font-semibold text-slate-900 mt-1">
                  YOLOv8 + ByteTrack
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Spatial Vector Analysis</div>
              </div>
              <div className="p-3.5 rounded-xl bg-white/85 border border-slate-200/80 shadow-xs backdrop-blur-md">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Processing Latency</div>
                <div className="text-xs font-mono font-semibold text-emerald-600 mt-1">
                  ~18ms Inference
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Real-time Stream</div>
              </div>
              <div className="p-3.5 rounded-xl bg-white/85 border border-slate-200/80 shadow-xs backdrop-blur-md col-span-2 sm:col-span-1">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Monitored Feeds</div>
                <div className="text-xs font-mono font-semibold text-[#0071e3] mt-1">
                  4 Active Feeds
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Multi-Zone Perception</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-100/80 border border-slate-200/80 text-xs text-slate-600 flex items-start gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 mt-0.5 shrink-0">
                <path d="M12 9v4M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
              </svg>
              <span>
                Restricted access. All operator actions, incident acknowledgements, and video session logs are cryptographically timestamped and audited.
              </span>
            </div>
          </div>

          {/* Right login card */}
          <div className="lg:col-span-5">
            <div className="card p-6 bg-white/90 backdrop-blur-xl border border-slate-200/80 shadow-glass">
              <div className="mb-5 flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">
                    Operator Access
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Sign in to initialize monitoring session
                  </p>
                </div>
                <div className="mac-segmented flex items-center">
                  <button
                    type="button"
                    onClick={() => setTab('login')}
                    className={`px-3 py-1 text-xs transition-all ${
                      tab === 'login'
                        ? 'mac-pill-active'
                        : 'text-slate-600 hover:text-slate-900 font-medium'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('signup')}
                    className={`px-3 py-1 text-xs transition-all ${
                      tab === 'signup'
                        ? 'mac-pill-active'
                        : 'text-slate-600 hover:text-slate-900 font-medium'
                    }`}
                  >
                    Register
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <GoogleButton
                  label={
                    tab === 'signup' ? 'Sign up with Google' : 'Continue with Google'
                  }
                />

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                    or operator credentials
                  </span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <div key={tab}>
                  {tab === 'login' ? <LoginForm /> : <SignupForm />}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 text-[11px] text-slate-400 font-mono leading-relaxed text-center">
                Session Tier: Operator Level 2 · Demo & Firebase Auth Compliant
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-slate-200/80 px-8 py-3.5 flex items-center justify-between text-xs text-slate-500 bg-white/60 backdrop-blur-md">
        <span>© {new Date().getFullYear()} SafeCrowd Systems</span>
        <span className="text-slate-400">Security Operations Console · Internal Use Only</span>
      </footer>
    </div>
  );
};

export default Landing;
