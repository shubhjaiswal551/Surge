import React from 'react';
import { Keyboard, X } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  onClose: () => void;
  isDark?: boolean;
}

const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ onClose, isDark = false }) => {
  const shortcuts = [
    { key: '1', label: 'Matrix View', desc: 'Switch layout to 2×2 surveillance matrix' },
    { key: '2', label: '1+Hero Grid', desc: 'Switch layout to 1 primary hero stage + auxiliary channel strip' },
    { key: '3', label: 'Dense Wall', desc: 'Switch layout to compact 3×3 multi-channel wall' },
    { key: '4', label: 'Focus Single', desc: 'Switch layout to single-camera focused inspection' },
    { key: 'Space', label: 'Master Sync', desc: 'Synchronized Play / Pause across all active camera feeds' },
    { key: 'T', label: 'Auto-Tour', desc: 'Toggle 15-second rotating surveillance tour loop' },
    { key: 'D', label: 'SOC Dark Mode', desc: 'Toggle high-contrast control room dark room mode' },
    { key: 'M', label: 'Surge Audio', desc: 'Toggle audible crowd surge alarm chimes on/off' },
    { key: 'F', label: 'Video Wall', desc: 'Toggle full-viewport video wall (collapses sidebars)' },
    { key: '?', label: 'Help HUD', desc: 'Open this VMS Keyboard Shortcuts cheat sheet' },
    { key: 'Esc', label: 'Close / Exit', desc: 'Dismiss open modals or reset zoom to 1x' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in">
      <div
        className={`w-full max-w-lg rounded-2xl border shadow-2xl p-6 transition-all ${
          isDark
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/50 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
              <Keyboard size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">VMS Keyboard Shortcuts</h3>
              <p className="text-[11px] text-slate-400">High-speed tactical controls for security command room operators</p>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
          {shortcuts.map((sc) => (
            <div
              key={sc.key}
              className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
                isDark ? 'bg-slate-800/70 border-slate-700/60' : 'bg-slate-50 border-slate-200/70'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold leading-snug truncate">{sc.label}</div>
                <div className="text-[10px] text-slate-400 truncate leading-tight">{sc.desc}</div>
              </div>
              <kbd
                className={`px-2 py-1 rounded-md text-[11px] font-mono font-bold shrink-0 border shadow-2xs ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-blue-400'
                    : 'bg-white border-slate-300 text-slate-800'
                }`}
              >
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-3 border-t border-slate-200/40 flex items-center justify-between text-[11px] text-slate-400">
          <span>Tip: Press <kbd className="px-1.5 py-0.5 rounded bg-slate-200/50 text-[10px] font-mono text-slate-700">?</kbd> anywhere to toggle this guide</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-sm transition-all"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsModal;
