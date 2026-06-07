class BitField {
    constructor(data = {}) {
        this.value = data.value ?? 0;
    }

    has(flag) {
        return (this.value & flag) !== 0;
    }

    set(flag, enabled = true) {
        if (enabled === true) {
            this.value |= flag;
        } else {
            this.value &= ~flag;
        }

        return this;
    }
}

export default BitField;
