import OCIFImage from "../image/OCIFImage.js";
import OCIFChunkReader from "../chunks/OCIFChunkReader.js";
import OCIFBuffer from "./OCIFBuffer.js";
import OCIFDrawData from "../data/OCIFDrawData.js";
import OCIFSignature from "./OCIFSignature.js";

import OCIFFeatures from "../image/OCIFFeatures.js";
import OCIFChunkNames from "../chunks/OCIFChunkNames.js";

import BitField from "../util/BitField.js";
import FileUtil from "../util/FileUtil.js";

import DecodeError from "../errors/DecodeError.js";

function concatData(dat) {
    return Buffer.concat(dat);
}

function decodeData(header, dat) {
    const data = concatData(dat),
        bitField = new BitField({ value: header.flags });

    return OCIFDrawData.decode(data, bitField.has(OCIFFeatures.compressedData));
}

function createImage(header, palette, dat) {
    return new OCIFImage({
        ...header,
        palette,
        data: decodeData(header, dat)
    });
}

class OCIFDecoder {
    static async decodeFile(filePath) {
        const buffer = new OCIFBuffer({
            buffer: await FileUtil.readFile(filePath),
            ref: filePath
        });
        const reader = new OCIFChunkReader(buffer);

        new OCIFSignature().read(buffer).decode();

        let header = null,
            palette = null;
        const dat = [];

        while (buffer.hasData) {
            const chunk = reader.read();

            if (chunk.name === OCIFChunkNames.header) {
                header = chunk.data;
            } else if (chunk.name === OCIFChunkNames.palette) {
                palette = chunk.data;
            } else if (chunk.name === OCIFChunkNames.data) {
                dat.push(chunk.data);
            } else if (chunk.name === OCIFChunkNames.end) {
                break;
            }
        }

        if (header === null) {
            throw new DecodeError("Missing OCIF HDR chunk", filePath);
        } else if (palette === null) {
            throw new DecodeError("Missing OCIF PAL chunk", filePath);
        } else if (dat.length < 1) {
            throw new DecodeError("Missing OCIF DAT chunk", filePath);
        }

        return createImage(header, palette, dat);
    }
}

export default OCIFDecoder;
