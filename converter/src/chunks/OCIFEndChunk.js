import OCIFChunk from "./OCIFChunk.js";

import OCIFChunkNames from "./OCIFChunkNames.js";

class OCIFEndChunk extends OCIFChunk {
    constructor() {
        super(OCIFChunkNames.end, null, {
            requiresData: false
        });
    }
}

export default OCIFEndChunk;
