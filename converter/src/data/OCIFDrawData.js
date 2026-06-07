import zlib from "zlib";

import OCIFPayloadData from "./OCIFPayloadData.js";
import OCIFBucketData from "./OCIFBucketData.js";

import OCIFPart from "../parts/OCIFPart.js";
import OCIFParts from "../parts/OCIFParts.js";

class OCIFDrawData extends OCIFPayloadData {
    static decode(data, compressed = false) {
        if (compressed) {
            return zlib.inflateSync(data);
        }

        return data;
    }

    constructor(data, options = {}) {
        super(data, options);

        this.compress = data.compress ?? false;
        this.buckets = data.buckets;
    }

    encode() {
        const children = new Array(this.buckets.length);

        for (let i = 0; i < this.buckets.length; i++) {
            children[i] = new OCIFBucketData(this.buckets[i], this.options).encode();
        }

        this._children = children;
        this._parts = OCIFParts.from([OCIFPart.u16BE(children.length)]);

        return this;
    }

    get parts() {
        const parts = super.parts;

        if (this.compress) {
            return OCIFParts.from([OCIFPart.buffer(zlib.deflateSync(parts.toBuffer()))]);
        }

        return parts;
    }
}

export default OCIFDrawData;
