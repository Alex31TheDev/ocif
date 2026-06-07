# OCIF Binary Format

OCIF is a chunked binary image format for OpenComputers tier 2 and tier 3 GPU
output.

It does not store raw RGB pixels. It stores:

1. a file signature
2. display metadata in an `HDR` chunk
3. a zero-based RGB palette in a `PAL` chunk
4. a prebatched drawing stream in one or more `DAT` chunks
5. an `END` chunk

The drawing stream is optimized for OpenComputers terminal rendering. It is a
sequence of color buckets. Each bucket contains horizontal text runs. Each text
run contains UTF-8 braille characters. Each braille character represents one
terminal cell, and one terminal cell represents a `2x4` block of source pixels.

All multi-byte integers are big-endian. All coordinates stored in the file are
zero-based.

## Core Concepts

### Pixels, Cells, and Braille

OCIF converts an image into character cells. A character cell is always `2`
pixels wide and `4` pixels tall.

```text
one OCIF cell = 2 x 4 source pixels = 8 source pixels
```

Each cell is stored as one Unicode braille character. A braille character has
eight dots, so it can describe which of the eight source pixels should use the
foreground color. Pixels whose dots are not set use the background color.

The stored dimensions in `HDR` are character dimensions:

```text
stored image width in pixels  = charsW * 2
stored image height in pixels = charsH * 4
```

For example, a tier 3 image with `charsW = 160` and `charsH = 50` represents a
`320x200` pixel-equivalent image.

### Palette Indices

`DAT` does not store RGB colors directly. It stores palette indices. The actual
RGB colors are stored in `PAL`.

Palette entries are zero-based:

```text
palette index 0 refers to the first RGB triple in PAL
palette index 1 refers to the second RGB triple in PAL
...
```

Every palette index in `DAT` is stored as a `u8`, so it can address entries
`0..255`.

### Buckets

A bucket is a group of draw runs that all use the same background and
foreground palette indices.

OpenComputers drawing is faster when the GPU colors are changed less often.
Instead of storing every cell with its own colors, OCIF groups same-color runs
into buckets:

```text
bucket:
  background palette index
  foreground palette index
  run count
  runs...
```

The viewer can set the background and foreground once for the bucket, then draw
all runs in that bucket.

### Runs

A run is a horizontal string of adjacent cells on one row. Every cell in the
run uses the bucket's background and foreground colors.

```text
run:
  x position
  y position
  number of cells
  UTF-8 braille text
```

The text length is not stored separately. It is derived from `cells`. Each
braille character is 3 bytes in UTF-8, so the text byte length is:

```text
text byte length = cells * 3
```

## File Layout

Complete file layout:

| Offset | Size | Type | Field |
| ------ | ---- | ---- | ----- |
| 0      | 4    | ASCII | magic, always `OCIF` |
| 4      | 1    | u8 | version, currently `1` |
| 5      | ...  | chunks | chunk stream |

The chunk stream normally contains:

```text
HDR
PAL
DAT
END
```

The current encoder writes exactly one `DAT` chunk. The decoder accepts one or
more `DAT` chunks and concatenates their payloads in file order before decoding
the draw stream.

## Signature

The signature is exactly 5 bytes.

| Bytes | Type | Value | Meaning |
| ----- | ---- | ----- | ------- |
| 4 | ASCII | `OCIF` | file magic |
| 1 | u8 | `1` | format version |

A decoder should reject the file if:

- the first four bytes are not `OCIF`
- the version is not supported

The current implementation supports only version `1`.

## Chunk Envelope

Every chunk has the same envelope.

| Bytes | Type | Field | Meaning |
| ----- | ---- | ----- | ------- |
| 3 | ASCII | name | chunk name |
| 4 | u32 BE | length | payload length in bytes |
| `length` | bytes | payload | chunk-specific payload |
| 4 | u32 BE | checksum | CRC32 of name, length, and payload |

Chunk names are exactly three uppercase ASCII letters. The current decoder only
recognizes these names:

| Name | Meaning |
| ---- | ------- |
| `HDR` | header metadata |
| `PAL` | palette |
| `DAT` | draw data |
| `END` | end of stream |

Unknown chunk names are rejected.

### Chunk Size

`length` means payload length only.

Full chunk size is:

```text
chunk size = 3 + 4 + length + 4
           = length + 11
```

### Chunk Checksum

The checksum is standard CRC32 using polynomial `0xedb88320`, initialized with
all bits set and finalized by inverting the result. It is stored as `u32 BE`.

The checksum covers:

```text
3-byte chunk name
4-byte payload length
payload bytes
```

It does not cover:

- the file signature
- earlier or later chunks
- the checksum field itself

For an empty chunk such as `END`, the checksum is still calculated over the
chunk name and the four zero length bytes.

### Chunk Reading Rules

The current decoder reads chunks until `END` or end of buffer. It requires:

- at least one `HDR`
- at least one `PAL`
- at least one `DAT`

When a repeated `HDR` or `PAL` appears before `END`, the current decoder keeps
the last one it saw. When repeated `DAT` chunks appear, all `DAT` payloads are
kept and concatenated.

The chunk payload length must exactly match the bytes consumed by chunks with a
structured payload, such as `HDR` and `PAL`. A chunk checksum mismatch rejects
the file.

## `HDR` Chunk

`HDR` stores display requirements and feature flags.

Payload length is always 6 bytes.

| Payload Offset | Bytes | Type | Field | Meaning |
| -------------- | ----- | ---- | ----- | ------- |
| 0 | 1 | u8 | flags | feature bit field |
| 1 | 1 | u8 | charWidth | source pixels per cell horizontally |
| 2 | 1 | u8 | charHeight | source pixels per cell vertically |
| 3 | 1 | u8 | depth | required OpenComputers GPU bit depth |
| 4 | 1 | u8 | charsW | image width in character cells |
| 5 | 1 | u8 | charsH | image height in character cells |

### `flags`

`flags` is a bit field.

| Mask | Name | Meaning |
| ---- | ---- | ------- |
| `0x01` | compressed data | concatenated `DAT` payload is zlib-deflated |

All other bits are currently undefined. Encoders should leave undefined bits
unset. Decoders that follow the current implementation only act on `0x01`.

If `flags & 0x01` is nonzero:

1. collect all `DAT` chunk payloads in file order
2. concatenate them
3. inflate the result with zlib
4. parse the inflated bytes as the draw stream

If `flags & 0x01` is zero, the concatenated `DAT` payload is the draw stream
directly.

The Node decoder and preview renderer support compressed `DAT`. The bundled
Lua OpenComputers viewer currently rejects compressed data.

### `charWidth` and `charHeight`

Current supported values:

| Field | Required Value |
| ----- | -------------- |
| `charWidth` | `2` |
| `charHeight` | `4` |

These values define the braille cell size. The decoder rejects any other cell
size.

### `depth`

`depth` is the OpenComputers GPU color depth required by the image.

| Value | Meaning |
| ----- | ------- |
| `4` | tier 2 style output, 16 active palette colors |
| `8` | tier 3 style output, 256 active palette colors |

The decoder rejects depths other than `4` and `8`.

The viewer checks the active GPU/screen maximum depth before drawing. If the
image requires more depth than the hardware supports, the viewer rejects the
image.

### `charsW` and `charsH`

`charsW` and `charsH` are image dimensions in character cells. They are both
`u8`, so the encoded maximum for each field is 255.

The converter normally uses these tier limits:

| Tier | `charsW` | `charsH` | `depth` | Pixel Equivalent |
| ---- | -------- | -------- | ------- | ---------------- |
| 2 | 80 | 25 | 4 | `160x100` |
| 3 | 160 | 50 | 8 | `320x200` |

The converter can store smaller dimensions if requested, but it clamps them to
the selected tier's maximum.

## `PAL` Chunk

`PAL` stores RGB palette entries.

Payload layout:

| Payload Offset | Bytes | Type | Field | Meaning |
| -------------- | ----- | ---- | ----- | ------- |
| 0 | 2 | u16 BE | colorCount | number of RGB entries |
| 2 | 3 | u8, u8, u8 | color 0 | red, green, blue |
| 5 | 3 | u8, u8, u8 | color 1 | red, green, blue |
| ... | ... | ... | ... | ... |

Payload length must be:

```text
2 + colorCount * 3
```

The current decoder accepts:

```text
16 <= colorCount <= 256
```

Each color channel is one byte:

```text
red   = 0..255
green = 0..255
blue  = 0..255
```

### Palette Indexing

`DAT` bucket color fields store palette indices, not RGB values. For example:

```text
bucket bg index = 3
bucket fg index = 17
```

means:

```text
background color = PAL color 3
foreground color = PAL color 17
```

The format stores palette indices as `u8`, so `PAL` should not contain more
than 256 colors.

The current renderer assumes every index used by `DAT` exists in `PAL`.

### Converter Palette Construction

The converter builds a custom 16-color palette from the resized source image
using image quantization. It then optimizes those 16 colors over one or more
palette passes.

For tier 2:

```text
active palette size = 16
entries 0..15       = optimized custom colors
```

For tier 3:

```text
active palette size = 256
entries 0..15       = optimized custom colors
entries 16..255     = default color cube
```

The default color cube has 240 entries. It is generated from these channel
levels:

```text
red   levels: 00, 33, 66, 99, cc, ff
green levels: 00, 24, 49, 6d, 92, b6, db, ff
blue  levels: 00, 40, 80, bf, ff
```

The cube order for entry `16 + i` is:

```text
red   = redLevels[floor(i / 40) % 6]
green = greenLevels[floor(i / 5) % 8]
blue  = blueLevels[i % 5]
```

The converter writes the full active palette to `PAL`. A decoder does not need
to know how the default cube was generated in order to render the file.

### OpenComputers Palette Behavior

OpenComputers has special behavior for the first 16 palette slots. The bundled
Lua viewer applies `PAL[0..15]` to GPU palette slots `0..15`.

When drawing:

- palette indices `< 16` are used as palette colors
- palette indices `>= 16` are used as direct RGB colors from `PAL`

This lets tier 2 images use the 16 programmable palette slots, and tier 3
images use both custom palette slots and direct colors.

## `DAT` Chunk

`DAT` stores the draw stream. Its chunk payload is either:

- raw draw stream bytes, when `HDR.flags & 0x01` is zero
- zlib-deflated draw stream bytes, when `HDR.flags & 0x01` is nonzero

If several `DAT` chunks are present, concatenate their payloads first. Then
inflate the concatenated bytes if compression is enabled.

The draw stream is not self-delimiting at the chunk level. Its total length is
the length of the concatenated, optionally inflated `DAT` bytes.

## Draw Stream Grammar

The logical `DAT` draw stream has this structure:

```text
DrawStream:
  u16BE bucketCount
  Bucket[bucketCount]

Bucket:
  u8     bgIndex
  u8     fgIndex
  u16BE  runCount
  Run[runCount]

Run:
  u8     x
  u8     y
  u8     cells
  bytes  text[cells * 3]
```

### Draw Stream Header

The first two bytes are `bucketCount`.

| Bytes | Type | Field | Meaning |
| ----- | ---- | ----- | ------- |
| 2 | u16 BE | bucketCount | number of buckets following |

`bucketCount` can encode up to 65535 buckets. The converter emits one bucket
for each distinct `(bgIndex, fgIndex)` pair used by its runs.

## Buckets in Detail

Bucket payload:

| Bytes | Type | Field | Meaning |
| ----- | ---- | ----- | ------- |
| 1 | u8 | bgIndex | palette index for unset braille dots |
| 1 | u8 | fgIndex | palette index for set braille dots |
| 2 | u16 BE | runCount | number of runs in this bucket |
| variable | runs | runs | `runCount` run records |

`bgIndex` and `fgIndex` are indices into `PAL`.

The background color is used for every unset bit in every braille character in
the bucket. The foreground color is used for every set bit.

The converter sorts buckets by:

```text
bgIndex ascending, then fgIndex ascending
```

This sort order is not required for correctness. It is just the current encoder
output.

### Why Buckets Exist

A naive format could store `x`, `y`, `bg`, `fg`, and `char` for every cell.
That would repeat color indices constantly.

OCIF instead stores color indices once per bucket, then stores only positions
and text for the runs in that bucket. This keeps the draw stream smaller and
matches the OpenComputers viewer's drawing model:

1. set background color
2. set foreground color
3. draw all strings that use those colors
4. move to the next color pair

### Bucket Limits

The format stores `runCount` as `u16 BE`, so one bucket can contain up to 65535
runs.

The format stores color indices as `u8`, so a bucket can only reference palette
indices `0..255`.

## Runs in Detail

Run payload:

| Bytes | Type | Field | Meaning |
| ----- | ---- | ----- | ------- |
| 1 | u8 | x | zero-based character column |
| 1 | u8 | y | zero-based character row |
| 1 | u8 | cells | number of cells in this horizontal run |
| `cells * 3` | bytes | text | UTF-8 braille string |

`x` and `y` are measured in character cells, not source pixels.

```text
first cell in run is at:      (x, y)
second cell in run is at:     (x + 1, y)
last cell in run is at:       (x + cells - 1, y)
```

In pixel-equivalent coordinates, a cell at `(x, y)` covers:

```text
pixel x range = x * 2 through x * 2 + 1
pixel y range = y * 4 through y * 4 + 3
```

### `cells`

`cells` is `u8`, so one run can contain at most 255 character cells.

The converter creates runs while scanning each row left to right. It starts a
new run whenever the encoded background or foreground palette index changes.
Therefore, each converter-produced run is:

- horizontal
- on one row
- adjacent
- same background index
- same foreground index

### `text`

`text` contains exactly `cells` Unicode braille characters encoded as UTF-8.

All Unicode braille code points are in `U+2800..U+28FF`. In UTF-8, those code
points are always 3 bytes long. Therefore:

```text
text bytes = cells * 3
```

There is no null terminator and no text length field.

The Lua viewer sends the stored UTF-8 text directly to `gpu.set`. The Node
preview renderer decodes the same bytes back into braille masks and renders raw
RGB pixels.

## Cell Encoding in Detail

Each cell starts as eight RGB source pixels arranged as `2x4`.

The converter evaluates candidate palette color pairs and chooses the pair with
the lowest color error. For each pixel in the cell:

1. compare the pixel to the candidate background color
2. compare the pixel to the candidate foreground color
3. assign the pixel to whichever color is closer
4. set the mask bit when the foreground color wins

The final encoded cell is:

```text
bgIndex
fgIndex
mask
```

`bgIndex` and `fgIndex` are stored at the bucket level. `mask` is stored as a
braille character in the run text.

### Pixel Position to Mask Bit

The source pixels are numbered in row-major order:

```text
y=0: x=0, x=1
y=1: x=0, x=1
y=2: x=0, x=1
y=3: x=0, x=1
```

The row-major mask uses these bits:

| Mask Bit | Hex | Pixel |
| -------- | --- | ----- |
| bit 7 | `0x80` | x 0, y 0 |
| bit 6 | `0x40` | x 1, y 0 |
| bit 5 | `0x20` | x 0, y 1 |
| bit 4 | `0x10` | x 1, y 1 |
| bit 3 | `0x08` | x 0, y 2 |
| bit 2 | `0x04` | x 1, y 2 |
| bit 1 | `0x02` | x 0, y 3 |
| bit 0 | `0x01` | x 1, y 3 |

When rendering:

```text
if mask has the bit set:
  draw foreground color
else:
  draw background color
```

### Mask to Unicode Braille

Unicode braille dot order is not the same as OCIF's row-major pixel order. The
converter remaps the row-major mask into a Unicode braille code point.

Given an OCIF row-major `mask`, the converter computes braille data bits like
this:

```text
dat  = (mask & 0x01) << 7
dat |= ((mask & 0x02) >> 1) << 6
dat |= ((mask & 0x04) >> 2) << 5
dat |= ((mask & 0x08) >> 3) << 2
dat |= ((mask & 0x10) >> 4) << 4
dat |= ((mask & 0x20) >> 5) << 1
dat |= ((mask & 0x40) >> 6) << 3
dat |= (mask & 0x80) >> 7
```

The stored character is:

```text
code point = U+2800 + dat
```

That code point is encoded into UTF-8 and appended to the run text.

### Unicode Braille to Mask

The Node preview renderer reverses the process. It expects each stored cell
character to be 3 UTF-8 bytes in the braille range.

For one braille character encoded as bytes `b0`, `b1`, `b2`:

```text
b0 must be 0xe2
b1 should be in the 0xa0..0xa3 range for U+2800..U+28FF
b2 contains the low continuation bits
```

The renderer reconstructs the Unicode braille data byte:

```text
code = ((b1 & 0x03) << 6) | (b2 & 0x3f)
```

Then it reconstructs the OCIF row-major mask:

```text
mask  = ((code >> 7) & 1) << 0
mask |= ((code >> 6) & 1) << 1
mask |= ((code >> 5) & 1) << 2
mask |= ((code >> 2) & 1) << 3
mask |= ((code >> 4) & 1) << 4
mask |= ((code >> 1) & 1) << 5
mask |= ((code >> 3) & 1) << 6
mask |= (code & 1) << 7
```

The renderer then draws the `2x4` cell using foreground color for set bits and
background color for unset bits.

## Converter Encoding Behavior

This section describes how the current converter chooses the data that appears
in `PAL` and `DAT`. It is not required for decoding, but it explains why the
stored format has its current shape.

### Image Resize

The source image is resized to:

```text
target width  = charsW * 2
target height = charsH * 4
```

The resized image is converted to raw RGBA. Alpha is ensured by the image
pipeline, but the converter's cell builder stores only RGB channels.

### Cell Building

The converter scans the resized image by character cell:

```text
for cy in 0..charsH-1:
  for cx in 0..charsW-1:
    collect the 2x4 RGB pixels for cell (cx, cy)
```

Each collected cell contains eight RGB colors.

### Choosing Cell Colors

For each cell, the converter searches for a good `(bgIndex, fgIndex, mask)`
combination:

1. find candidate palette indices near the cell's source colors
2. test candidate background and foreground pairs
3. for each pair, assign each of the eight pixels to background or foreground
4. compute total color error
5. keep the pair and mask with the lowest total error

If the chosen background and foreground are equal, the mask is forced to zero.
If the foreground index is lower than the background index, the converter swaps
the two indices and inverts the mask. This normalizes color pairs so the same
visual cell is more likely to land in the same bucket.

If the mask is all foreground (`0xff`), the converter collapses it to all
background by setting `bgIndex = fgIndex` and `mask = 0`. This avoids storing a
full foreground mask when a solid-color cell can be represented as background
only.

### Run Building

The converter scans rows left to right. Consecutive cells with the same
`bgIndex` and `fgIndex` are merged into one run.

Pseudo-structure:

```text
for each row y:
  start empty current run
  for each column x:
    encode cell to bgIndex, fgIndex, brailleChar
    if current run has same bgIndex and fgIndex:
      append brailleChar
      increment cells
    else:
      finish current run
      start new run at x, y
```

The finished run is then added to the bucket identified by:

```text
bucket key = (bgIndex << 8) | fgIndex
```

After all rows are scanned, buckets are sorted by background index and then
foreground index.

## Rendering Behavior

To render an OCIF image:

1. read and validate the signature
2. read chunks until `END`
3. validate `HDR`
4. read `PAL`
5. concatenate all `DAT` payloads
6. inflate concatenated `DAT` bytes if `HDR.flags & 0x01` is set
7. parse the draw stream
8. for each bucket, set background and foreground colors
9. for each run, draw its UTF-8 braille text at `(x, y)`

The Lua viewer also:

- enables precise screen mode when available
- sets GPU depth to `HDR.depth`
- sets resolution to the GPU maximum
- centers the image within the screen
- clears the margins around the image
- loads `PAL[0..15]` into OpenComputers palette slots

The Lua viewer converts OCIF zero-based coordinates to OpenComputers one-based
coordinates:

```text
gpu x = offx + run.x + 1
gpu y = offy + run.y + 1
```

## `END` Chunk

`END` marks the end of the chunk stream. It has no payload.

Chunk envelope:

| Bytes | Type | Field | Value |
| ----- | ---- | ----- | ----- |
| 3 | ASCII | name | `END` |
| 4 | u32 BE | length | `0` |
| 4 | u32 BE | checksum | CRC32 of `END` plus zero length |

Because `END` has no payload, the chunk's full size is 11 bytes.

## Validation Summary

A strict decoder should validate:

- signature magic is `OCIF`
- version is supported
- chunk names are known or explicitly skippable
- chunk payload lengths do not run past the file
- chunk CRC32 values match
- `HDR` payload length is 6 bytes
- `HDR.charWidth` is 2
- `HDR.charHeight` is 4
- `HDR.depth` is 4 or 8
- `PAL` payload length is `2 + colorCount * 3`
- `PAL.colorCount` is between 16 and 256
- all palette indices used by buckets exist
- run text byte length is exactly `cells * 3`
- run text contains valid UTF-8 braille characters
- run coordinates and lengths fit inside `HDR.charsW` and `HDR.charsH`
- the draw stream consumes exactly the expected number of bytes

The current implementation performs the signature, chunk length, checksum,
header, palette count, and required chunk checks. The renderer/viewer assumes
the draw stream itself is well-formed.

## Byte-Level Example Shape

This is the shape of a small uncompressed file with one bucket and one run:

```text
4f 43 49 46                         # "OCIF"
01                                  # version

48 44 52                            # "HDR"
00 00 00 06                         # payload length = 6
00                                  # flags = uncompressed
02                                  # charWidth
04                                  # charHeight
08                                  # depth
02                                  # charsW
01                                  # charsH
........                            # HDR checksum

50 41 4c                            # "PAL"
00 00 00 32                         # payload length = 50 for 16 colors
00 10                               # colorCount = 16
rr gg bb ...                        # 16 RGB triples
........                            # PAL checksum

44 41 54                            # "DAT"
00 00 00 0f                         # payload length = 15
00 01                               # bucketCount = 1
00                                  # bucket 0 bgIndex
01                                  # bucket 0 fgIndex
00 01                               # runCount = 1
00                                  # run x = 0
00                                  # run y = 0
02                                  # cells = 2
e2 a0 80 e2 a0 80                   # two UTF-8 braille chars
........                            # DAT checksum

45 4e 44                            # "END"
00 00 00 00                         # payload length = 0
........                            # END checksum
```

Checksums are shown as `........` because they depend on the exact preceding
chunk bytes.

## Data Storage Summary

At a high level:

```text
OCIF file
  signature
  HDR chunk
    flags
    cell size
    depth
    character dimensions
  PAL chunk
    RGB palette entries
  DAT chunk(s)
    bucket count
    buckets grouped by color pair
      background palette index
      foreground palette index
      runs
        x/y character coordinate
        cell count
        UTF-8 braille text
  END chunk
```

The format is compact because it stores palette indices instead of RGB values
inside the draw stream, stores colors once per bucket instead of once per cell,
and stores eight source pixels inside each braille character.
