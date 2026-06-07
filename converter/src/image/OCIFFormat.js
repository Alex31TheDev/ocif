let OCIFFormat = {
    magic: "OCIF",
    version: 1,
    dataChunkSize: 65536,
    customColorCount: 16,
    maxPaletteColorCount: 256,
    chunkNameSize: 3,
    charWidth: 2,
    charHeight: 4
};

{
    OCIFFormat.chunkNameRegex = new RegExp(`^[A-Z]{${OCIFFormat.chunkNameSize}}$`);
}

OCIFFormat = Object.freeze(OCIFFormat);
export default OCIFFormat;
