# Tank evolution sprite sources

Generated with the built-in image generation tool using assets/art/tanks.png as identity reference. Four independent transparent RGBA strips each contain six complete side-view right-facing vehicles, levels 0–5. Runtime sprites are separate PNG files in sprites/evolution, isolated by alpha connected components rather than grid cropping; alpha and RGB are preserved.

Prompt brief: preserve each tank identity (cyan tracked Bastion, amber wheeled Striker, violet hover Arc, white/teal heavy Warden); six progressively rebuilt hull/turret/barrel silhouettes; basic compact vehicle → reinforced hull → angular skirts/larger cannon → rebuilt reactor/turret → advanced armor → gold-accent elite apex; no labels, UI indicators, ground, or external shadows.

Appearance stage is the highest purchased upgrade level, bounded 0–5. No save schema changes. All game modes using the new client and the appearance gallery share the same sprite images. The original online client remains separate.

## Premium v2 models

Four newly generated six-model rows (built-in image generation, transparent background), equal wheelbase/camera scale. Each level has an explicit distinct turret/hull topology: flat standard, reactive/block armor, tapered/hexagonal armor, open tactical/coil structures, composite rounded shells, faceted masterwork. Premium raw PNGs are retained alongside the old source. Runtime uses *-v2.png and a constant display width in both showroom and battle; higher levels no longer receive larger render widths. The gallery shows all 24 distinct models at consistent width.
