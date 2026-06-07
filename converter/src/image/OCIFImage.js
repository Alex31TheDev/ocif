import OCPalette from "../palette/OCPalette.js";

import OCIFFeatures from "./OCIFFeatures.js";
import OCIFFormat from "./OCIFFormat.js";

import BitField from "../util/BitField.js";

function createPalette(palette) {
    if (palette instanceof OCPalette) {
        return palette;
    }

    if (typeof palette === "undefined") {
        return new OCPalette();
    }

    return new OCPalette({
        size: palette.length,
        colors: palette
    });
}

class OCIFImage {
    constructor(data = {}) {
        this.bitField = new BitField({ value: data.flags ?? 0 });

        const compress = data.compress ?? this.bitField.has(OCIFFeatures.compressedData);
        this.bitField.set(OCIFFeatures.compressedData, compress);

        this.flags = this.bitField.value;
        this.tier = data.tier;
        this.depth = data.depth;
        if (typeof this.depth === "undefined" && typeof data.tier !== "undefined") {
            this.depth = data.tier.depth;
        }
        this.charsW = data.charsW;
        this.charsH = data.charsH;
        this.palette = createPalette(data.palette);
        this.buckets = data.buckets ?? [];
        this.data = data.data;
        this.compress = this.bitField.has(OCIFFeatures.compressedData);
    }

    get width() {
        return this.charsW * OCIFFormat.charWidth;
    }

    get height() {
        return this.charsH * OCIFFormat.charHeight;
    }
}

export default OCIFImage;
