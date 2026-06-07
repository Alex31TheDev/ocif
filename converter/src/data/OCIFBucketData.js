import OCIFPayloadData from "./OCIFPayloadData.js";
import OCIFRunData from "./OCIFRunData.js";

import OCIFPart from "../parts/OCIFPart.js";
import OCIFParts from "../parts/OCIFParts.js";

class OCIFBucketData extends OCIFPayloadData {
    constructor(data, options = {}) {
        super(data, options);

        this.bg = data.bg;
        this.fg = data.fg;
        this.runs = data.runs;
    }

    encode() {
        const children = new Array(this.runs.length);

        for (let i = 0; i < this.runs.length; i++) {
            children[i] = new OCIFRunData(this.runs[i], this.options).encode();
        }

        this._children = children;
        this._parts = OCIFParts.from([OCIFPart.u8(this.bg), OCIFPart.u8(this.fg), OCIFPart.u16BE(children.length)]);

        return this;
    }
}

export default OCIFBucketData;
