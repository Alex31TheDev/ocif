import OCIFPart from "./OCIFPart.js";
import OCIFBuffer from "../ocif/OCIFBuffer.js";

function ensureParts(parts) {
    return parts.map(part => OCIFPart.from(part));
}

class OCIFParts extends Array {
    static get [Symbol.species]() {
        return OCIFParts;
    }

    static from(parts) {
        if (parts instanceof OCIFParts) {
            return parts;
        }

        const ensured = Array.from(parts, part => OCIFPart.from(part));
        Object.setPrototypeOf(ensured, OCIFParts.prototype);

        return ensured;
    }

    constructor(...parts) {
        if (parts.length === 1 && Number.isInteger(parts[0])) {
            super(parts[0]);
            return;
        }

        parts = ensureParts(parts);
        super(...parts);
    }

    get size() {
        return this.reduce((size, part) => size + part.size, 0);
    }

    get values() {
        return Array.from(this, ({ value }) => value);
    }

    concat(...parts) {
        let size = this.length,
            offset = 0;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            size += part instanceof Array ? part.length : 1;
        }

        const res = new OCIFParts(size);

        for (let i = 0; i < this.length; i++) {
            res[offset] = this[i];
            offset++;
        }

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];

            if (part instanceof OCIFParts) {
                for (let j = 0; j < part.length; j++) {
                    res[offset] = part[j];
                    offset++;
                }
            } else if (part instanceof Array) {
                for (let j = 0; j < part.length; j++) {
                    res[offset] = OCIFPart.from(part[j]);
                    offset++;
                }
            } else {
                res[offset] = OCIFPart.from(part);
                offset++;
            }
        }

        return res;
    }

    push(...parts) {
        parts = ensureParts(parts);
        return super.push(...parts);
    }

    unshift(...parts) {
        parts = ensureParts(parts);
        return super.unshift(...parts);
    }

    splice(start, deleteCount, ...parts) {
        parts = ensureParts(parts);
        return super.splice(start, deleteCount, ...parts);
    }

    fill(part, start, end) {
        part = OCIFPart.from(part);
        return super.fill(part, start, end);
    }

    toBuffer() {
        const buffer = new OCIFBuffer({
            size: this.size,
            tracking: false,
            ref: "OCIF parts"
        });

        for (const part of this) {
            buffer.write(part);
        }

        return buffer.finish("OCIF parts");
    }
}

export default OCIFParts;
