# OCIF (OpenComputers Image Format)

Fast image format for OpenComputers tier 2 and tier 3 GPUs.

OCIF is meant to be quick to display in-game while still keeping color and resolution quality reasonable for OpenComputers hardware.

The converter targets the documented OC graphics card limits:

- tier 2: `80x25` characters, 4-bit color
- tier 3: `160x50` characters, 8-bit color

## Converter

The Node converter lives in `converter/`.

It can:

- convert a single image
- batch-convert a folder in filename order
- write previews for inspection
- copy the OC viewer scripts and generated `.ocif` files into a target world folder

Setup and common use:

```powershell
cd converter
npm install
node scripts/convert.js input.png
node scripts/convert.js input.png -o image.ocif --mode oc-tier2 --fit cover
node scripts/batch.js input-folder
npm run copy -- <drive root path>
```

Generated files go to `converter/output/` by default, with previews in `converter/preview/`.

## Viewer

Lua viewers live in `viewers/`.

- `ocifview.lua` renders a single OCIF file
- `slideshow.lua` walks a folder in filename order and shows each file with a delay

Example:

```sh
ocifview img/gradient_320x200.ocif
slideshow img 3
```

## More

See `converter/format.txt` for the file format and display details.
