import { audio } from './context';

/**
 * The sounds, synthesised.
 *
 * Two of them, matching the two moments the app has: a meteor crossing and an
 * element erupting. Both are built from oscillators and filtered noise rather
 * than samples — a few lines of maths that can be tuned here, with nothing to
 * license and nothing to download.
 *
 * Everything is scheduled against `context.currentTime` rather than played
 * imperatively, which is the only way to get a clean envelope: the Web Audio
 * clock runs on the audio thread and does not care what the main thread is
 * doing. A gain that starts at zero and ramps is also the difference between a
 * note and a click.
 */

/** White noise, one second of it, generated once and reused. */
let noiseBuffer: AudioBuffer | null = null;

function noise(context: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === context.sampleRate) return noiseBuffer;

  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const channel = buffer.getChannelData(0);
  // Math.random is fine here: this is a texture, not a result. Nothing in
  // src/engine depends on it and no two playbacks need to match.
  for (let index = 0; index < channel.length; index++) {
    channel[index] = Math.random() * 2 - 1;
  }

  noiseBuffer = buffer;
  return buffer;
}

/**
 * The meteor: a soft, high chime.
 *
 * Two partials a fifth apart, slightly detuned so they beat against each other
 * — a single sine reads as a test tone, and the beat is most of what makes this
 * sound like an instrument rather than a notification.
 */
export function playMeteor(): void {
  const found = audio();
  if (!found) return;

  const { context, master } = found;
  const now = context.currentTime;

  for (const [frequency, level] of [
    [1320, 0.5],
    [1976, 0.22],
    [1322.5, 0.3],
  ] as const) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    // Fast in, long out. A chime is almost all decay.
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);

    oscillator.connect(gain).connect(master);
    oscillator.start(now);
    oscillator.stop(now + 1.7);
  }
}

/**
 * The eruption: a low thump under a filtered noise swell.
 *
 * The thump is a sine swept downward, which is how every impact sound is made —
 * the ear reads a falling pitch as something losing energy. The noise is what
 * gives it a body; swept through a lowpass so it opens and closes rather than
 * sitting as a hiss.
 *
 * `intensity` is the same figure the visual uses, so a bigger number is both
 * seen and heard as bigger.
 */
export function playBurst(intensity: number): void {
  const found = audio();
  if (!found) return;

  const { context, master } = found;
  const now = context.currentTime;
  const force = Math.max(0.25, Math.min(1, intensity));

  // The thump.
  const thump = context.createOscillator();
  const thumpGain = context.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(140 + force * 60, now);
  thump.frequency.exponentialRampToValueAtTime(42, now + 0.38);
  thumpGain.gain.setValueAtTime(0, now);
  thumpGain.gain.linearRampToValueAtTime(0.55 * force, now + 0.008);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  thump.connect(thumpGain).connect(master);
  thump.start(now);
  thump.stop(now + 0.6);

  // The body.
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const bodyGain = context.createGain();

  source.buffer = noise(context);
  filter.type = 'lowpass';
  filter.Q.value = 1.2;
  // Opens with the shockwave and closes as it fades, which is the same shape
  // the shader's ring takes.
  filter.frequency.setValueAtTime(400, now);
  filter.frequency.exponentialRampToValueAtTime(2600 * force, now + 0.09);
  filter.frequency.exponentialRampToValueAtTime(220, now + 0.9);

  bodyGain.gain.setValueAtTime(0, now);
  bodyGain.gain.linearRampToValueAtTime(0.3 * force, now + 0.02);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);

  source.connect(filter).connect(bodyGain).connect(master);
  source.start(now);
  source.stop(now + 1.1);
}

/** Test seam: forget the generated noise, so a new context builds its own. */
export function resetSounds(): void {
  noiseBuffer = null;
}
