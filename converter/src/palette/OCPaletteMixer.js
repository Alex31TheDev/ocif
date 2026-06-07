import * as culori from "culori";

import OCColor from "./OCColor.js";
import OCPalette from "./OCPalette.js";

import OCIFFormat from "../image/OCIFFormat.js";

function average(points) {
    if (points.length === 0) {
        return new OCColor({ r: 0, g: 0, b: 0 });
    }

    const lab = culori.average(
        points.map(point => point.lab ?? point),
        "oklab"
    );

    return OCColor.fromOklab(lab.l, lab.a, lab.b);
}

class OCPaletteMixer {
    constructor(options = {}) {
        this.options = options;

        this._defaultPalette = options.defaultPalette;
        this._customPalette = options.customPalette;
    }

    createFull() {
        const palette = new OCPalette({
            size: this._defaultPalette.size,
            colors: this._defaultPalette.colors
        });

        for (let i = 0; i < OCIFFormat.customColorCount; i++) {
            palette.colors[i] = this._customPalette.colors[i];
        }

        return palette;
    }

    createActive(tier) {
        if (tier === 2) {
            return new OCPalette({
                size: this._customPalette.size,
                colors: this._customPalette.colors
            });
        }

        return this.createFull();
    }

    optimize(cells, options, bestCell, cellAssignments) {
        for (let pass = 0; pass < options.palettePasses; pass++) {
            const activePalette = this.createActive(options.tier);

            const groups = Array.from({ length: this._customPalette.colors.length }, () => []),
                empties = new Set(this._customPalette.colors.map((_, i) => i));

            let totalError = 0,
                worstCell = null,
                worstError = -1;

            for (const cell of cells) {
                const encoded = bestCell(cell, activePalette),
                    assignments = cellAssignments(cell, encoded, activePalette);

                let cellError = 0;

                for (let i = 0; i < cell.length; i++) {
                    const index = assignments[i],
                        error = cell[i].distance(activePalette.colors[index]);

                    cellError += error;

                    if (index < OCIFFormat.customColorCount) {
                        groups[index].push(cell[i]);
                        empties.delete(index);
                    }
                }

                totalError += cellError;

                if (cellError > worstError) {
                    worstError = cellError;
                    worstCell = cell;
                }
            }

            let changed = false;

            for (let i = 0; i < this._customPalette.colors.length; i++) {
                let next = null;

                if (groups[i].length > 0) {
                    next = average(groups[i]);
                } else if (empties.has(i) && worstCell) {
                    next = average(worstCell);
                } else {
                    next = this._customPalette.colors[i];
                }

                if (next.distance(this._customPalette.colors[i]) > 0.00000001) {
                    this._customPalette.colors[i] = next;
                    changed = true;
                }
            }

            if (!changed || totalError === 0) break;
        }
    }
}

export default OCPaletteMixer;
