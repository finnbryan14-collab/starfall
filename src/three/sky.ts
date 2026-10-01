import type * as THREE from 'three';

import { mulberry32 } from '@/engine/rng';

/**
 * The night sky, with depth.
 *
 * The same sky `src/components/Starfield.tsx` draws in SVG — same seed, same
 * star count, same sizes — lifted onto three axes so it can drift and parallax.
 * Keeping the seed means the canvas fades in over a sky that is already there
 * rather than replacing one arrangement of stars with a different one.
 *
 * Framework-free on purpose. React owns when this exists; it owns what it looks
 * like, and the split is what lets the geometry be tested without a DOM.
 *
 * ## What it refuses to do
 *
 * DESIGN.md rules out looping ambient animation, and this is a deliberate
 * exception to that rule rather than an oversight — so it is kept to the
 * slowest drift that still reads as depth, and everything louder is attached to
 * something the player did. The meteor only ever fires when asked.
 *
 * See docs/DESIGN.md and docs/DECISIONS.md.
 */

/** three is ~150 KB gzipped, so the module is handed in rather than imported. */
export type Three = typeof THREE;

export type SkyOptions = {
  /** Matches the SVG starfield, so the two are the same sky. */
  seed?: number;
  /** Scaled down on small screens; the renderer halves it again on a low DPR. */
  starCount?: number;
  /** Device pixel ratio cap. Past 2 the cost is real and the gain is not. */
  maxPixelRatio?: number;
};

export type Sky = {
  /** Fires a gold streak across the sky. The one loud thing this does. */
  meteor: () => void;
  /** Call on resize; cheap enough to call from a ResizeObserver. */
  resize: (width: number, height: number) => void;
  /** Advances the animation. Pass the frame time in seconds. */
  frame: (elapsed: number, delta: number) => void;
  /** Where the sky leans, from pointer or tilt. Both in [-1, 1]. */
  look: (x: number, y: number) => void;
  dispose: () => void;
};

const DEFAULT_SEED = 2026;
const DEFAULT_STARS = 90;

/** Matches `--starlight` and `--gold` in tokens.css. */
const STARLIGHT = 0xece6d6;
const GOLD = 0xe7b75f;

/** How long a meteor takes to cross, in seconds. `--d-signature` is 1100ms. */
const METEOR_SECONDS = 1.1;

export type StarLayout = {
  positions: Float32Array;
  sizes: Float32Array;
  opacities: Float32Array;
};

/**
 * Where the stars go.
 *
 * Pulled out of the renderer so the arrangement can be checked without a GPU —
 * that every star is inside the box, that the seed reproduces, and that the
 * size distribution still leans small the way the SVG's does.
 *
 * The x and y spread matches the SVG's 1000-unit viewBox mapped to [-1, 1]; z
 * is the new axis and is what the parallax reads.
 */
export function starLayout(count: number, seed: number): StarLayout {
  const rng = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const opacities = new Float32Array(count);

  for (let index = 0; index < count; index++) {
    positions[index * 3] = rng() * 2 - 1;
    positions[index * 3 + 1] = rng() * 2 - 1;
    // Depth is the point of this version. Negative so everything sits behind
    // the camera's focal plane, and spread wide enough for parallax to read.
    positions[index * 3 + 2] = -rng() * 2;

    // Squaring the random term keeps most stars small and a few bright, which
    // is what the SVG does and most of why the sky reads as a sky.
    sizes[index] = 0.6 + rng() * rng() * 2.2;
    opacities[index] = 0.1 + rng() * 0.35;
  }

  return { positions, sizes, opacities };
}

/** Star count for a viewport, so a phone does not render a laptop's sky. */
export function starCountFor(width: number, base = DEFAULT_STARS): number {
  if (width < 480) return Math.round(base * 0.55);
  if (width < 900) return Math.round(base * 0.75);
  return base;
}

/**
 * A point sprite that is round and soft rather than a square.
 *
 * `gl_PointCoord` is the cheapest way to get a disc: no texture to load, no
 * second request, and it scales with the device pixel ratio for free.
 */
const STAR_VERTEX = `
  attribute float size;
  attribute float alpha;
  varying float vAlpha;
  uniform float uPixelRatio;
  uniform float uTime;

  void main() {
    vAlpha = alpha;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    // A slow, per-star breath. The phase comes from the position so no two
    // stars pulse together, and the amplitude is small enough to read as air
    // rather than as blinking.
    float breath = 0.88 + 0.12 * sin(uTime * 0.6 + position.x * 9.0 + position.y * 6.0);
    gl_PointSize = size * uPixelRatio * breath * (1.6 / -viewPosition.z);
  }
`;

const STAR_FRAGMENT = `
  varying float vAlpha;
  uniform vec3 uColor;

  void main() {
    float distance = length(gl_PointCoord - vec2(0.5));
    if (distance > 0.5) discard;
    // Squared falloff: a soft edge without a texture.
    float falloff = 1.0 - distance * 2.0;
    gl_FragColor = vec4(uColor, vAlpha * falloff * falloff);
  }
`;

export function createSky(three: Three, canvas: HTMLCanvasElement, options: SkyOptions = {}): Sky {
  const { seed = DEFAULT_SEED, maxPixelRatio = 2 } = options;

  const renderer = new three.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: 'low-power',
  });
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, maxPixelRatio);
  renderer.setPixelRatio(pixelRatio);

  const scene = new three.Scene();
  const camera = new three.PerspectiveCamera(60, 1, 0.1, 10);
  camera.position.z = 1.4;

  const count = options.starCount ?? starCountFor(canvas.clientWidth || 1024);
  const layout = starLayout(count, seed);

  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.BufferAttribute(layout.positions, 3));
  geometry.setAttribute('size', new three.BufferAttribute(layout.sizes, 1));
  geometry.setAttribute('alpha', new three.BufferAttribute(layout.opacities, 1));

  const starMaterial = new three.ShaderMaterial({
    uniforms: {
      uColor: { value: new three.Color(STARLIGHT) },
      uPixelRatio: { value: pixelRatio },
      uTime: { value: 0 },
    },
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });

  const stars = new three.Points(geometry, starMaterial);
  scene.add(stars);

  /*
    The meteor: a tapered trail of soft discs, brightest at the head.

    Points rather than a line, because WebGL ignores `lineWidth` above 1 on
    essentially every platform — the first version of this was a hairline that
    read as a rendering artifact rather than as a meteor. Discs also give the
    glow for nothing, since the star shader already draws a soft-edged circle.
  */
  // Dense enough that the discs overlap into one streak. At 28 they read as a
  // dotted line, which is worse than the hairline was; 72 points is nothing to
  // a GPU and it is the difference between a meteor and a dashed stroke.
  const TRAIL = 72;
  const trailPositions = new Float32Array(TRAIL * 3);
  const trailSizes = new Float32Array(TRAIL);
  const trailAlphas = new Float32Array(TRAIL);

  for (let index = 0; index < TRAIL; index++) {
    const along = index / (TRAIL - 1);
    // Fat and bright at the head, thin and gone at the tail. Squaring both
    // keeps the head compact instead of leaving a uniform sausage.
    trailSizes[index] = 1.5 + (1 - along) ** 2 * 18;
    trailAlphas[index] = (1 - along) ** 1.2;
  }

  const trailGeometry = new three.BufferGeometry();
  trailGeometry.setAttribute('position', new three.BufferAttribute(trailPositions, 3));
  trailGeometry.setAttribute('size', new three.BufferAttribute(trailSizes, 1));
  trailGeometry.setAttribute('alpha', new three.BufferAttribute(trailAlphas, 1));

  const trailMaterial = new three.ShaderMaterial({
    uniforms: {
      uColor: { value: new three.Color(GOLD) },
      uPixelRatio: { value: pixelRatio },
      uFade: { value: 0 },
    },
    vertexShader: `
      attribute float size;
      attribute float alpha;
      varying float vAlpha;
      uniform float uPixelRatio;

      void main() {
        vAlpha = alpha;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = size * uPixelRatio * (1.6 / -viewPosition.z);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      uniform vec3 uColor;
      uniform float uFade;

      void main() {
        float distance = length(gl_PointCoord - vec2(0.5));
        if (distance > 0.5) discard;
        float falloff = 1.0 - distance * 2.0;
        gl_FragColor = vec4(uColor, vAlpha * uFade * falloff * falloff);
      }
    `,
    transparent: true,
    depthWrite: false,
    // Additive, so where the trail crosses a star the two add up rather than
    // one punching a hole in the other.
    blending: three.AdditiveBlending,
  });

  const trail = new three.Points(trailGeometry, trailMaterial);
  trail.visible = false;
  scene.add(trail);

  let meteorStart = -1;
  let meteorFrom = new three.Vector3();
  let meteorTo = new three.Vector3();

  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };

  return {
    meteor() {
      meteorStart = 0;
      // Top-right to bottom-left, the direction the Fate Dial's own meteor
      // already travels, so the two moments read as the same object.
      meteorFrom = new three.Vector3(1.4, 1.1, -0.4);
      meteorTo = new three.Vector3(-1.2, -0.9, -0.4);
      trail.visible = true;
      trailMaterial.uniforms.uFade.value = 0;
    },

    resize(width, height) {
      if (width <= 0 || height <= 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    },

    look(x, y) {
      target.x = Math.max(-1, Math.min(1, x));
      target.y = Math.max(-1, Math.min(1, y));
    },

    frame(elapsed, delta) {
      starMaterial.uniforms.uTime.value = elapsed;

      /*
        The drift and the lean, both heavily damped.

        The amplitude here is the whole argument about whether this belongs in
        an app whose design doc bans ambient motion: large enough to read as
        depth when you move, small enough that nothing is moving when you are
        not looking at it.
      */
      current.x += (target.x - current.x) * Math.min(1, delta * 2);
      current.y += (target.y - current.y) * Math.min(1, delta * 2);
      stars.rotation.y = current.x * 0.06 + Math.sin(elapsed * 0.04) * 0.012;
      stars.rotation.x = -current.y * 0.045 + Math.cos(elapsed * 0.03) * 0.008;

      if (meteorStart >= 0) {
        meteorStart += delta;
        const progress = meteorStart / METEOR_SECONDS;

        if (progress >= 1) {
          meteorStart = -1;
          trail.visible = false;
        } else {
          // In and out, so it neither appears nor vanishes abruptly.
          trailMaterial.uniforms.uFade.value = Math.sin(progress * Math.PI);

          const head = new three.Vector3().lerpVectors(meteorFrom, meteorTo, progress);
          const back = new three.Vector3().subVectors(meteorFrom, meteorTo).normalize();

          for (let index = 0; index < TRAIL; index++) {
            const along = (index / (TRAIL - 1)) * 0.75;
            trailPositions[index * 3] = head.x + back.x * along;
            trailPositions[index * 3 + 1] = head.y + back.y * along;
            trailPositions[index * 3 + 2] = head.z + back.z * along;
          }
          trailGeometry.attributes.position.needsUpdate = true;
        }
      }

      renderer.render(scene, camera);
    },

    dispose() {
      geometry.dispose();
      starMaterial.dispose();
      trailGeometry.dispose();
      trailMaterial.dispose();
      renderer.dispose();
    },
  };
}
