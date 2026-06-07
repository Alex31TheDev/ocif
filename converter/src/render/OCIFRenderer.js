import sharp from "sharp";

import OCIFBuffer from "../ocif/OCIFBuffer.js";

import OCIFFormat from "../image/OCIFFormat.js";
import OCIFDataTypes from "../ocif/OCIFDataTypes.js";

import FileUtil from "../util/FileUtil.js";

function maskForBrailleBytes(buffer, offset) {
    if (buffer[offset] !== 0xe2 || buffer[offset + 1] < 0xa0 || buffer[offset + 1] > 0xa3) {
        return 0;
    }

    const code = ((buffer[offset + 1] & 0x03) << 6) | (buffer[offset + 2] & 0x3f);

    let mask = ((code >> 7) & 1) << 0;
    mask |= ((code >> 6) & 1) << 1;
    mask |= ((code >> 5) & 1) << 2;
    mask |= ((code >> 2) & 1) << 3;
    mask |= ((code >> 4) & 1) << 4;
    mask |= ((code >> 1) & 1) << 5;
    mask |= ((code >> 3) & 1) << 6;
    mask |= code & 1;

    return mask;
}

class OCIFRenderer {
    static async writePNG(filePath, image, scale = 1) {
        const rendered = new OCIFRenderer({ image })._render();

        await FileUtil.ensureDir(filePath);

        await sharp(rendered.raw, {
            raw: {
                width: rendered.width,
                height: rendered.height,
                channels: 3
            }
        })
            .resize(rendered.width * scale, rendered.height * scale, { kernel: "nearest" })
            .png()
            .toFile(filePath);
    }

    constructor(options = {}) {
        this.options = options;

        this._image = options.image;
        this._width = this._image.charsW * OCIFFormat.charWidth;
        this._height = this._image.charsH * OCIFFormat.charHeight;
        this._raw = Buffer.alloc(this._width * this._height * 3);
    }

    _drawCell(cellX, cellY, bg, fg, mask) {
        for (let py = 0; py < OCIFFormat.charHeight; py++) {
            for (let px = 0; px < OCIFFormat.charWidth; px++) {
                const i = py * OCIFFormat.charWidth + px,
                    color = mask & (1 << (7 - i)) ? fg : bg,
                    index =
                        ((cellY * OCIFFormat.charHeight + py) * this._width + cellX * OCIFFormat.charWidth + px) * 3;

                this._raw[index] = color.r;
                this._raw[index + 1] = color.g;
                this._raw[index + 2] = color.b;
            }
        }
    }

    _drawRun(decoder, bg, fg) {
        const { value: x } = decoder.read(OCIFDataTypes.u8),
            { value: y } = decoder.read(OCIFDataTypes.u8),
            { value: cells } = decoder.read(OCIFDataTypes.u8),
            { value: textBuffer } = decoder.read(OCIFDataTypes.buffer, cells * 3);

        for (let cell = 0; cell < cells; cell++) {
            this._drawCell(x + cell, y, bg, fg, maskForBrailleBytes(textBuffer, cell * 3));
        }
    }

    _render() {
        const decoder = new OCIFBuffer({ buffer: this._image.data, ref: "OCIF DAT" }),
            { value: bucketCount } = decoder.read(OCIFDataTypes.u16BE);

        for (let i = 0; i < bucketCount; i++) {
            const { value: bgIndex } = decoder.read(OCIFDataTypes.u8),
                { value: fgIndex } = decoder.read(OCIFDataTypes.u8),
                { value: runCount } = decoder.read(OCIFDataTypes.u16BE),
                bg = this._image.palette.colors[bgIndex],
                fg = this._image.palette.colors[fgIndex];

            for (let j = 0; j < runCount; j++) {
                this._drawRun(decoder, bg, fg);
            }
        }

        return {
            raw: this._raw,
            width: this._width,
            height: this._height
        };
    }
}

export default OCIFRenderer;
