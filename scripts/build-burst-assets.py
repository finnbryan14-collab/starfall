"""
Authors the elemental burst shards and exports them as glTF.

Run headless:

    pnpm build:models

## Why Blender rather than code

three.js can extrude a cone in two lines, and it looks like a cone. The shards
a burst is made of want irregular silhouettes — a taper that is not uniform, a
bevel that catches the light along one edge, facets that are not a lathe. Those
are a few bmesh operators here and a pile of fiddly vertex maths in TypeScript.

It also establishes the pipeline: whatever lands in `public/models/` is loaded
the same way, so a model authored elsewhere drops into the same slot.

## What it deliberately does not do

No materials, no colour, no textures. Every element recolours the same geometry
at runtime from the tokens in `src/styles/tokens.css`, which is the only place
Pyro's orange is written down. Baking colour in here would mean seven meshes and
seven places to change when a token moves.

Deterministic: the RNG is seeded, so re-running produces byte-identical geometry
and the committed .glb only changes when this script does.
"""

import math
import random
import sys
from pathlib import Path

import bpy
import bmesh

SEED = 2026
SHARD_COUNT = 3
OUT = Path(__file__).resolve().parent.parent / "public" / "models" / "burst.glb"


def clear_scene():
    """A fresh file, so the export never picks up whatever was open."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def shard(name, rng, length, width, sides):
    """
    One faceted spike.

    Built from a cone rather than a cylinder so it tapers to a point, then
    pushed out of symmetry: every ring of vertices is nudged and twisted
    independently, which is what stops a row of these reading as a row of
    identical cones.
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=sides,
        radius1=width,
        radius2=width * 0.08,
        depth=length,
    )

    # Irregularity, applied by height so the tip stays sharp while the body
    # wanders. A uniform jitter would just make it look low-poly and wrong.
    for vert in bm.verts:
        along = (vert.co.z + length / 2) / length
        spread = (1 - along) * width * 0.45
        vert.co.x += rng.uniform(-spread, spread)
        vert.co.y += rng.uniform(-spread, spread)
        # A slight twist up the length catches the light along one edge.
        angle = along * rng.uniform(0.2, 0.6)
        x, y = vert.co.x, vert.co.y
        vert.co.x = x * math.cos(angle) - y * math.sin(angle)
        vert.co.y = x * math.sin(angle) + y * math.cos(angle)

    # A small bevel is most of why this looks authored rather than generated:
    # it gives every edge a highlight instead of a hard crease.
    bmesh.ops.bevel(
        bm,
        geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        offset=width * 0.12,
        segments=1,
        affect="EDGES",
    )

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    # Shade smooth-ish: the bevel carries the edges, so flat shading here would
    # throw away the thing the bevel was for.
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    return obj


def main():
    clear_scene()
    rng = random.Random(SEED)

    for index in range(SHARD_COUNT):
        obj = shard(
            f"shard_{index}",
            rng,
            length=rng.uniform(0.8, 1.3),
            width=rng.uniform(0.09, 0.16),
            sides=rng.choice([5, 6, 7]),
        )
        # Spaced along x so the exporter keeps them as separate meshes the
        # renderer can pick between, rather than one merged blob.
        obj.location = (index * 3.0, 0, 0)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        export_apply=True,
        export_materials="NONE",
        export_cameras=False,
        export_lights=False,
        # No animation to export, and leaving it on writes an empty sampler
        # block into every file.
        export_animations=False,
    )

    size = OUT.stat().st_size
    print(f"wrote {OUT.name}: {SHARD_COUNT} shards, {size / 1024:.1f} KB", file=sys.stderr)


main()
