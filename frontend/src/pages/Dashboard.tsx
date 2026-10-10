import React, { useState, useMemo, useEffect, useRef } from 'react';
import Sidebar from '../components/dashboard/Sidebar';
import StatusBar from '../components/dashboard/StatusBar';
import AlertFeed from '../components/dashboard/AlertFeed';
import ZoneCapacityMatrix from '../components/dashboard/ZoneCapacityMatrix';
import RiskScoreGauge from '../components/dashboard/RiskScoreGauge';
import OperationalDispatchHub from '../components/dashboard/OperationalDispatchHub';
import AnomalyDistributionCard from '../components/dashboard/AnomalyDistributionCard';
import AnimatedCounter from '../components/dashboard/AnimatedCounter';
import RubberSegment from '../components/ui/RubberSegment';
import { useCrowdContext } from '../context/CrowdContext';
import {
  deriveZoneCapacity,
  computeRiskScore,
  type RiskScoreResult,
} from '../config/crowdSafety';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type HeadcountPoint = { t: string; cam001: number; cam002: number; cam003: number; cam004: number };

const Dashboard: React.FC = () => {
  const [timeWindow, setTimeWindow] = useState<'5m' | '15m' | '1h'>('15m');
  const {
    cameras,
    alerts,
    incidents,
    activeFeedsCount,
    unacknowledgedAlertsCount,
    todayIncidentsCount,
    isWsConnected,
    acknowledgeAlert,
    resolveAlert,
  } = useCrowdContext();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Telemetry rolling window state
  const [history, setHistory] = useState<HeadcountPoint[]>(() => {
    const arr: HeadcountPoint[] = [];
    const now = Date.now();
    for (let i = 11; i >= 0; i--) {
      const t = new Date(now - i * 30_000);
      const hh = t.getHours().toString().padStart(2, '0');
      const mm = t.getMinutes().toString().padStart(2, '0');
      const ss = t.getSeconds().toString().padStart(2, '0');
      arr.push({
        t: `${hh}:${mm}:${ss}`,
        cam001: 22 + Math.round(Math.random() * 3),
        cam002: 8 + Math.round(Math.random() * 2),
        cam003: 185 + Math.round(Math.random() * 6),
        cam004: 20 + Math.round(Math.random() * 3),
      });
    }
    return arr;
  });

  // Keep rolling telemetry history updated with live camera counts
  useEffect(() => {
    const ticker = window.setInterval(() => {
      const t = new Date();
      const hh = t.getHours().toString().padStart(2, '0');
      const mm = t.getMinutes().toString().padStart(2, '0');
      const ss = t.getSeconds().toString().padStart(2, '0');

      const c1 = cameras.find((c) => c.cameraId === 'cam-001')?.headcount ?? 22;
      const c2 = cameras.find((c) => c.cameraId === 'cam-002')?.headcount ?? 8;
      const c3 = cameras.find((c) => c.cameraId === 'cam-003')?.headcount ?? 185;
      const c4 = cameras.find((c) => c.cameraId === 'cam-004')?.headcount ?? 20;

      const nextPoint: HeadcountPoint = {
        t: `${hh}:${mm}:${ss}`,
        cam001: c1,
        cam002: c2,
        cam003: c3,
        cam004: c4,
      };

      setHistory((prev) => [...prev.slice(1), nextPoint]);
    }, 15_000);

    return () => clearInterval(ticker);
  }, [cameras]);

  // Aggregate Metrics & Derived Capacities
  const { totalHeadcount, totalCapacity, maxCapacityRatio, maxRatioZoneName } = useMemo(() => {
    let sumCount = 0;
    let sumCap = 0;
    let highestRatio = 0;
    let topZone = 'Main Terminal Gate';

    for (const c of cameras) {
      sumCount += c.headcount;
      const cap = deriveZoneCapacity(c.areaSqM);
      if (cap) {
        sumCap += cap;
        const ratio = c.headcount / cap;
        if (ratio > highestRatio) {
          highestRatio = ratio;
          topZone = c.zoneName;
        }
      }
    }

    return {
      totalHeadcount: sumCount,
      totalCapacity: sumCap > 0 ? sumCap : 900,
      maxCapacityRatio: highestRatio,
      maxRatioZoneName: topZone,
    };
  }, [cameras]);

  // Pure Risk Score Calculation
  const risk: RiskScoreResult = useMemo(() => {
    // 1. Highest unresolved severity (1-5)
    const unackSeverities = alerts
      .filter((a) => !a.acknowledged)
      .map((a) => (a.severity === 'critical' ? 5 : a.severity === 'high' ? 4 : a.severity === 'warning' ? 3 : 1));
    const highestSev = unackSeverities.length > 0 ? Math.max(...unackSeverities) : 0;

    // 2. Highest turbulence from camera metrics
    const turbulences = cameras.map((c) => (c.metrics as any)?.turbulence ?? 0.15);
    const highestTurb = Math.max(0.1, ...turbulences);

    return computeRiskScore(maxCapacityRatio, highestSev, highestTurb, maxRatioZoneName);
  }, [alerts, cameras, maxCapacityRatio, maxRatioZoneName]);

  // Synchronized color token for Risk Score
  const riskBandStyles = {
    safe: {
      accent: 'text-emerald-600',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      bar: 'bg-emerald-500',
      border: 'border-slate-200',
      label: 'Safe Margin',
    },
    elevated: {
      accent: 'text-amber-600',
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      bar: 'bg-amber-500',
      border: 'border-amber-200',
      label: 'Elevated Pressure',
    },
    critical: {
      accent: 'text-rose-600',
      badge: 'bg-rose-50 text-rose-700 border-rose-200',
      bar: 'bg-rose-600',
      border: 'border-rose-200',
      label: 'Critical Surge',
    },
  }[risk.band];

  // Rule-based Recommendation generator
  const ruleRecommendation = useMemo(() => {
    if (risk.band === 'critical') {
      return `${maxRatioZoneName} is exceeding 85% safe capacity threshold with active surge detected. Recommend initiating crowd rerouting to relieve flow.`;
    }
    if (risk.band === 'elevated') {
      return `${maxRatioZoneName} is under elevated occupancy. Keep sector turnstiles monitored and ensure corridor egress is clear.`;
    }
    return undefined;
  }, [risk.band, maxRatioZoneName]);

  const fillPercent = ((totalHeadcount / totalCapacity) * 100).toFixed(1);

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#f5f5f7]">
      <Sidebar alertCount={unacknowledgedAlertsCount} />
      <div className="flex-1 flex flex-col min-w-0">
        <StatusBar activeAlertCount={unacknowledgedAlertsCount} />

        {/* Operator Toast Notification */}
        {toastMessage && (
          <div className="fixed top-16 right-8 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-white/20 flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-medium">{toastMessage}</span>
          </div>
        )}

        <main className="flex-1 overflow-y-auto min-h-0">
          <div className="px-6 md:px-8 py-6 space-y-6 max-w-[1720px] mx-auto">
            
            {/* Top Operational KPI Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
              
              {/* KPI 1: People Monitored */}
              <div className="card card-interactive p-5 flex flex-col justify-between hover:border-slate-300">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    People Monitored
                  </span>
                  <span className={isWsConnected ? 'chip-safe flex items-center gap-1.5' : 'chip bg-blue-50 text-blue-600 border-blue-200'}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 radar-pip" />
                    <span>{isWsConnected ? 'Live Sensing' : 'Real-Time'}</span>
                  </span>
                </div>
                <div className="font-sans text-3xl font-extrabold my-2.5 tracking-tight tabular-nums text-slate-900 flex items-baseline gap-1.5">
                  <AnimatedCounter value={totalHeadcount} />
                  <span className="text-xs font-normal text-slate-400">/ {totalCapacity} cap</span>
                </div>
                <div className="w-full bg-slate-100/90 rounded-full h-1.5 overflow-hidden mb-2.5">
                  <div
                    className="bg-[#0071e3] h-1.5 rounded-full transition-all duration-700 ease-out live-shimmer-bar"
                    style={{ width: `${Math.min(100, parseFloat(fillPercent))}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 font-medium flex justify-between items-center">
                  <span>{fillPercent}% Overall Load</span>
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Capacity Safe
                  </span>
                </div>
              </div>

              {/* KPI 2: Overall Safety Risk Index */}
              <div className={`card card-interactive p-5 flex flex-col justify-between ${riskBandStyles.border}`}>
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Safety Risk Index
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${riskBandStyles.badge}`}>
                    {riskBandStyles.label}
                  </span>
                </div>
                <div className={`font-sans text-3xl font-extrabold my-2.5 tracking-tight tabular-nums flex items-baseline gap-1.5 ${riskBandStyles.accent}`}>
                  <AnimatedCounter value={risk.score} />
                  <span className="text-xs font-normal text-slate-400">/ 100 Index</span>
                </div>
                <div className="w-full bg-slate-100/90 rounded-full h-1.5 overflow-hidden mb-2.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-700 ease-out live-shimmer-bar ${riskBandStyles.bar}`}
                    style={{ width: `${risk.score}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-600 font-medium truncate" title={risk.topContributor}>
                  {risk.topContributor}
                </div>
              </div>

              {/* KPI 3: Active Alerts & Today's Incidents */}
              <div className="card card-interactive p-5 flex flex-col justify-between hover:border-slate-300">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Unresolved Alerts
                  </span>
                  <span className={unacknowledgedAlertsCount > 0 ? 'chip-danger' : 'chip-safe'}>
                    {unacknowledgedAlertsCount > 0 ? 'Action Req' : 'All Clear'}
                  </span>
                </div>
                <div
                  className={`font-sans text-3xl font-extrabold my-2.5 tracking-tight tabular-nums flex items-baseline gap-1.5 ${
                    unacknowledgedAlertsCount > 0 ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  <AnimatedCounter value={unacknowledgedAlertsCount} />
                  <span className="text-xs font-normal text-slate-400">pending</span>
                </div>
                <div className="w-full bg-slate-100/90 rounded-full h-1.5 overflow-hidden mb-2.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-700 ease-out live-shimmer-bar ${
                      unacknowledgedAlertsCount > 0 ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, unacknowledgedAlertsCount * 25)}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 font-medium flex justify-between items-center">
                  <span>{todayIncidentsCount} incidents today</span>
                  <span className={unacknowledgedAlertsCount > 0 ? 'text-rose-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                    {unacknowledgedAlertsCount > 0 ? 'Triage' : 'Nominal'}
                  </span>
                </div>
              </div>

              {/* KPI 4: Cameras Online */}
              <div className="card card-interactive p-5 flex flex-col justify-between hover:border-slate-300">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Cameras & Sensors
                  </span>
                  <span className="chip-safe font-mono">{activeFeedsCount} / {cameras.length} Active</span>
                </div>
                <div className="font-sans text-3xl font-extrabold my-2.5 tracking-tight tabular-nums text-emerald-600 flex items-baseline gap-1">
                  <AnimatedCounter value={activeFeedsCount} />
                  <span className="text-slate-400">/</span>
                  <span>{cameras.length}</span>
                </div>
                <div className="w-full bg-slate-100/90 rounded-full h-1.5 overflow-hidden mb-2.5">
                  <div className="bg-emerald-500 h-1.5 rounded-full live-shimmer-bar" style={{ width: '100%' }} />
                </div>
                <div className="text-[11px] text-slate-500 font-medium flex justify-between items-center">
                  <span>YOLOv8s Pipeline</span>
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    100% Health
                  </span>
                </div>
              </div>

            </div>

            {/* Rule-Based Recommendation Banner */}
            <RiskScoreGauge
              risk={risk}
              ruleRecommendation={ruleRecommendation}
              onExecuteRecommendation={() => showToast('Crowd divert protocol logged to audit table (simulated)')}
            />

            {/* Main Command Center Grid: 2 Columns */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              
              {/* Left Column (Span 2): Zone Capacity Matrix + Telemetry Trend */}
              <div className="xl:col-span-2 space-y-5">
                
                {/* 1. Zone Capacity Matrix (REPLACES CAMERA VIDEO FEEDS) */}
                <ZoneCapacityMatrix cameras={cameras} alerts={alerts} />

                {/* 2. Headcount Telemetry Trend Chart */}
                <div className="card p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <div className="text-xs font-bold text-slate-900 tracking-tight">
                        Headcount Telemetry Trend
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Rolling vector window across monitored zone nodes (15s sample interval)
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <RubberSegment
                        items={['5m', '15m', '1h']}
                        value={timeWindow}
                        onChange={(val) => setTimeWindow(val as '5m' | '15m' | '1h')}
                        size="sm"
                        trackColor="#e2e8f0"
                        thumbColor="#ffffff"
                        textColor="#64748b"
                        activeTextColor="#0f172a"
                        radius={10}
                        inset={2.5}
                        speed={1}
                        aria-label="Time window selection"
                      />
                      <div className="hidden sm:flex items-center gap-3 text-xs font-sans text-slate-600">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500" />
                          Terminal Gate
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          North Corridor
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          Concourse
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={history} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gRose" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gAmber" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.15} />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 2" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="t"
                          stroke="#64748b"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          fontFamily="JetBrains Mono, monospace"
                        />
                        <YAxis
                          stroke="#64748b"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          fontFamily="JetBrains Mono, monospace"
                        />
                        <Tooltip
                          contentStyle={{
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            fontSize: 11,
                            color: '#0f172a',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.08)',
                          }}
                          labelStyle={{ color: '#475569', fontFamily: 'JetBrains Mono, monospace' }}
                          itemStyle={{ fontFamily: 'JetBrains Mono, monospace' }}
                        />
                        <Area
                          type="monotone"
                          dataKey="cam003"
                          name="Main Terminal Gate"
                          stroke="#f43f5e"
                          strokeWidth={2}
                          fill="url(#gRose)"
                          isAnimationActive={true}
                          animationDuration={800}
                          animationEasing="ease-out"
                        />
                        <Area
                          type="monotone"
                          dataKey="cam001"
                          name="North Transit Corridor"
                          stroke="#f59e0b"
                          strokeWidth={1.5}
                          fill="url(#gAmber)"
                          isAnimationActive={true}
                          animationDuration={800}
                          animationEasing="ease-out"
                        />
                        <Area
                          type="monotone"
                          dataKey="cam002"
                          name="Central Concourse"
                          stroke="#3b82f6"
                          strokeWidth={1.5}
                          fill="url(#gBlue)"
                          isAnimationActive={true}
                          animationDuration={800}
                          animationEasing="ease-out"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>

              {/* Right Column (Span 1): Operational Dispatch + Live Alert Feed */}
              <div className="space-y-5">
                
                {/* Operational SOP Dispatch Hub */}
                <OperationalDispatchHub
                  cameras={cameras}
                  incidents={incidents}
                  riskScore={risk.score}
                  riskBand={risk.band}
                  onDispatchAction={showToast}
                />

                {/* Spatial Anomaly Distribution */}
                <AnomalyDistributionCard
                  incidents={incidents}
                  alerts={alerts}
                />

                {/* Live Alert Feed (Preserved as requested) */}
                <div className="h-[460px]">
                  <AlertFeed
                    alerts={alerts}
                    onAcknowledge={acknowledgeAlert}
                    onResolve={resolveAlert}
                  />
                </div>

              </div>

            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
