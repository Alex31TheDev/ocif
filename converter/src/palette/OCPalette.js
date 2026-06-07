import OCColor from "./OCColor.js";

import OCIFError from "../errors/OCIFError.js";

class OCPalette {
    constructor(data = {}) {
        this._size = data.size ?? null;
        this._offset = 0;

        this.colors = this._size === null ? [] : Array(this._size);

        if (Array.isArray(data.colors)) {
            data.colors.forEach(color => this.addColor(color));
        }
    }

    get size() {
        return this._size ?? this.colors.length;
    }

    addColor(color) {
        if (this._size === null) return this.pushColor(color);

        if (this._offset >= this._size) {
            throw new OCIFError(`Palette cannot contain more than ${this._size} colors`);
        }

        color = OCColor.from(color);

        this.colors[this._offset] = color;
        this._offset++;

        return this;
    }

    pushColor(color) {
        if (this._size !== null) {
            throw new OCIFError("Cannot push color into a preallocated palette");
        }

        color = OCColor.from(color);

        this.colors.push(color);
        return this;
    }
}

export default OCPalette;
