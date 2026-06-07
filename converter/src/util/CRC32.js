import ChecksumError from "../errors/ChecksumError.js";

function generateTable() {
    const polynomial = 0xedb88320,
        table = new Int32Array(256);

    for (let i = 0; i < 256; i++) {
        let crc = i;

        for (let bit = 0; bit < 8; bit++) {
            if (crc & 1) {
                crc = polynomial ^ (crc >>> 1);
            } else {
                crc = crc >>> 1;
            }
        }

        table[i] = crc;
    }

    return table;
}

class CRC32 {
    static table = generateTable();

    constructor() {
        this.crc = 0 ^ -1;
    }

    get value() {
        return (this.crc ^ -1) >>> 0;
    }

    updateByte(byte) {
        if (typeof byte !== "number") {
            throw new ChecksumError("Byte has to be a number");
        }

        byte |= 0;

        const x = CRC32.table[(this.crc ^ byte) & 0xff];
        this.crc = (this.crc >>> 8) ^ x;

        return this.value;
    }

    calculate(bytes, start = 0, end) {
        if (typeof start !== "number") {
            throw new ChecksumError("Start index has to be a number");
        }

        if (start % 1 !== 0 || start < 0) {
            throw new ChecksumError("Invalid start position");
        }

        if (typeof end === "undefined") {
            end = bytes.length;
        } else if (typeof end !== "number") {
            throw new ChecksumError("End index has to be a number");
        }

        if (end % 1 !== 0 || end < 0) {
            throw new ChecksumError("Invalid end position");
        }

        for (let i = start; i < end; i++) {
            const byte = bytes[i] | 0,
                x = CRC32.table[(this.crc ^ byte) & 0xff];

            this.crc = (this.crc >>> 8) ^ x;
        }

        return this.value;
    }
}

export default CRC32;
