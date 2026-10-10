import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { API_BASE_URL } from '../../config/api';
import type { DensityLevel } from '../../types/crowdEvent';

interface FlagIncidentModalProps {
  cameraId: string;
  zoneName: string;
  headcount: number;
  density: DensityLevel;
  flowDirection: number;
  videoSrc?: string;
  onClose: () => void;
  onIncidentCreated?: (newIncident: any) => void;
}

const FlagIncidentModal: React.FC<FlagIncidentModalProps> = ({
  cameraId,
  zoneName,
  headcount,
  density,
  flowDirection,
  videoSrc,
  onClose,
  onIncidentCreated,
}) => {
  const [eventType, setEventType] = useState<'surge' | 'bottleneck' | 'dispersal' | 'counter_flow' | 'unauthorized'>('surge');
  const [severity, setSeverity] = useState<number>(4);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const payload = {
      camera_id: cameraId,
      zone_id: `zone-${cameraId}`,
      event_type: eventType,
      severity: severity,
      snapshot_url: videoSrc || '/corridor_chokepoint.webm',
      notes: notes || `Operator manual bookmark: detected ${eventType} with headcount ${headcount}.`,
      metrics: {
        density: density === 'critical' ? 4.8 : density === 'high' ? 3.4 : density === 'moderate' ? 2.1 : 0.9,
        flow_vector: [Math.cos((flowDirection * Math.PI) / 180), Math.sin((flowDirection * Math.PI) / 180)],
        velocity_variance: severity >= 4 ? 3.5 : 1.2,
        headcount: headcount,
        avg_speed: 1.2,
      },
    };

    try {
      const res = await fetch(`${API_BASE_URL}/incidents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('token')
            ? { Authorization: `Bearer ${localStorage.getItem('token')}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const created = await res.json();
        setSuccessMsg(`Incident #${created.id?.toUpperCase() || 'LOGGED'} registered to audit log!`);
        if (onIncidentCreated) {
          onIncidentCreated(created);
        }
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        // Fallback for demo mode
        setSuccessMsg(`Incident flagged locally for ${zoneName}!`);
        if (onIncidentCreated) {
          onIncidentCreated({
            id: `inc-${Date.now().toString(36)}`,
            ...payload,
            detected_at: new Date().toISOString(),
          });
        }
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch {
      setSuccessMsg(`Incident flagged locally for ${zoneName}!`);
      if (onIncidentCreated) {
        onIncidentCreated({
          id: `inc-${Date.now().toString(36)}`,
          ...payload,
          detected_at: new Date().toISOString(),
        });
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg rounded-3xl bg-white/95 backdrop-blur-2xl border border-white/80 shadow-floating overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            <h2 className="text-sm font-bold text-slate-800 tracking-tight">
              Flag Incident Bookmark · {cameraId.toUpperCase()}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {successMsg ? (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3 animate-fade-in">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              <div className="font-semibold">{successMsg}</div>
            </div>
          ) : (
            <>
              {/* Telemetry Snapshot Banner */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-slate-600 font-mono text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-sans font-semibold">Location</span>
                  <span className="font-semibold text-slate-800">{zoneName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-sans font-semibold">Headcount</span>
                  <span className="font-semibold text-slate-800">{headcount} P</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-sans font-semibold">Density</span>
                  <span className="capitalize font-semibold text-rose-600">{density}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-sans font-semibold">Vector</span>
                  <span className="font-semibold text-slate-800">{flowDirection}°</span>
                </div>
              </div>

              {/* Event Type */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-700 text-xs">Anomaly Classification</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as any)}
                  className="input-field"
                >
                  <option value="surge">Crowd Surge / Rapid Influx</option>
                  <option value="bottleneck">Chokepoint Bottleneck / Compression</option>
                  <option value="dispersal">Erratic Dispersal / Stampede Risk</option>
                  <option value="counter_flow">Counter-Flow Collision / Gridlock</option>
                  <option value="unauthorized">Perimeter Intrusion / Stationary Hazard</option>
                </select>
              </div>

              {/* Severity Level (1 - 5) */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-700 text-xs">Severity Level</label>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((lvl) => {
                    const isSelected = severity === lvl;
                    const colors = [
                      'border-emerald-300 text-emerald-700',
                      'border-sky-300 text-sky-700',
                      'border-amber-300 text-amber-700',
                      'border-orange-400 text-orange-700',
                      'border-rose-400 text-rose-700',
                    ];
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setSeverity(lvl)}
                        className={`py-2 rounded-xl text-center font-bold text-xs border transition-all ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm scale-102 ring-2 ring-slate-900/20'
                            : `bg-slate-50 hover:bg-white ${colors[lvl - 1]}`
                        }`}
                      >
                        Lv {lvl}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-700 text-xs">Operator Observations & Action Notes</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Bottleneck forming near exit turnstile. Requesting physical security dispatch to open secondary barrier..."
                  className="input-field py-2"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary bg-rose-600 hover:bg-rose-500"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Submitting...' : 'Flag & Log to Audit Trail'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default FlagIncidentModal;
