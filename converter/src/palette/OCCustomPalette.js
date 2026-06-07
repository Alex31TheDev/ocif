import * as iq from "image-q";

import OCPalette from "./OCPalette.js";

import OCIFFormat from "../image/OCIFFormat.js";

function getRawColors(raw, width, height) {
    const image = iq.utils.PointContainer.fromUint8Array(raw, width, height);

    const palette = iq.buildPaletteSync([image], {
        colors: OCIFFormat.customColorCount,
        colorDistanceFormula: "ciede2000",
        paletteQuantization: "wuquant"
    });

    return palette.getPointContainer().getPointArray();
}

class OCCustomPalette extends OCPalette {
    constructor(raw, width, height) {
        super({
            size: OCIFFormat.customColorCount
        });

        const colors = getRawColors(raw, width, height);

        for (const point of colors.slice(0, OCIFFormat.customColorCount)) {
            this.addColor({ r: point.r, g: point.g, b: point.b });
        }

        for (let i = colors.length; i < OCIFFormat.customColorCount; i++) {
            this.addColor({ r: 0, g: 0, b: 0 });
        }
    }
}

export default OCCustomPalette;
