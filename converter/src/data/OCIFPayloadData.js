import OCIFParts from "../parts/OCIFParts.js";

class OCIFPayloadData {
    constructor(data = null, options = {}) {
        void data;
        this.options = options;

        this._children = [];
        this._parts = OCIFParts.from([]);
    }

    get length() {
        return this._getPartsLength();
    }

    get parts() {
        const parts = new OCIFParts(this._getPartCount());
        this._writeParts(parts, 0);

        return parts;
    }

    _getPartCount() {
        let count = this._parts.length;

        for (let i = 0; i < this._children.length; i++) {
            count += this._children[i]._getPartCount();
        }

        return count;
    }

    _getPartsLength() {
        let length = this._parts.size;

        for (let i = 0; i < this._children.length; i++) {
            length += this._children[i]._getPartsLength();
        }

        return length;
    }

    _writeParts(parts, offset) {
        for (let i = 0; i < this._parts.length; i++) {
            parts[offset] = this._parts[i];
            offset++;
        }

        for (let i = 0; i < this._children.length; i++) {
            offset = this._children[i]._writeParts(parts, offset);
        }

        return offset;
    }
}

export default OCIFPayloadData;
