import * as culori from "culori";

const oklabDistance = culori.differenceEuclidean("oklab");

class OCColor {
    static clamp(value) {
        return Math.max(0, Math.min(255, Math.round(value || 0)));
    }

    static from(color) {
        return color instanceof OCColor ? color : new OCColor(color);
    }

    static fromOklab(l, a, b) {
        const rgb = culori.convertOklabToRgb({
            mode: "oklab",
            l,
            a,
            b
        });

        return new OCColor({
            r: rgb.r * 255,
            g: rgb.g * 255,
            b: rgb.b * 255
        });
    }

    constructor(data = {}) {
        this.r = OCColor.clamp(data.r);
        this.g = OCColor.clamp(data.g);
        this.b = OCColor.clamp(data.b);

        this.lab = culori.convertRgbToOklab(this._libColor);
    }

    distance(other) {
        return oklabDistance(this.lab, other.lab);
    }

    get _libColor() {
        return {
            mode: "rgb",
            r: this.r / 255,
            g: this.g / 255,
            b: this.b / 255
        };
    }
}

export default OCColor;
