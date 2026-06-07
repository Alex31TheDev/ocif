import OCIFChunk from "./OCIFChunk.js";

import OCIFPart from "../parts/OCIFPart.js";

import OCIFFormat from "../image/OCIFFormat.js";
import OCBitDepths from "../oc/OCBitDepths.js";
import OCIFChunkNames from "./OCIFChunkNames.js";
import OCIFDataTypes from "../ocif/OCIFDataTypes.js";

import DecodeError from "../errors/DecodeError.js";

class OCIFHeaderChunk extends OCIFChunk {
    constructor(data) {
        super(OCIFChunkNames.header, data);
    }

    read(buffer) {
        return [
            buffer.read(OCIFDataTypes.u8),
            buffer.read(OCIFDataTypes.u8),
            buffer.read(OCIFDataTypes.u8),
            buffer.read(OCIFDataTypes.u8),
            buffer.read(OCIFDataTypes.u8),
            buffer.read(OCIFDataTypes.u8)
        ];
    }

    encode(data) {
        return [
            OCIFPart.u8(data.flags),
            OCIFPart.u8(OCIFFormat.charWidth),
            OCIFPart.u8(OCIFFormat.charHeight),
            OCIFPart.u8(data.depth),
            OCIFPart.u8(data.charsW),
            OCIFPart.u8(data.charsH)
        ];
    }

    decode(parts) {
        const [flags, cellW, cellH, depth, charsW, charsH] = parts.values;

        if (cellW !== OCIFFormat.charWidth || cellH !== OCIFFormat.charHeight) {
            throw new DecodeError(`Unsupported character size: ${cellW}x${cellH}`, this._ref);
        }

        if (!Object.values(OCBitDepths).includes(depth)) {
            throw new DecodeError(`Unsupported bit depth: ${depth}`, this._ref);
        }

        return {
            flags,
            charsW,
            charsH,
            depth
        };
    }
}

export default OCIFHeaderChunk;
