import OCIFDataTypes from "../ocif/OCIFDataTypes.js";

class OCIFPart {
    static from(part) {
        if (part instanceof OCIFPart) {
            return part;
        }

        const { type, value } = part;
        return new OCIFPart(type, value);
    }

    static u8(value) {
        return new this(OCIFDataTypes.u8, value);
    }

    static u16BE(value) {
        return new this(OCIFDataTypes.u16BE, value);
    }

    static u32BE(value) {
        return new this(OCIFDataTypes.u32BE, value);
    }

    static ASCII(value) {
        return new this(OCIFDataTypes.ASCII, value);
    }

    static buffer(value) {
        return new this(OCIFDataTypes.buffer, value);
    }

    constructor(type, value) {
        this.type = type;
        this.value = value;
    }

    get size() {
        return this.type.size ?? this.value?.length ?? 0;
    }
}

export default OCIFPart;
