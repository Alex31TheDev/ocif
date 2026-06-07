import OCIFChunk from "./OCIFChunk.js";

import OCIFPart from "../parts/OCIFPart.js";

import OCIFChunkNames from "./OCIFChunkNames.js";
import OCIFDataTypes from "../ocif/OCIFDataTypes.js";

class OCIFDataChunk extends OCIFChunk {
    constructor(data) {
        super(OCIFChunkNames.data, data);
    }

    read(buffer, length) {
        return [buffer.read(OCIFDataTypes.buffer, length)];
    }

    encode(data) {
        return Buffer.isBuffer(data) ? [OCIFPart.buffer(data)] : data.parts;
    }

    decode(parts) {
        const [data] = parts.values;
        return data;
    }
}

export default OCIFDataChunk;
