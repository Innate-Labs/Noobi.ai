/** Screenshot capture may be slow. Key release runs on its own clock so a
 * 400 ms input cannot silently become a one-second movement. */
export async function holdKeyboardInput(options: {
  holdMs: number;
  down(repeat: boolean): void;
  up(): void;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  signal: AbortSignal;
  capture?: (sample: 1 | 2) => Promise<void>;
}): Promise<boolean> {
  let held = true;
  let captured = false;
  const release = () => { if (held) { held = false; options.up(); } };
  options.signal.throwIfAborted();
  options.down(false);
  const releaseTimer = setTimeout(release, options.holdMs);
  options.signal.addEventListener('abort', release, { once: true });
  try {
    if (options.capture) {
      const interval = Math.floor(options.holdMs / 3);
      await options.sleep(interval, options.signal);
      if (!held) return captured;
      await options.capture(1);
      captured = true;
      // A compositor flush can unblock delivery to a hidden renderer. Reassert
      // only while the original hold is active, without extending its deadline.
      if (!held) return captured;
      options.down(true);
      await options.sleep(interval, options.signal);
      if (!held) return captured;
      await options.capture(2);
      if (held) await options.sleep(options.holdMs - interval * 2, options.signal);
    } else {
      await options.sleep(options.holdMs, options.signal);
    }
    return captured;
  } finally {
    clearTimeout(releaseTimer);
    options.signal.removeEventListener('abort', release);
    release();
  }
}
