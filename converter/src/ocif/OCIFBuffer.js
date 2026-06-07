import OCIFPart from "../parts/OCIFPart.js";

import OCIFDataTypes from "./OCIFDataTypes.js";

import DecodeError from "../errors/DecodeError.js";
import EncodeError from "../errors/EncodeError.js";

class OCIFBuffer {
    constructor(options = {}) {
        this.options = options;

        this.tracking = options.tracking ?? true;

        this._buf = options.buffer ?? this._createBuffer(options.size);
        this._offset = 0;

        this._ref = options.ref;
    }

    get size() {
        return this._buf.length;
    }

    get offset() {
        return this._offset;
    }

    get hasData() {
        return this._offset < this._buf.length;
    }

    get buffer() {
        return this._buf;
    }

    transaction(callback) {
        return this._commitTransaction(callback);
    }

    read(type, size) {
        let value;

        switch (type) {
            case OCIFDataTypes.u8:
                this._need(type.size);
                value = this._buf.readUInt8(this._offset);
                break;
            case OCIFDataTypes.u16BE:
                this._need(type.size);
                value = this._buf.readUInt16BE(this._offset);
                break;
            case OCIFDataTypes.u32BE:
                this._need(type.size);
                value = this._buf.readUInt32BE(this._offset);
                break;
            case OCIFDataTypes.ASCII:
                value = this._readRawBuffer(size).toString("ascii");
                return OCIFPart.ASCII(value);
            case OCIFDataTypes.buffer:
                value = this._readRawBuffer(size);
                return OCIFPart.buffer(value);
            default:
                throw new DecodeError("Invalid OCIF data type", this._ref);
        }

        this._offset += type.size;
        return new OCIFPart(type, value);
    }

    write(part) {
        const { size, type, value } = part;

        this._needWrite(size);
        this._recordBytes(this._offset, size);

        switch (type) {
            case OCIFDataTypes.u8:
                this._buf.writeUInt8(value, this._offset);
                break;
            case OCIFDataTypes.u16BE:
                this._buf.writeUInt16BE(value, this._offset);
                break;
            case OCIFDataTypes.u32BE:
                this._buf.writeUInt32BE(value, this._offset);
                break;
            case OCIFDataTypes.ASCII:
                this._buf.write(value, this._offset, value.length, "ascii");
                break;
            case OCIFDataTypes.buffer:
                value.copy(this._buf, this._offset);
                break;
            default:
                throw new EncodeError("Invalid OCIF data type", this._ref);
        }

        this._offset += size;
    }

    finish(label) {
        if (this._offset !== this.size) {
            throw new EncodeError(`${label} size mismatch: wrote ${this._offset} bytes, expected ${this.size}`, label);
        }

        return this._buf;
    }

    _need(size) {
        if (this._offset + size > this._buf.length) {
            throw new DecodeError("Unexpected end of OCIF data", this._ref);
        }
    }

    _needWrite(size) {
        if (this._offset + size > this._buf.length) {
            throw new EncodeError("Unexpected end of OCIF buffer", this._ref);
        }
    }

    _createBuffer(size) {
        if (this.tracking) {
            return Buffer.alloc(size);
        }

        return Buffer.allocUnsafe(size);
    }

    _readRawBuffer(size) {
        this._need(size);

        const read = this._buf.subarray(this._offset, this._offset + size);
        this._offset += size;

        return read;
    }

    _startTransaction() {
        this._transaction = {
            offset: this._offset,
            bytes: new Map()
        };

        return this._transaction;
    }

    _finishTransaction() {
        delete this._transaction;
    }

    _rollbackTransaction(transaction) {
        this._offset = transaction.offset;

        for (const [byteIndex, byte] of transaction.bytes) {
            this._buf[byteIndex] = byte;
        }

        delete this._transaction;
    }

    _commitTransaction(callback) {
        const transaction = this._startTransaction();

        try {
            const result = callback(this);

            this._finishTransaction();
            return result;
        } catch (err) {
            this._rollbackTransaction(transaction);
            throw err;
        }
    }

    _recordByte(byteIndex) {
        const transaction = this._transaction;

        if (typeof transaction !== "undefined" && !transaction.bytes.has(byteIndex)) {
            transaction.bytes.set(byteIndex, this._buf[byteIndex]);
        }
    }

    _recordBytes(offset, size) {
        if (!this.tracking) return;

        for (let i = 0; i < size; i++) {
            this._recordByte(offset + i);
        }
    }
}

export default OCIFBuffer;
