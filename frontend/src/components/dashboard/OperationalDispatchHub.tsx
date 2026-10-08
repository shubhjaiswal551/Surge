import React from 'react';
import type { CameraState, Incident } from '../../types/crowdEvent';
import { deriveZoneCapacity } from '../../config/crowdSafety';

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
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-amber-500">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          Operational SOP Dispatch
        </h2>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 uppercase">
          Simulated Actions
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Operator response SOP. Actions target dynamic highest-load sector.
      </p>

      {/* Dynamically Computed Target Zone Badge */}
      <div className="mb-3 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
        <span className="text-slate-400 font-medium">Computed Highest-Load Target:</span>
        <div className="font-bold text-slate-800 mt-0.5">
          {targetName} ({targetCid} · {highestLoadZone.ratioStr})
        </div>
      </div>

      <div className="space-y-2.5">
        {/* Action 1: Dispatch Patrol */}
        <button
          type="button"
          onClick={() => onDispatchAction(`Dispatched Safety Patrol to ${targetName} (${targetCid})`)}
          className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 transition flex items-center justify-between group"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
              🛡️
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 group-hover:text-blue-700">Dispatch Safety Patrol</div>
              <div className="text-[11px] text-slate-500">Deploy Unit to {targetCid}</div>
            </div>
          </div>
          <span className="text-[11px] text-blue-600 font-bold">Simulated →</span>
        </button>

        {/* Action 2: Initiate Crowd Rerouting */}
        <button
          type="button"
          onClick={() => onDispatchAction(`Initiated Crowd Rerouting advisory to relieve load at ${targetName}`)}
          className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/30 transition flex items-center justify-between group"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm">
              🔀
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 group-hover:text-amber-700">Initiate Crowd Rerouting</div>
              <div className="text-[11px] text-slate-500">Advisory to relieve congestion</div>
            </div>
          </div>
          <span className="text-[11px] text-amber-600 font-bold">Simulated →</span>
        </button>

        {/* Action 3: Export SitRep JSON (Strictly JSON, no PDF claim) */}
        <button
          type="button"
          onClick={handleExportSitrep}
          className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30 transition flex items-center justify-between group"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
              📄
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">Export SitRep Snapshot</div>
              <div className="text-[11px] text-slate-500">Download telemetry & incident JSON</div>
            </div>
          </div>
          <span className="text-[11px] text-emerald-600 font-bold">JSON ↓</span>
        </button>
      </div>
    </div>
  );
};

export default OperationalDispatchHub;
