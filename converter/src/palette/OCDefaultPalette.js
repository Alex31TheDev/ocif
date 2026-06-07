import OCPalette from "./OCPalette.js";

import OCColorLevels from "./OCColorLevels.js";

function createDefaultPalette() {
    const palette = new OCPalette({ size: 256 });

    for (let i = 0; i < 16; i++) {
        const v = i * 17;
        palette.addColor({ r: v, g: v, b: v });
    }

    for (let i = 0; i < 240; i++) {
        palette.addColor({
            r: OCColorLevels.red[Math.floor(i / 40) % 6],
            g: OCColorLevels.green[Math.floor(i / 5) % 8],
            b: OCColorLevels.blue[i % 5]
        });
    }

    return palette;
}

let palette = createDefaultPalette();
Object.freeze(palette.colors);
palette = Object.freeze(palette);

export default palette;
