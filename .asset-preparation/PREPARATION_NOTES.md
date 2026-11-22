# NEXUS ONE asset preparation

## Files

- `nexus-one-prepared.glb` — assembled default state, 3 colorway materials, and separate external/internal component nodes.
- `preview.html` — local assembled and exploded preview with a finish selector. Serve the workspace root over HTTP to use it; it loads Three.js from the already-installed project package.
- `exploded-view.json` — node names, assembled and exploded transforms, reveal order, reassembly timing, color presets, and suggested HTML-label anchors.
- `textures/texture-optimization.json` — dimensions, formats, output sizes, and retention/downsize decisions.

## Assembly and motion data

All source parts retain the original model's proportions and assembled vertex positions. Nodes start at their assembled position and carry an independent `explodedTranslation` in `extras.nexus`; returning every node to `assemblyTranslation` restores the complete assembled state. The GLB contains no animation clips. GSAP ScrollTrigger should consume the sidecar phase sequence during the later website integration.

The prepared GLB adds 21 independent, named internal objects: a baffle, driver basket, diaphragm, voice coil, magnet assembly/core, and acoustic damping ring in each cup; plus a right-cup circuit board, DSP/codec package, wireless module, battery assembly, battery retainer, flexible interconnect, and antenna flex.

The new internal geometry is a **visual concept only**. It is not a verified product BOM, electrical design, acoustic tuning, battery specification, or claim that the fictional product contains these exact parts.

## Finish variants

The shell, earcup caps, yokes, and band material use named shell finishes: Black, Silver, and White. Leather, fabric scrims, and metal hardware remain separate materials. The shared shell normal map is retained while the baked slate-gray base-color map is removed from the three shell-finish materials, so each finish receives a clean independent base color.

## Source and rights

Base model: Innerscene, “Over-ear headphones”, model `over-ear-headphones-de211466`, dedicated under CC0 1.0 according to the source listing and embedded GLB metadata. The three internal finishes, internal assemblies, and layout metadata were created for this fictional showcase. Preserve source attribution information if you redistribute the asset even though CC0 does not require a credit.
