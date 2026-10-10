import React, { useState } from 'react';
import Sidebar from '../components/dashboard/Sidebar';
import StatusBar from '../components/dashboard/StatusBar';
import GoogleAuthModal from '../components/auth/GoogleAuthModal';
import RubberSegment from '../components/ui/RubberSegment';
import { useAuth } from '../context/AuthContext';

type SettingsTab = 'all' | 'profile' | 'security' | 'notifications' | 'pipeline';

const Settings: React.FC = () => {
  const { profile, authMode, disableGoogleAuth } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  const handleDisable2FA = async () => {
    if (!window.confirm('Are you sure you want to disable Google Authenticator 2FA?')) {
      return;
    }
    setDisabling(true);
    setDisableError(null);
    try {
      await disableGoogleAuth();
    } catch (err) {
      setDisableError(
        err instanceof Error ? err.message : 'Failed to disable 2FA.',
      );
    } finally {
      setDisabling(false);
    }
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#f5f5f7]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <StatusBar activeAlertCount={0} />

        <main className="flex-1 overflow-y-auto min-h-0">
          <div className="px-6 py-5 max-w-3xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/70">
              <div>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
                  Settings
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Operator profile, security preferences, and pipeline configuration.
                </p>
              </div>

              <RubberSegment
                items={[
                  { value: 'all', label: 'All' },
                  { value: 'profile', label: 'Profile' },
                  { value: 'security', label: 'Security' },
                  { value: 'notifications', label: 'Alerts' },
                  { value: 'pipeline', label: 'Pipeline' },
                ]}
                value={activeTab}
                onChange={(val) => setActiveTab(val as SettingsTab)}
                size="sm"
                trackColor="#e2e8f0"
                thumbColor="#ffffff"
                textColor="#64748b"
                activeTextColor="#0f172a"
                radius={10}
                inset={2.5}
                speed={1}
                aria-label="Settings categories"
              />
            </div>

            {/* Operator Profile */}
            {(activeTab === 'all' || activeTab === 'profile') && (
              <div className="card p-6 space-y-5 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Operator Profile
                    </h2>
                    <p className="text-xs text-slate-400">Identity and active session credentials</p>
                  </div>
                  <span
                    className={`chip ${
                      authMode === 'firebase'
                        ? 'chip-safe'
                        : 'bg-amber-50 text-amber-700 border-amber-200/80'
                    }`}
                  >
                    {authMode === 'firebase' ? 'Firebase Auth' : 'Demo Mode'}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200/80 shadow-sm flex items-center justify-center overflow-hidden">
                    {profile?.photoURL ? (
                      <img
                        src={profile.photoURL}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl font-semibold text-slate-700">
                        {profile?.displayName?.[0]?.toUpperCase() ?? 'O'}
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-base font-semibold text-slate-900">
                      {profile?.displayName ?? 'Operator'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {profile?.email ?? '—'}
                    </div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 pt-0.5">
                      {profile?.role ?? 'operator'} · UID {profile?.uid ?? '—'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Display Name</label>
                    <input
                      className="input-field text-sm"
                      defaultValue={profile?.displayName ?? ''}
                      disabled
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Email Address</label>
                    <input
                      className="input-field text-sm"
                      defaultValue={profile?.email ?? ''}
                      disabled
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Google Authenticator 2FA Security Card */}
            {(activeTab === 'all' || activeTab === 'security') && (
              <div className="card p-6 space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-[#0071e3]">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                        <line x1="12" y1="18" x2="12.01" y2="18" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">
                        Google Authenticator (2FA)
                      </h2>
                      <p className="text-xs text-slate-500">
                        Multi-Factor Authentication via TOTP Mobile App
                      </p>
                    </div>
                  </div>
                  <span
                    className={`chip ${
                      profile?.twoFactorEnabled
                        ? 'chip-safe'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {profile?.twoFactorEnabled ? '2FA Enabled' : 'Disabled'}
                  </span>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed">
                  Add an extra layer of security to your control room operator account. When enabled, signing in requires a 6-digit verification code generated by your Google Authenticator app.
                </p>

                {disableError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                    {disableError}
                  </div>
                )}

                <div className="pt-3 flex items-center justify-between border-t border-slate-100">
                  <div className="text-[11px] text-slate-400">
                    Provider: Firebase Auth TOTP / Google Authenticator
                  </div>

                  {profile?.twoFactorEnabled ? (
                    <button
                      type="button"
                      onClick={handleDisable2FA}
                      disabled={disabling}
                      className="px-4 py-1.5 rounded-full text-xs font-medium bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 transition-colors shadow-sm"
                    >
                      {disabling ? 'Disabling…' : 'Disable 2FA'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(true)}
                      className="btn-primary"
                    >
                      Set Up Google Authenticator
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Alert Notifications */}
            {(activeTab === 'all' || activeTab === 'notifications') && (
              <div className="card p-6 space-y-4 animate-fade-in">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Alert Notifications
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure desktop toasts, auditory chimes, and dispatch triggers
                  </p>
                </div>
                <div className="space-y-2">
                  {[
                    {
                      label: 'Critical severity alerts',
                      desc: 'Push + on-screen for CRITICAL anomalies',
                      checked: true,
                    },
                    {
                      label: 'High severity alerts',
                      desc: 'Push + on-screen for HIGH anomalies',
                      checked: true,
                    },
                    {
                      label: 'Warning alerts',
                      desc: 'On-screen only for WARNING anomalies',
                      checked: true,
                    },
                    {
                      label: 'Email digests',
                      desc: 'Daily incident summary at 08:00 local time',
                      checked: false,
                    },
                    {
                      label: 'Auto-notify security team',
                      desc: 'Trigger escalation workflows for CRITICAL events',
                      checked: true,
                    },
                  ].map((row) => (
                    <label
                      key={row.label}
                      className="flex items-center justify-between gap-4 p-3 rounded-xl border border-slate-200/60 bg-white/50 hover:bg-white hover:border-slate-300/80 transition-all cursor-pointer shadow-sm"
                    >
                      <div>
                        <div className="text-xs font-semibold text-slate-800">{row.label}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {row.desc}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        defaultChecked={row.checked}
                        className="w-4 h-4 rounded text-[#0071e3] focus:ring-[#0071e3] accent-[#0071e3] cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Detection Pipeline & Risk Thresholds */}
            {(activeTab === 'all' || activeTab === 'pipeline') && (
              <div className="card p-6 space-y-5 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Detection Pipeline & Risk Thresholds
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">Real-time edge perception engine parameters</p>
                  </div>
                  <span className="chip chip-safe">Live Backend Connected</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Density Threshold (High)</label>
                    <input className="input-field text-xs mono" defaultValue="3.0 people/m²" readOnly />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Density Threshold (Critical)</label>
                    <input className="input-field text-xs mono" defaultValue="5.0 people/m²" readOnly />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Anomaly Debounce Window</label>
                    <input className="input-field text-xs mono" defaultValue="8 frames (0.8s)" readOnly />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Inference Device</label>
                    <input className="input-field text-xs mono" defaultValue="NVIDIA RTX 4060 (CUDA:0)" readOnly />
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/60 text-emerald-800 text-xs flex items-center gap-2.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-600 shrink-0">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span>Perception Tier (YOLO best.pt) and Analytics Tier (ByteTrack + Anomaly Engine) are operating live at ~10 FPS over WebSocket.</span>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <GoogleAuthModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};

export default Settings;
