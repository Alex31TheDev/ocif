import OCIFEncodable from "../ocif/OCIFEncodable.js";

import OCIFPart from "../parts/OCIFPart.js";

import OCIFFormat from "../image/OCIFFormat.js";
import OCIFDataTypes from "../ocif/OCIFDataTypes.js";

import CRC32 from "../util/CRC32.js";

import ChunkError from "../errors/ChunkError.js";
import ChecksumError from "../errors/ChecksumError.js";

class OCIFChunk extends OCIFEncodable {
    static nameSize = OCIFFormat.chunkNameSize;
    static lengthPartSize = OCIFDataTypes.u32BE.size;
    static checksumSize = OCIFDataTypes.u32BE.size;

    static headerSize = OCIFChunk.nameSize + OCIFChunk.lengthPartSize;
    static envelopeSize = OCIFChunk.headerSize + OCIFChunk.checksumSize;

    static _errorClass = ChunkError;

    static _getErrorLabel(chunk) {
        return `OCIF ${chunk.name ?? "unknown"} chunk`;
    }

    constructor(name, data = null, options = {}) {
        if (!OCIFFormat.chunkNameRegex.test(name)) {
            throw new ChunkError("Invalid OCIF chunk name", name);
        }

        super(data, options);

        this.name = name;
        this._validateChildFunctions();

        this._childRead = this.read;
        this.read = this._read.bind(this);

        this._childWrite = this.write;
        this.write = this._write.bind(this);

        this._childEncode = this.encode;
        this.encode = this._encode.bind(this);

        this._childDecode = this.decode;
        this.decode = this._decode.bind(this);
    }

    getLength() {
        this.checkParts();
        return this._getLength();
    }

    getSize() {
        this.checkParts();
        return this.constructor.envelopeSize + this._getLength();
    }

    read() {}

    write(buffer) {
        for (const part of this.parts) {
            buffer.write(part);
        }
    }

    encode() {}

    decode() {}

    _getLength() {
        if (!this.requiresData) return 0;
        return this.parts.size;
    }

    _read(buffer, length) {
        buffer.transaction(() => {
            this._setRef(buffer);

            const start = buffer.offset - this.constructor.headerSize,
                endOffset = buffer.offset + length;

            if (this.requiresData) {
                const parts = this._childRead.call(this, buffer, length);

                if (buffer.offset !== endOffset) {
                    this._lengthError();
                }

                this.data = null;
                this.parts = parts;
            } else if (length !== 0) {
                this._lengthError();
            }

            const { value: checksum } = buffer.read(OCIFDataTypes.u32BE),
                expected = new CRC32().calculate(buffer.buffer, start, endOffset);

            if (checksum !== expected) {
                this._checksumError(checksum, expected);
            }
        });

        return this;
    }

    _write(buffer) {
        this.checkParts();

        buffer.transaction(() => {
            const start = buffer.offset;

            buffer.write(OCIFPart.ASCII(this.name));
            buffer.write(OCIFPart.u32BE(this._getLength()));

            if (this.requiresData) {
                this._childWrite.call(this, buffer);
            }

            const checksum = new CRC32().calculate(buffer.buffer, start, buffer.offset);
            buffer.write(OCIFPart.u32BE(checksum));
        });

        return this;
    }

    _encode() {
        this.checkData();

        if (this.requiresData) {
            const parts = this._childEncode.call(this, this.data);

            this.data = null;
            this.parts = parts;
        }

        return this;
    }

    _decode() {
        this.checkParts();

        if (this.requiresData) {
            const data = this._childDecode.call(this, this.parts);

            this.parts = null;
            this.data = data;
        }

        return this;
    }

    _validateChildFunction(name) {
        if (typeof this[name] !== "function" || this[name] === OCIFChunk.prototype[name]) {
            throw new ChunkError(`Child OCIF ${this.name} chunk must have a ${name} function`, this._ref);
        }
    }

    _validateChildFunctions() {
        if (!this.requiresData) return;

        this._validateChildFunction("read");
        this._validateChildFunction("encode");
        this._validateChildFunction("decode");
    }

    _lengthError() {
        throw new ChunkError(`OCIF ${this.name} chunk length mismatch`, this._ref);
    }

    _checksumError(checksum, expected) {
        throw new ChecksumError(`Invalid OCIF ${this.name} chunk checksum: ${checksum} !== ${expected}`, this._ref);
    }
}

export default OCIFChunk;
