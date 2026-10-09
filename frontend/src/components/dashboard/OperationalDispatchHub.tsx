import React from 'react';
import type { CameraState, Incident } from '../../types/crowdEvent';
import { deriveZoneCapacity } from '../../config/crowdSafety';
import { API_BASE_URL } from '../../config/api';

interface OperationalDispatchHubProps {
  cameras: CameraState[];
  incidents: Incident[];
  riskScore: number;
  riskBand: string;
  onDispatchAction: (actionMsg: string) => void;
}

export const OperationalDispatchHub: React.FC<OperationalDispatchHubProps> = ({
  cameras,
  incidents,
  riskScore,
  riskBand,
  onDispatchAction,
}) => {
  // Dynamically compute the highest-load target zone
  const highestLoadZone = React.useMemo(() => {
    let topCam = cameras[0];
    let topRatio = -1;

    for (const c of cameras) {
      const cap = deriveZoneCapacity(c.areaSqM);
      const ratio = cap ? (c.headcount / cap) * 100 : c.headcount;
      if (ratio > topRatio) {
        topRatio = ratio;
        topCam = c;
      }
    }
    const cap = deriveZoneCapacity(topCam?.areaSqM);
    const ratioStr = cap ? `${((topCam.headcount / cap) * 100).toFixed(1)}% Cap` : `${topCam?.headcount} P`;
    return {
      cam: topCam,
      ratioStr,
    };
  }, [cameras]);

  const targetName = highestLoadZone.cam?.zoneName || 'Main Concourse';
  const targetCid = highestLoadZone.cam?.cameraId?.toUpperCase() || 'CAM-001';

  const postDispatchAudit = async (action: string, notes?: string) => {
    try {
      const token = localStorage.getItem('safecrowd_token');
      await fetch(`${API_BASE_URL}/operations/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action,
          target_zone_id: highestLoadZone.cam?.zoneId || highestLoadZone.cam?.cameraId,
          target_camera_id: highestLoadZone.cam?.cameraId,
          notes,
        }),
      });
    } catch {
      // Offline fallback
    }
  };

  const handleExportSitrep = () => {
    const sitrepData = {
      generated_at: new Date().toISOString(),
      venue: 'SafeCrowd Operations Command',
      overall_risk_score: riskScore,
      risk_band: riskBand,
      target_priority_zone: `${targetName} (${targetCid})`,
      zones: cameras.map((c) => {
        const cap = deriveZoneCapacity(c.areaSqM);
        return {
          camera_id: c.cameraId,
          name: c.zoneName,
          area_sq_m: c.areaSqM ?? null,
          capacity: cap,
          headcount: c.headcount,
          density_p_m2: c.areaSqM ? parseFloat((c.headcount / c.areaSqM).toFixed(2)) : null,
          flow_direction: c.flowDirection,
        };
      }),
      active_incidents_count: incidents.filter((i) => i.status !== 'resolved').length,
    };

    const blob = new Blob([JSON.stringify(sitrepData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SafeCrowd_SitRep_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onDispatchAction('Downloaded Situation Report (JSON)');
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
        <h2 className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" className="text-amber-500">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          Operational SOP Dispatch
        </h2>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-[#0071e3] border border-blue-200/80">
          Standard Protocol
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Operator response SOP. Actions target dynamic highest-load sector.
      </p>

      {/* Dynamically Computed Target Zone Badge */}
      <div className="mb-3 px-3 py-2 rounded-xl bg-slate-50/80 border border-slate-200/70 text-xs">
        <span className="text-slate-400 font-medium">Computed Highest-Load Target:</span>
        <div className="font-bold text-slate-800 mt-0.5 flex items-center justify-between">
          <span>{targetName}</span>
          <span className="text-[11px] font-mono text-amber-600 font-semibold">{targetCid} · {highestLoadZone.ratioStr}</span>
        </div>
      </div>

      <div className="space-y-2">
        {/* Action 1: Dispatch Patrol */}
        <button
          type="button"
          onClick={() => {
            postDispatchAudit('dispatch_patrol', `Priority response to ${targetName}`);
            onDispatchAction(`Dispatched Safety Patrol to ${targetName} (${targetCid})`);
          }}
          className="w-full text-left p-2.5 rounded-xl bg-white/90 border border-slate-200/80 hover:border-[#0071e3]/60 hover:bg-blue-50/20 active:scale-[0.98] transition-all flex items-center justify-between group shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-800 group-hover:text-[#0071e3] transition-colors">
                Dispatch Safety Patrol
              </div>
              <div className="text-[11px] text-slate-500">Deploy Unit to {targetCid}</div>
            </div>
          </div>
          <span className="text-xs text-slate-300 group-hover:text-[#0071e3] group-hover:translate-x-0.5 transition-all">→</span>
        </button>

        {/* Action 2: Initiate Crowd Rerouting */}
        <button
          type="button"
          onClick={() => {
            postDispatchAudit('crowd_reroute', `Flow rerouting advisory for ${targetName}`);
            onDispatchAction(`Initiated Crowd Rerouting advisory to relieve load at ${targetName}`);
          }}
          className="w-full text-left p-2.5 rounded-xl bg-white/90 border border-slate-200/80 hover:border-amber-400/60 hover:bg-amber-50/20 active:scale-[0.98] transition-all flex items-center justify-between group shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="18" r="3" />
                <circle cx="6" cy="6" r="3" />
                <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                <path d="M6 9v12" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-800 group-hover:text-amber-700 transition-colors">
                Initiate Crowd Rerouting
              </div>
              <div className="text-[11px] text-slate-500">Advisory to relieve congestion</div>
            </div>
          </div>
          <span className="text-xs text-slate-300 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all">→</span>
        </button>

        {/* Action 3: Export SitRep JSON */}
        <button
          type="button"
          onClick={() => {
            postDispatchAudit('sitrep_export', 'Situation report snapshot exported');
            handleExportSitrep();
          }}
          className="w-full text-left p-2.5 rounded-xl bg-white/90 border border-slate-200/80 hover:border-emerald-400/60 hover:bg-emerald-50/20 active:scale-[0.98] transition-all flex items-center justify-between group shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-800 group-hover:text-emerald-700 transition-colors">
                Export SitRep Snapshot
              </div>
              <div className="text-[11px] text-slate-500">Download telemetry & incident JSON</div>
            </div>
          </div>
          <span className="text-xs text-slate-300 group-hover:text-emerald-600 group-hover:translate-y-0.5 transition-all">↓</span>
        </button>
      </div>
    </div>
  );
};

export default OperationalDispatchHub;
