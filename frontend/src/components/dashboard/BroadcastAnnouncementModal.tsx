import React, { useState } from 'react';
import { Volume2, X, Check, Megaphone } from 'lucide-react';
import { playChime } from '../../lib/sound';

interface BroadcastAnnouncementModalProps {
  cameraId: string;
  zoneName: string;
  onClose: () => void;
  onBroadcast: (message: string) => void;
  isDark?: boolean;
}

const PRESET_MESSAGES = [
  'ATTENTION: Please keep moving. Do not stop in the exit corridor.',
  'ATTENTION: Sector bottleneck detected. Please proceed to Alternate Gate B.',
  'ATTENTION: Maintain safe distance. Security marshals are assisting.',
  'NOTICE: Main Entrance is at maximum capacity. Please use North Turnstiles.',
  'CLEAR CORRIDOR: Emergency response personnel entering the zone.',
];

const BroadcastAnnouncementModal: React.FC<BroadcastAnnouncementModalProps> = ({
  cameraId,
  zoneName,
  onClose,
  onBroadcast,
  isDark = false,
}) => {
  const [selectedPreset, setSelectedPreset] = useState(PRESET_MESSAGES[0]);
  const [customMessage, setCustomMessage] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const handleSend = () => {
    const finalMsg = customMessage.trim() || selectedPreset;
    setIsBroadcasting(true);
    // Play audio chime to simulate acoustic PA broadcast tone
    playChime('info');
    setTimeout(() => {
      onBroadcast(finalMsg);
      setIsBroadcasting(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in">
      <div
        className={`w-full max-w-md rounded-2xl border shadow-2xl p-6 transition-all ${
          isDark
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/50 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <Megaphone size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Public Address Intercom</h3>
              <p className="text-[11px] text-slate-400">Broadcast audible security message to {zoneName} ({cameraId.toUpperCase()})</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg text-xs transition-colors ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
              Quick Preset Broadcasts
            </label>
            <div className="space-y-1.5">
              {PRESET_MESSAGES.map((msg, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSelectedPreset(msg);
                    setCustomMessage('');
                  }}
                  className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all flex items-center justify-between gap-2 ${
                    selectedPreset === msg && !customMessage
                      ? 'bg-blue-600/10 border-blue-500 text-blue-500 font-medium'
                      : isDark
                        ? 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                        : 'bg-slate-50 border-slate-200/70 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="truncate">{msg}</span>
                  {selectedPreset === msg && !customMessage && <Check size={14} className="shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
              Or Custom Voice Synthesizer Message
            </label>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Type custom security instruction to transmit..."
              rows={2}
              className={`w-full p-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all ${
                isDark
                  ? 'bg-slate-800 border-slate-700 text-white placeholder:text-slate-500'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'
              }`}
            />
          </div>
        </div>

        <div className="mt-5 pt-3 border-t border-slate-200/40 flex items-center justify-end gap-2 text-xs">
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1.5 rounded-xl border font-medium ${
              isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={isBroadcasting}
            className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <Volume2 size={14} />
            <span>{isBroadcasting ? 'Transmitting PA...' : 'Transmit Announcement'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default BroadcastAnnouncementModal;
