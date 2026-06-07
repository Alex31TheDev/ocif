import OCIFChunkNames from "./OCIFChunkNames.js";

import OCIFDataChunk from "./OCIFDataChunk.js";
import OCIFEndChunk from "./OCIFEndChunk.js";
import OCIFHeaderChunk from "./OCIFHeaderChunk.js";
import OCIFPaletteChunk from "./OCIFPaletteChunk.js";

import ChunkError from "../errors/ChunkError.js";

let OCIFChunkTypes = new Map();

{
    OCIFChunkTypes.set(OCIFChunkNames.header, OCIFHeaderChunk);
    OCIFChunkTypes.set(OCIFChunkNames.palette, OCIFPaletteChunk);
    OCIFChunkTypes.set(OCIFChunkNames.data, OCIFDataChunk);
    OCIFChunkTypes.set(OCIFChunkNames.end, OCIFEndChunk);
}

function getChunkType(name, ref) {
    const _class = OCIFChunkTypes.get(name);

    if (typeof _class === "undefined") {
        throw new ChunkError(`Unknown OCIF chunk: ${name}`, ref);
    }

    return _class;
}

OCIFChunkTypes = Object.freeze(OCIFChunkTypes);
export { OCIFChunkTypes, getChunkType };
