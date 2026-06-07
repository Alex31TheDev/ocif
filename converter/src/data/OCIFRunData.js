import OCIFPayloadData from "./OCIFPayloadData.js";

import OCIFPart from "../parts/OCIFPart.js";
import OCIFParts from "../parts/OCIFParts.js";

class OCIFRunData extends OCIFPayloadData {
    constructor(data, options = {}) {
        super(data, options);

        this.x = data.x;
        this.y = data.y;
        this.cells = data.cells;
        this.text = data.text;
    }

    encode() {
        const text = Buffer.from(this.text, "utf8");

        this._parts = OCIFParts.from([
            OCIFPart.u8(this.x),
            OCIFPart.u8(this.y),
            OCIFPart.u8(this.cells),
            OCIFPart.buffer(text)
        ]);

        return this;
    }
}

export default OCIFRunData;
