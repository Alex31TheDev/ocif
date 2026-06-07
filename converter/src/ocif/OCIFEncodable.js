import OCIFParts from "../parts/OCIFParts.js";

class OCIFEncodable {
    constructor(data = null, options = {}) {
        this.options = options;
        this.requiresData = options.requiresData ?? true;

        this._data = null;
        this._parts = null;

        this._ref = null;

        this.data = data;
    }

    checkData() {
        const hasData = this.data != null;

        if (hasData !== this.requiresData) {
            this._invalidError("data");
        }

        return true;
    }

    checkParts() {
        const hasParts = this.parts != null;

        if (hasParts !== this.requiresData) {
            this._invalidError("parts");
        }

        return true;
    }

    get data() {
        return this._data;
    }

    set data(data) {
        if (data == null) {
            this._data = null;
            return;
        } else if (!this.requiresData) {
            this._invalidError("data");
        }

        this._data = data;
    }

    get parts() {
        return this._parts;
    }

    set parts(parts) {
        if (parts == null) {
            this._parts = null;
            return;
        } else if (!this.requiresData) {
            this._invalidError("parts");
        }

        this._parts = OCIFParts.from(parts);
    }

    static _errorClass = Error;

    static _getErrorLabel() {
        return "OCIF data";
    }

    _invalidError(msg) {
        const label = this.constructor._getErrorLabel(this);
        throw new this.constructor._errorClass(`Invalid ${label} ${msg}`, this._ref);
    }

    _setRef(buffer) {
        this._ref = buffer?.options?.ref ?? null;
    }
}

export default OCIFEncodable;
