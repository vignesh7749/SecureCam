/**
 * Audio Alert Utility for SecureCam
 * Uses Web Audio API to synthesize a crisp, professional two-tone security beep.
 * Zero external audio assets, zero network requests, zero codec issues.
 * Includes a cooldown window to prevent rapid/repetitive audio triggers.
 */

let lastAlarmTime = 0;
const ALARM_COOLDOWN_MS = 2000; // 2 seconds between audio alerts

export function playCriticalAlertSound(enabled: boolean = true): void {
  if (!enabled) return;

  const now = Date.now();
  if (now - lastAlarmTime < ALARM_COOLDOWN_MS) {
    return;
  }
  lastAlarmTime = now;

  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    
    // Resume context if suspended by browser autoplay policy
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const nowCtx = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Two-tone warning pattern (880Hz -> 660Hz)
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, nowCtx);
    osc.frequency.setValueAtTime(660, nowCtx + 0.12);

    // Smooth envelope with no clicks
    gain.gain.setValueAtTime(0.25, nowCtx);
    gain.gain.linearRampToValueAtTime(0.25, nowCtx + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, nowCtx + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(nowCtx);
    osc.stop(nowCtx + 0.38);

    // Clean up context after sound completes
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 500);
  } catch (err) {
    // Graceful fallback for environments without audio hardware
    console.debug('Alert sound skipped (autoplay restriction or unsupported audio):', err);
  }
}
