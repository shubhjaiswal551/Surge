// Tactical Audio Alert Engine using Web Audio API (Zero external assets needed)

let audioCtx: AudioContext | null = null;
const STORAGE_KEY = 'surge_sound_enabled';

// Initialize from localStorage (default: true)
let soundEnabled = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) !== 'false' : true;

const listeners = new Set<(enabled: boolean) => void>();

// Attach a one-time gesture listener to unlock AudioContext across modern browsers
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          audioCtx = new AudioContextClass();
        }
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    } catch {
      // AudioContext policy
    }
  };

  window.addEventListener('click', unlockAudio, { once: true, passive: true });
  window.addEventListener('keydown', unlockAudio, { once: true, passive: true });
  window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
}

export const isSoundEnabled = (): boolean => {
  return soundEnabled;
};

export const subscribeSoundChanges = (callback: (enabled: boolean) => void): (() => void) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

export const setSoundEnabled = (enabled: boolean): void => {
  soundEnabled = enabled;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // LocalStorage quota or access error
  }
  listeners.forEach((fn) => fn(enabled));
};

export const toggleSound = (): boolean => {
  const next = !soundEnabled;
  setSoundEnabled(next);
  if (next) {
    playChime('info');
  }
  return next;
};

export const playChime = (severity: 'info' | 'warning' | 'high' | 'critical' | 'success' = 'warning'): void => {
  if (!soundEnabled || typeof window === 'undefined') return;

  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (severity === 'critical') {
      // Urgent dual-pulse siren
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      osc.frequency.setValueAtTime(880, now + 0.16);
      osc.frequency.setValueAtTime(659.25, now + 0.24);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (severity === 'high') {
      // Tactical chime
      osc.type = 'square';
      osc.frequency.setValueAtTime(784, now); // G5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      osc.frequency.setValueAtTime(880, now + 0.16); // A5

      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.26);
      osc.start(now);
      osc.stop(now + 0.26);
    } else if (severity === 'success') {
      // Pleasant resolution chime (C5 -> G5)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(783.99, now + 0.08);

      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (severity === 'warning') {
      // Cautionary mid-frequency blip
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(440, now + 0.07); // A4

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else {
      // Discrete soft blip
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.09);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    }
  } catch {
    // AudioContext blocked or not supported
  }
};
