import OCIFEncodable from "./OCIFEncodable.js";

import OCIFPart from "../parts/OCIFPart.js";

import OCIFFormat from "../image/OCIFFormat.js";
import OCIFDataTypes from "./OCIFDataTypes.js";

import DecodeError from "../errors/DecodeError.js";

class OCIFSignature extends OCIFEncodable {
    constructor(data = {}) {
        super({
            magic: data.magic ?? OCIFFormat.magic,
            version: data.version ?? OCIFFormat.version
        });
    }

    get size() {
        return OCIFFormat.magic.length + OCIFDataTypes.u8.size;
    }

    read(buffer) {
        buffer.transaction(() => {
            this._setRef(buffer);

            this.data = null;
            this.parts = [buffer.read(OCIFDataTypes.ASCII, OCIFFormat.magic.length), buffer.read(OCIFDataTypes.u8)];
        });

        return this;
    }

    write(buffer) {
        this.checkParts();

        buffer.transaction(() => {
            for (let i = 0; i < this.parts.length; i++) {
                buffer.write(this.parts[i]);
            }
        });

        return this;
    }

    encode() {
        this.checkData();

        const parts = [OCIFPart.ASCII(this.data.magic), OCIFPart.u8(this.data.version)];

        this.data = null;
        this.parts = parts;

        return this;
    }

    decode() {
        this.checkParts();

        const [magic, version] = this.parts.values;

        if (magic !== OCIFFormat.magic) {
            throw new DecodeError("Invalid OCIF signature", this._ref);
        }

        if (version !== OCIFFormat.version) {
            throw new DecodeError(`Unsupported OCIF version: ${version}`, this._ref);
        }

        const data = { magic, version };

        this.parts = null;
        this.data = data;

        return this;
    }

    static _errorClass = DecodeError;

    static _getErrorLabel() {
        return "OCIF signature";
    }
}

export default OCIFSignature;
