import sharp from "sharp";

import OCIFImage from "../image/OCIFImage.js";
import OCIFEncoder from "../ocif/OCIFEncoder.js";
import OCColor from "../palette/OCColor.js";
import OCCustomPalette from "../palette/OCCustomPalette.js";
import OCDefaultPalette from "../palette/OCDefaultPalette.js";
import OCPaletteMixer from "../palette/OCPaletteMixer.js";

import OCIFFormat from "../image/OCIFFormat.js";
import OCTiers from "../oc/OCTiers.js";

import FileUtil from "../util/FileUtil.js";

function clampInt(value, min, max) {
    return Math.max(min, Math.min(max, value | 0));
}

function brailleForMask(mask) {
    let dat = (mask & 0x01) << 7;
    dat |= ((mask & 0x02) >> 1) << 6;
    dat |= ((mask & 0x04) >> 2) << 5;
    dat |= ((mask & 0x08) >> 3) << 2;
    dat |= ((mask & 0x10) >> 4) << 4;
    dat |= ((mask & 0x20) >> 5) << 1;
    dat |= ((mask & 0x40) >> 6) << 3;
    dat |= (mask & 0x80) >> 7;

    return String.fromCodePoint(0x2800 | dat);
}

function nearestIndices(palette, color, count) {
    const bestIndices = new Array(count),
        bestDists = new Array(count);

    let bestLength = 0;

    for (let i = 0; i < palette.colors.length; i++) {
        const dist = color.distance(palette.colors[i]);

        if (bestLength === count && dist >= bestDists[bestLength - 1]) continue;

        let insertAt = bestLength;

        while (insertAt > 0 && dist < bestDists[insertAt - 1]) {
            insertAt--;
        }

        const end = Math.min(bestLength, count - 1);

        for (let j = end; j > insertAt; j--) {
            bestIndices[j] = bestIndices[j - 1];
            bestDists[j] = bestDists[j - 1];
        }

        bestIndices[insertAt] = i;
        bestDists[insertAt] = dist;

        if (bestLength < count) {
            bestLength++;
        }
    }

    bestIndices.length = bestLength;
    return bestIndices;
}

class OCIFConverter {
    static async convert(options = {}) {
        return new OCIFConverter(options)._convert();
    }

    constructor(options = {}) {
        this.options = options;

        this._tier = OCTiers[options.tier];

        this._charsW = clampInt(options.charsW ?? this._tier.charsW, 1, this._tier.charsW);
        this._charsH = clampInt(options.charsH ?? this._tier.charsH, 1, this._tier.charsH);

        this._width = this._charsW * OCIFFormat.charWidth;
        this._height = this._charsH * OCIFFormat.charHeight;
    }

    async _resizeImage() {
        const resized = await sharp(this.options.inputPath)
            .resize(this._width, this._height, {
                fit: this.options.fit,
                background: this.options.background,
                withoutEnlargement: false
            })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        return resized.data;
    }

    _buildCells(raw) {
        const cells = [];

        for (let cy = 0; cy < this._charsH; cy++) {
            for (let cx = 0; cx < this._charsW; cx++) {
                const cell = new Array(OCIFFormat.charWidth * OCIFFormat.charHeight);

                for (let py = 0; py < OCIFFormat.charHeight; py++) {
                    for (let px = 0; px < OCIFFormat.charWidth; px++) {
                        const pixelIndex =
                            ((cy * OCIFFormat.charHeight + py) * this._width + (cx * OCIFFormat.charWidth + px)) * 4;

                        cell[py * OCIFFormat.charWidth + px] = new OCColor({
                            r: raw[pixelIndex],
                            g: raw[pixelIndex + 1],
                            b: raw[pixelIndex + 2]
                        });
                    }
                }

                cells.push(cell);
            }
        }

        return cells;
    }

    _bestCell(cell, palette) {
        const candidateFlags = new Uint8Array(palette.colors.length),
            candidates = [];

        for (const color of cell) {
            const nearest = nearestIndices(palette, color, this.options.candidates);

            for (let i = 0; i < nearest.length; i++) {
                const index = nearest[i];

                if (candidateFlags[index] === 0) {
                    candidateFlags[index] = 1;
                    candidates.push(index);
                }
            }
        }

        if (candidates.length === 0) {
            candidates.push(0);
        }

        let bestBg = candidates[0],
            bestFg = candidates[0],
            bestMask = 0,
            bestError = Number.POSITIVE_INFINITY;

        for (let ai = 0; ai < candidates.length; ai++) {
            const bgIndex = candidates[ai],
                bg = palette.colors[bgIndex];

            for (let bi = ai; bi < candidates.length; bi++) {
                const fgIndex = candidates[bi],
                    fg = palette.colors[fgIndex];

                let mask = 0,
                    error = 0;

                for (let i = 0; i < cell.length; i++) {
                    const dBg = cell[i].distance(bg),
                        dFg = cell[i].distance(fg);

                    if (dFg < dBg) {
                        mask |= 1 << (7 - i);
                        error += dFg;
                    } else {
                        error += dBg;
                    }

                    if (error >= bestError) break;
                }

                if (error < bestError) {
                    bestBg = bgIndex;
                    bestFg = fgIndex;
                    bestMask = mask;
                    bestError = error;
                }
            }
        }

        if (bestBg === bestFg) {
            bestMask = 0;
        } else if (bestBg > bestFg) {
            const tmp = bestBg;
            bestBg = bestFg;
            bestFg = tmp;
            bestMask ^= 0xff;
        }

        if (bestMask === 0) {
            bestFg = bestBg;
        } else if (bestMask === 0xff) {
            bestBg = bestFg;
            bestMask = 0;
        }

        return { bg: bestBg, fg: bestFg, mask: bestMask };
    }

    _cellAssignments(cell, encoded, palette) {
        const bg = palette.colors[encoded.bg],
            fg = palette.colors[encoded.fg],
            assignments = new Array(cell.length);

        for (let i = 0; i < cell.length; i++) {
            const dBg = cell[i].distance(bg),
                dFg = cell[i].distance(fg);

            assignments[i] = dFg < dBg ? encoded.fg : encoded.bg;
        }

        return assignments;
    }

    _encodeRuns(cells, palette) {
        const buckets = new Map();

        for (let cy = 0; cy < this._charsH; cy++) {
            let run = null,
                runX = 0;

            for (let cx = 0; cx < this._charsW; cx++) {
                const cell = cells[cy * this._charsW + cx],
                    encoded = this._bestCell(cell, palette),
                    ch = brailleForMask(encoded.mask);

                if (run && run.bg === encoded.bg && run.fg === encoded.fg) {
                    run.text += ch;
                    run.cells++;
                } else {
                    if (run) {
                        this._addRunBucket(buckets, run, runX, cy);
                        runX = cx;
                    }

                    run = { bg: encoded.bg, fg: encoded.fg, cells: 1, text: ch };
                }
            }

            if (run) {
                this._addRunBucket(buckets, run, runX, cy);
            }
        }

        return Array.from(buckets.values()).sort((a, b) => a.bg - b.bg || a.fg - b.fg);
    }

    _addRunBucket(buckets, run, x, y) {
        const key = (run.bg << 8) | run.fg;
        let bucket = buckets.get(key);

        if (typeof bucket === "undefined") {
            bucket = { bg: run.bg, fg: run.fg, runs: [] };
            buckets.set(key, bucket);
        }

        bucket.runs.push({ x, y, cells: run.cells, text: run.text });
    }

    _createImage(palette, buckets) {
        return new OCIFImage({
            tier: this._tier,
            charsW: this._charsW,
            charsH: this._charsH,
            palette,
            buckets,
            compress: this.options.compress
        });
    }

    async _convert() {
        const raw = await this._resizeImage(),
            cells = this._buildCells(raw);

        const custom = new OCCustomPalette(raw, this._width, this._height),
            mixer = new OCPaletteMixer({
                defaultPalette: OCDefaultPalette,
                customPalette: custom
            });

        mixer.optimize(
            cells,
            this.options,
            (cell, activePalette) => this._bestCell(cell, activePalette),
            (cell, encoded, activePalette) => this._cellAssignments(cell, encoded, activePalette)
        );

        const activePalette = mixer.createActive(this.options.tier),
            buckets = this._encodeRuns(cells, activePalette);

        const image = this._createImage(activePalette, buckets);

        await FileUtil.writeFile(this.options.outputPath, new OCIFEncoder({ image }).encode());

        return image;
    }
}

export default OCIFConverter;
