import OCIFDataChunk from "../chunks/OCIFDataChunk.js";
import OCIFEndChunk from "../chunks/OCIFEndChunk.js";
import OCIFHeaderChunk from "../chunks/OCIFHeaderChunk.js";
import OCIFPaletteChunk from "../chunks/OCIFPaletteChunk.js";
import OCIFBuffer from "./OCIFBuffer.js";
import OCIFDrawData from "../data/OCIFDrawData.js";
import OCIFSignature from "./OCIFSignature.js";

class OCIFEncoder {
    constructor(options = {}) {
        this.options = options;

        this._image = options.image;
        this._chunks = [];
        this._signature = new OCIFSignature();
    }

    encode() {
        this._chunks = [];
        this._addChunks();

        const buffer = this._createBuffer();

        this._signature.encode().write(buffer);
        this._writeChunks(buffer);
        return buffer.finish("OCIF");
    }

    _getSignatureSize() {
        return this._signature.size;
    }

    _getChunksSize() {
        let size = 0;

        for (let i = 0; i < this._chunks.length; i++) {
            size += this._chunks[i].getSize();
        }

        return size;
    }

    _createHeaderChunk() {
        return new OCIFHeaderChunk(this._image).encode();
    }

    _createPaletteChunk() {
        return new OCIFPaletteChunk(this._image.palette).encode();
    }

    _createDrawPayload() {
        if (this._image.data != null) {
            return this._image.data;
        }

        return new OCIFDrawData({
            buckets: this._image.buckets,
            compress: this._image.compress
        }).encode();
    }

    _createDataChunk() {
        return new OCIFDataChunk(this._createDrawPayload()).encode();
    }

    _addChunks() {
        this._chunks.push(this._createHeaderChunk());
        this._chunks.push(this._createPaletteChunk());
        this._chunks.push(this._createDataChunk());
        this._chunks.push(new OCIFEndChunk().encode());
    }

    _createBuffer() {
        return new OCIFBuffer({ size: this._getSignatureSize() + this._getChunksSize() });
    }

    _writeChunks(buffer) {
        for (const chunk of this._chunks) {
            chunk.write(buffer);
        }
    }
}

export default OCIFEncoder;
