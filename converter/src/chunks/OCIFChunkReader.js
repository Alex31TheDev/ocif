import { getChunkType } from "./OCIFChunkTypes.js";

import OCIFDataTypes from "../ocif/OCIFDataTypes.js";
import OCIFChunk from "./OCIFChunk.js";

class OCIFChunkReader {
    constructor(buffer, options = {}) {
        this._buffer = buffer;

        this.options = options;
    }

    read() {
        return this._buffer.transaction(() => {
            const { value: name } = this._buffer.read(OCIFDataTypes.ASCII, OCIFChunk.nameSize),
                { value: length } = this._buffer.read(OCIFDataTypes.u32BE);

            const _class = getChunkType(name, this._buffer.options.ref);
            return new _class().read(this._buffer, length).decode();
        });
    }
}

export default OCIFChunkReader;
