import { createTimeline } from 'animejs';
import type * as THREE from 'three';

import { duration as tokenDuration } from '@/motion';

/**
 * Elemental eruptions.
 *
 * The first version of this was forty recoloured shards, and recolouring is
 * exactly why it looked like stock. An element is not a palette — it is a way of
 * moving. Pyro rises, turbulates and burns away at its edges. Cryo grows along
 * straight lines. Electro branches. So each gets its own motion in the shader,
 * and colour is the last thing applied rather than the only thing that differs.
 *
 * ## Three layers, not one curve
 *
 * A burst that is a single number ramping from 0 to 1 reads as an expanding
 * blob however good the noise is. What makes it read as a detonation is that
 * the parts disagree: the shockwave outruns the body, the body lingers after
 * the ring has gone, and the whole thing fades on a third curve again.
 *
 * So there are three uniforms and anime.js drives each on its own easing. They
 * are plain `{ value }` objects, which is exactly what anime.js wants as a
 * target — the same trick `src/motion/tweenNumber.ts` uses for the hero numeral.
 *
 * ## Why one shader rather than seven
 *
 * The branches are on a uniform, so every fragment in a frame takes the same
 * path and the GPU never diverges. Seven materials would mean seven shader
 * compiles during a session, each a stutter at exactly the wrong moment.
 *
 * Everything is procedural: no textures, no downloads. The effect is this file.
 */

export type Three = typeof THREE;

/** Index per element. The shader branches on this. */
export const ELEMENT_IDS: Record<string, number> = {
  pyro: 0,
  hydro: 1,
  cryo: 2,
  electro: 3,
  anemo: 4,
  geo: 5,
  dendro: 6,
};

/** Matches the element tokens in src/styles/tokens.css. */
export const ELEMENT_COLORS: Record<string, number> = {
  pyro: 0xef7a35,
  hydro: 0x4cc2f1,
  anemo: 0x74c2a8,
  electro: 0xb08fc2,
  dendro: 0xa5c83b,
  cryo: 0x9fd6e3,
  geo: 0xfab632,
};

/** Physical damage has no element, so it borrows the app's own gold. */
export const PHYSICAL_COLOR = 0xe7b75f;

export function colorFor(element: string | null): number {
  return element ? (ELEMENT_COLORS[element] ?? PHYSICAL_COLOR) : PHYSICAL_COLOR;
}

export function elementId(element: string | null): number {
  return element ? (ELEMENT_IDS[element] ?? 0) : 0;
}

/**
 * How hard a burst hits, from the damage figure.
 *
 * Logarithmic, because damage spans two orders of magnitude across a roster and
 * a linear map would make every early-game character's burst invisible and
 * every late-game one identical. 1,000 reads as a small eruption and 200,000 as
 * a large one, with the whole middle actually distinguishable.
 */
export function intensityFor(damage: number): number {
  if (!Number.isFinite(damage) || damage <= 0) return 0;
  const scaled = Math.log10(damage) / Math.log10(200_000);
  return Math.max(0.25, Math.min(1, scaled));
}

/**
 * Value noise and fBm.
 *
 * Value rather than simplex: a third of the instructions, and once four octaves
 * are stacked and domain-warped the difference is not visible in fire.
 */
const NOISE = `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // Smoothstep the interpolant, or the lattice shows up as visible squares.
    vec2 u = f * f * (3.0 - 2.0 * f);

    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 5; octave++) {
      total += amplitude * noise2(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return total;
  }
`;

const VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * One eruption, seven ways.
 *
 * Every element shares a skeleton — a ring that expands and thins, and a body
 * that fills behind it — and differs in how the body moves and how its edge
 * breaks up. The shared skeleton is what makes them read as the same app rather
 * than seven unrelated effects.
 */
const FRAGMENT = `
  varying vec2 vUv;

  uniform float uTime;
  uniform float uShock;
  uniform float uBody;
  uniform float uFade;
  uniform float uIntensity;
  uniform vec3 uColor;
  uniform int uElement;
  uniform float uAspect;

  ${NOISE}

  void main() {
    // Centred, and corrected for the viewport so an eruption is round on a
    // phone as well as on a laptop.
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0;
    float radius = length(p);
    float angle = atan(p.y, p.x);

    // Contained. At 0.35 + 0.95 the front reached past the corners of a laptop
    // screen and the whole thing read as a colour wash over the UI rather than
    // as an event happening in front of it.
    float reach = 0.3 + uIntensity * 0.42;

    float body = 0.0;
    float edge = 0.0;

    if (uElement == 0) {
      // Pyro: rises and turbulates. The domain is dragged upward over time and
      // warped by its own noise, which gives flame its licking motion instead
      // of a cloud drifting.
      vec2 warp = vec2(fbm(p * 2.2 + uTime * 0.6), fbm(p * 2.2 - uTime * 0.9));
      float flame = fbm(p * 2.6 + warp * 1.4 - vec2(0.0, uTime * 2.2));
      // Raised to a power so the mid-tones collapse. Without this, fBm averages
      // out to a uniform half-bright haze and the result is fog with no tongues
      // in it — the gaps between flames are as much the shape as the flames.
      body = pow(flame, 2.6) * 3.0;
      // Burns away from the edge inward, so the boundary is ragged rather than
      // a circle with noise sprinkled on it.
      edge = flame * 0.75;
    } else if (uElement == 1) {
      // Hydro: flows. Low frequency, slow, and it settles rather than rises.
      float flow = fbm(p * 1.6 + vec2(uTime * 0.35, -uTime * 0.2));
      body = 0.45 + flow * 0.7;
      edge = flow * 0.4;
    } else if (uElement == 2) {
      // Cryo: grows along straight lines. Quantising the angle into facets is
      // what makes it crystalline — the same noise, snapped to spokes.
      float facets = floor(angle / 0.5236) * 0.5236;
      float spike = fbm(vec2(facets * 3.0, radius * 4.0 - uTime * 0.8));
      body = 0.35 + spike * 0.8;
      edge = spike * 0.55;
    } else if (uElement == 3) {
      // Electro: branches. Ridged noise — one minus the absolute value — gives
      // sharp creases where ordinary fBm gives soft blobs, and the creases are
      // the arcs.
      float ridged = 1.0 - abs(fbm(p * 3.4 + uTime * 1.8) * 2.0 - 1.0);
      body = pow(ridged, 3.0) * 1.6;
      edge = body * 0.5;
    } else if (uElement == 4) {
      // Anemo: swirls. Rotating the sample point by its own radius is the
      // cheapest real vortex there is.
      float twist = angle + radius * 2.4 - uTime * 1.6;
      body = 0.4 + fbm(vec2(cos(twist), sin(twist)) * 2.0 + radius * 3.0) * 0.8;
      edge = body * 0.45;
    } else if (uElement == 5) {
      // Geo: slabs. Flooring the domain gives hard rectangular plates, which is
      // the one element that should not look organic.
      vec2 plates = floor(p * 5.0) / 5.0;
      body = 0.35 + noise2(plates * 3.0 + uTime * 0.2) * 0.85;
      edge = step(0.5, body) * 0.6;
    } else {
      // Dendro: spreads outward in tendrils, slowly, and keeps growing.
      float growth = fbm(p * 2.8 + vec2(0.0, -uTime * 0.5)) * (0.5 + uShock);
      body = growth;
      edge = growth * 0.5;
    }

    // The ring, driven on its own curve so it outruns the body.
    float front = uShock * reach;
    float ring = smoothstep(0.26, 0.0, abs(radius - front)) * (1.0 - uShock * 0.65);

    // The mass fills behind the front and burns away where the element says.
    float core = smoothstep(front, front * 0.1, radius);
    float mass = core * body * uBody;
    float dissolve = smoothstep(1.0 - uBody - 0.25, 1.0 - uBody + 0.3, edge + 0.35);
    mass *= dissolve;

    /*
      Body and ring at comparable weight. Pushing the ring to four times the
      body left a hollow torus that read as a smoke ring — but those weights
      were picked while the quad was mis-mapped, against an image that was
      wrong for an entirely different reason.

      Held below full alpha regardless: this draws over a screen somebody is
      trying to read, and a burst that costs you the number it is celebrating
      is a bad trade.
    */
    float strength = (mass * 1.5 + ring * 1.2) * uIntensity * uFade * 0.6;
    if (strength < 0.004) discard;

    // White-hot where the mass is thickest, the element's own colour outside it.
    vec3 color = mix(uColor, vec3(1.0), clamp(strength - 0.75, 0.0, 1.0) * 0.8);
    gl_FragColor = vec4(color, clamp(strength, 0.0, 1.0));
  }
`;

export type ElementBurst = {
  /** Erupts. `element` picks the motion and colour, `intensity` the force. */
  fire: (element: string | null, intensity: number) => void;
  /** Feeds the noise its clock. The tweens drive themselves through anime.js. */
  frame: (elapsed: number) => void;
  /** Re-fits the quad to what the camera can actually see. */
  resize: () => void;
  dispose: () => void;
};

export function createElementBurst(
  three: Three,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  depth: number,
): ElementBurst {
  const uniforms = {
    uTime: { value: 0 },
    uShock: { value: 0 },
    uBody: { value: 0 },
    uFade: { value: 0 },
    uIntensity: { value: 1 },
    uColor: { value: new three.Color(PHYSICAL_COLOR) },
    uElement: { value: 0 },
    uAspect: { value: 1 },
  };

  const material = new three.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: three.AdditiveBlending,
  });

  /*
    A unit quad, scaled on resize to exactly what the camera sees at this depth.

    This has to be exact, not generous. The first version was a fixed 6×6 while
    the view covered about 3×1.9 of it — so `vUv` spanned the quad, not the
    screen, and the shader's centre and radius were in a coordinate space with
    no relationship to the viewport. The effect filled the screen with a colour
    wash because only a small central patch of it was ever visible, and two
    rounds of parameter tuning did nothing but adjust the wrong space.
  */
  const quad = new three.Mesh(new three.PlaneGeometry(1, 1), material);
  quad.position.z = depth;
  quad.frustumCulled = false;
  quad.visible = false;
  scene.add(quad);

  function fitToView(): void {
    const distance = camera.position.z - depth;
    const halfHeight = distance * Math.tan((camera.fov * Math.PI) / 360);
    const halfWidth = halfHeight * camera.aspect;
    quad.scale.set(halfWidth * 2, halfHeight * 2, 1);
    uniforms.uAspect.value = Math.max(0.2, camera.aspect);
  }

  fitToView();

  let timeline: ReturnType<typeof createTimeline> | null = null;

  return {
    fire(element, intensity) {
      // Read from the token rather than hardcoded, so `prefers-reduced-motion`
      // zeroing it in tokens.css reaches anime.js too — see src/motion/durations.
      const signature = tokenDuration('signature');
      if (signature <= 0 || intensity <= 0) return;

      // Longer than the signature duration: this is the one moment on the
      // screen, and it has three phases to get through.
      const span = signature * 1.5;

      timeline?.revert();

      uniforms.uElement.value = elementId(element);
      uniforms.uColor.value.setHex(colorFor(element));
      uniforms.uIntensity.value = Math.max(0.25, Math.min(1, intensity));
      uniforms.uShock.value = 0;
      uniforms.uBody.value = 0;
      uniforms.uFade.value = 0;
      quad.visible = true;

      /*
        The three curves, and the disagreement between them is the effect.

        The ring leaves immediately and decelerates hard. The body swells behind
        it and then holds, so it is still there when the ring has gone. The fade
        comes in almost at once and leaves slowly, which is what stops the whole
        thing ending on a cut.
      */
      timeline = createTimeline({
        defaults: { duration: span },
        onComplete: () => {
          quad.visible = false;
        },
      })
        .add(uniforms.uShock, { value: 1, ease: 'out(4)' }, 0)
        .add(uniforms.uBody, { value: 1, duration: span * 0.3, ease: 'out(2)' }, 0)
        .add(uniforms.uBody, { value: 0, duration: span * 0.7, ease: 'in(2)' }, span * 0.3)
        .add(uniforms.uFade, { value: 1, duration: span * 0.12, ease: 'out(3)' }, 0)
        .add(uniforms.uFade, { value: 0, duration: span * 0.55, ease: 'in(2)' }, span * 0.45);
    },

    frame(elapsed) {
      // The only thing the render loop still owns: the noise needs a clock, and
      // a clock is not a tween.
      if (quad.visible) uniforms.uTime.value = elapsed;
    },

    resize() {
      fitToView();
    },

    dispose() {
      timeline?.revert();
      scene.remove(quad);
      quad.geometry.dispose();
      material.dispose();
    },
  };
}
