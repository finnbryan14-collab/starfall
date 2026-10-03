import { createTimeline } from 'animejs';
import type * as THREE from 'three';

import { mulberry32 } from '@/engine/rng';
import { duration as tokenDuration } from '@/motion';

import { colorFor } from './elements';

/**
 * The shards thrown out of an eruption.
 *
 * The shader alone is soft all the way through — turbulent cloud with no hard
 * edge anywhere in it. Debris is the other half: a few dozen solid silhouettes
 * tumbling outward, which is most of what separates an explosion from a puff of
 * coloured smoke. Hard shapes against a soft body.
 *
 * Geometry comes from `public/models/burst.glb`, authored in Blender by
 * scripts/build-burst-assets.py. three.js can extrude a cone in two lines and it
 * looks like a cone; the shards want irregular silhouettes, a taper that is not
 * uniform, and a bevel that catches light along one edge — a few bmesh operators
 * there and a pile of fiddly vertex maths here.
 *
 * Optional by design. If the model will not load, the eruption still happens
 * without it, so a failed fetch costs a little texture rather than the moment.
 */

export type Three = typeof THREE;

/** Shards per eruption. Enough to read as debris, few enough to stay cheap. */
const SHARDS = 36;

export type Debris = {
  fire: (element: string | null, intensity: number) => void;
  dispose: () => void;
};

type Piece = {
  direction: THREE.Vector3;
  spin: THREE.Euler;
  speed: number;
  size: number;
  mesh: number;
  slot: number;
};

export function createDebris(
  three: Three,
  scene: THREE.Scene,
  geometries: THREE.BufferGeometry[],
  depth: number,
): Debris {
  const rng = mulberry32(2026);

  const material = new three.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    // Additive, so overlapping shards brighten rather than occlude — a cluster
    // should read as light, not as a pile of rocks.
    blending: three.AdditiveBlending,
    depthWrite: false,
  });

  const perMesh = Math.ceil(SHARDS / geometries.length);
  const meshes = geometries.map((geometry) => {
    const instanced = new three.InstancedMesh(geometry, material, perMesh);
    instanced.frustumCulled = false;
    instanced.visible = false;
    instanced.position.z = depth;
    scene.add(instanced);
    return instanced;
  });

  /*
    Directions fixed once rather than per eruption.

    A burst is over in under two seconds and nobody sees two side by side, so
    the only thing re-randomising would buy is allocating three dozen vectors
    on a worker result — which is exactly the moment a dropped frame shows.
  */
  const pieces: Piece[] = Array.from({ length: SHARDS }, (_, index) => {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);

    return {
      // Flattened on z so the eruption spreads across the screen rather than
      // mostly towards and away from a camera that cannot convey it.
      direction: new three.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi) * 0.3,
      ).normalize(),
      spin: new three.Euler(rng() * 6 - 3, rng() * 6 - 3, rng() * 6 - 3),
      speed: 0.55 + rng() * 0.75,
      /*
        Specks, not slabs.

        The authored shards are about 1.2 units long, and the visible half-height
        at this depth is 0.92 — so a scale of 0.1 to 0.24 made each one a sixth
        of the screen. They read as flat triangles pasted over the UI rather than
        as anything thrown. An order of magnitude smaller is the difference
        between debris and wreckage.
      */
      size: 0.012 + rng() * 0.02,
      mesh: index % geometries.length,
      slot: Math.floor(index / geometries.length),
    };
  });

  const matrix = new three.Matrix4();
  const quaternion = new three.Quaternion();
  const euler = new three.Euler();
  const position = new three.Vector3();
  const scaling = new three.Vector3();

  // The one value anime.js drives; everything else is derived from it, so the
  // shards and the shader body are moving on the same clock.
  const flight = { value: 0 };
  let timeline: ReturnType<typeof createTimeline> | null = null;

  function place(progress: number, force: number): void {
    for (const piece of pieces) {
      /*
        Kept inside the eruption's own reach, which is at most about 0.72.

        The easing is what caught me out: `out(4)` is two-thirds done a quarter
        of the way through, so a multiplier that looked contained against linear
        progress threw the shards past the corners of the screen within half a
        second.
      */
      const distance = progress * piece.speed * (0.2 + force * 0.42);
      position.copy(piece.direction).multiplyScalar(distance);

      euler.set(piece.spin.x * progress, piece.spin.y * progress, piece.spin.z * progress);
      quaternion.setFromEuler(euler);

      // Shrinking as they travel sells distance without the camera having any
      // depth cue to work with at this scale.
      const size = piece.size * (0.6 + force * 0.6) * (1 - progress * 0.45);
      scaling.set(size, size, size);

      matrix.compose(position, quaternion, scaling);
      meshes[piece.mesh].setMatrixAt(piece.slot, matrix);
    }

    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    fire(element, intensity) {
      const signature = tokenDuration('signature');
      if (signature <= 0 || intensity <= 0) return;

      const span = signature * 1.5;
      const force = Math.max(0.25, Math.min(1, intensity));

      timeline?.revert();
      material.color.setHex(colorFor(element));
      flight.value = 0;
      for (const mesh of meshes) mesh.visible = true;

      timeline = createTimeline({
        onUpdate: () => place(flight.value, force),
        onComplete: () => {
          for (const mesh of meshes) mesh.visible = false;
        },
      })
        // Out hard and decelerating, the same curve the shockwave takes, so the
        // shards ride the front rather than drifting out behind it.
        .add(flight, { value: 1, duration: span, ease: 'out(4)' }, 0)
        .add(material, { opacity: 0.85 * force, duration: span * 0.1, ease: 'out(3)' }, 0)
        .add(material, { opacity: 0, duration: span * 0.6, ease: 'in(2)' }, span * 0.4);
    },

    dispose() {
      timeline?.revert();
      for (const mesh of meshes) {
        scene.remove(mesh);
        mesh.dispose();
      }
      material.dispose();
      for (const geometry of geometries) geometry.dispose();
    },
  };
}

/**
 * Pulls the shard geometries out of the authored model.
 *
 * Returns an empty list rather than throwing: debris is a texture on the
 * eruption, not the eruption, so a model that will not load should cost the
 * detail and nothing else.
 */
export async function loadShards(): Promise<THREE.BufferGeometry[]> {
  try {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync('/models/burst.glb');

    const geometries: THREE.BufferGeometry[] = [];
    gltf.scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) {
        // Centred, because the exporter keeps each shard where it sat in the
        // Blender scene and an off-centre pivot makes a tumble look like an
        // orbit.
        const geometry = mesh.geometry.clone();
        geometry.center();
        geometries.push(geometry);
      }
    });

    return geometries;
  } catch {
    return [];
  }
}
