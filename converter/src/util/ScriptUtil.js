import path from "path";
import { fileURLToPath } from "url";
import { parseArgs as parseNodeArgs } from "util";

import OCIFError from "../errors/OCIFError.js";

const helpArgs = Object.freeze(["-h", "--help"]),
    helpSpaces = " ".repeat(4);

let ScriptUtil = {
    helpArgs,
    helpSpaces,

    getDirname: metaURL => {
        return path.dirname(fileURLToPath(metaURL));
    },

    printHelp: (args, help) => {
        if (ScriptUtil.helpArgs.some(helpArg => args.includes(helpArg))) {
            console.log(help);
            process.exit(0);
        }
    },

    helpOption: (argument, explanation) => {
        return `  ${argument}${ScriptUtil.helpSpaces}${explanation}`;
    },

    formatHelp: text => {
        return text
            .trim()
            .split("\n")
            .map(line => line.replace(/^ {4}/, ""))
            .join("\n");
    },

    parseArgs: (args, options, usage) => {
        try {
            return parseNodeArgs({
                args,
                allowPositionals: true,
                options
            });
        } catch (err) {
            console.error("ERROR:", err.message, "\n");
            console.log(usage);

            process.exit(1);
        }
    },

    parseInteger: (value, name) => {
        if (!/^\d+$/.test(value)) {
            throw new OCIFError(`${name} must be an integer`);
        }

        return Number.parseInt(value, 10);
    }
};

ScriptUtil = Object.freeze(ScriptUtil);

export default ScriptUtil;
