import path from "path";

import OCIFDecoder from "../src/ocif/OCIFDecoder.js";
import OCIFRenderer from "../src/render/OCIFRenderer.js";
import ScriptUtil from "../src/util/ScriptUtil.js";
import OCIFError from "../src/errors/OCIFError.js";

const __dirname = ScriptUtil.getDirname(import.meta.url);

const previewDir = path.resolve(__dirname, "..", "preview");

const defaultScale = 1;

const argOptions = {
    help: { type: "boolean", short: "h" },
    output: { type: "string", short: "o" },
    scale: { type: "string", short: "s" }
};

const usage = `Usage: node ./scripts/preview.js input.ocif [outputPath = preview/inputName.png] [options]`,
    help = ScriptUtil.formatHelp(`
    ${usage}

    Renders an OCIF file to a PNG preview using the stored draw data

    Options:
    ${ScriptUtil.helpOption("-s, --scale <n>", `Integer output scale, default ${defaultScale}`)}
    ${ScriptUtil.helpOption("-o, --output <file>", "Output PNG path")}
    ${ScriptUtil.helpOption(ScriptUtil.helpArgs.join(", "), "Show help")}
`);

function parseArgs() {
    const args = process.argv.slice(2);
    ScriptUtil.printHelp(args, help);

    const parsed = ScriptUtil.parseArgs(args, argOptions, usage);

    if (parsed.positionals.length < 1) {
        console.log(usage);
        process.exit(0);
    }

    if (parsed.positionals.length > 2) {
        console.error("ERROR: Too many positional arguments provided.", "\n");
        console.log(usage);

        process.exit(1);
    }

    const inputPath = path.resolve(parsed.positionals[0]),
        inputName = path.basename(inputPath, path.extname(inputPath));

    const outputPath = path.resolve(
            parsed.values.output ?? parsed.positionals[1] ?? path.join(previewDir, `${inputName}.png`)
        ),
        scale = parsed.values.scale ? ScriptUtil.parseInteger(parsed.values.scale, "--scale") : defaultScale;

    if (scale < 1) {
        throw new OCIFError("--scale must be at least 1");
    }

    return {
        inputPath,
        outputPath,
        scale
    };
}

async function main() {
    let args;

    try {
        args = parseArgs();
    } catch (err) {
        console.error("ERROR:", err.message, "\n");
        console.log(usage);

        process.exit(1);
    }

    try {
        await OCIFRenderer.writePNG(args.outputPath, await OCIFDecoder.decodeFile(args.inputPath), args.scale);
        console.log(`Written: ${args.outputPath}`);
    } catch (err) {
        console.error("ERROR: Occured while rendering preview:");
        console.error(err);

        process.exit(1);
    }
}

main();
