import OCIFChunk from "./OCIFChunk.js";

import OCPalette from "../palette/OCPalette.js";
import OCIFPart from "../parts/OCIFPart.js";

import OCIFFormat from "../image/OCIFFormat.js";
import OCIFChunkNames from "./OCIFChunkNames.js";
import OCIFDataTypes from "../ocif/OCIFDataTypes.js";

import DecodeError from "../errors/DecodeError.js";

class OCIFPaletteChunk extends OCIFChunk {
    constructor(data) {
        super(OCIFChunkNames.palette, data);
    }

    read(buffer, length) {
        const colorCountPart = buffer.read(OCIFDataTypes.u16BE),
            { value: colorCount } = colorCountPart;

        const parts = [colorCountPart];

        if (length !== OCIFDataTypes.u16BE.size + colorCount * 3 * OCIFDataTypes.u8.size) {
            this._lengthError();
        }

        for (let i = 0; i < colorCount; i++) {
            parts.push(buffer.read(OCIFDataTypes.u8));
            parts.push(buffer.read(OCIFDataTypes.u8));
            parts.push(buffer.read(OCIFDataTypes.u8));
        }

        return parts;
    }

    encode(data) {
        const colorParts = data.colors.flatMap(color => [
            OCIFPart.u8(color.r),
            OCIFPart.u8(color.g),
            OCIFPart.u8(color.b)
        ]);

        const colorCountPart = OCIFPart.u16BE(data.size);
        return [colorCountPart].concat(colorParts);
    }

    decode(parts) {
        const [colorCount, ...colors] = parts.values,
            palette = new OCPalette({ size: colorCount });

        if (colorCount < OCIFFormat.customColorCount || colorCount > OCIFFormat.maxPaletteColorCount) {
            throw new DecodeError(`Unsupported palette entry amount: ${colorCount}`, this._ref);
        }

        for (let i = 0; i < colors.length; i += 3) {
            palette.addColor({
                r: colors[i],
                g: colors[i + 1],
                b: colors[i + 2]
            });
        }

        return palette;
    }
}

export default OCIFPaletteChunk;
