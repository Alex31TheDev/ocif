const OCIFDataTypes = Object.freeze({
    u8: Object.freeze({ id: 0, size: 1 }),
    u16BE: Object.freeze({ id: 1, size: 2 }),
    u32BE: Object.freeze({ id: 2, size: 4 }),
    ASCII: Object.freeze({ id: 3 }),
    buffer: Object.freeze({ id: 4 })
});

export default OCIFDataTypes;
