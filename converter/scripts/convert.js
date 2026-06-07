import path from "path";
import { pathToFileURL } from "url";

import OCIFConverter from "../src/converter/OCIFConverter.js";
import FitModes from "../src/converter/FitModes.js";
import OCTiers from "../src/oc/OCTiers.js";
import ScriptUtil from "../src/util/ScriptUtil.js";
import OCIFError from "../src/errors/OCIFError.js";

const __dirname = ScriptUtil.getDirname(import.meta.url);

const outputDir = path.resolve(__dirname, "..", "output");

const supportedTiers = Object.keys(OCTiers).map(Number);
const modes = new Map(supportedTiers.map(tier => [`oc-tier${tier}`, tier]));
const modeNames = [...modes.keys()];
const fitModes = Object.values(FitModes);

const candidateMin = 1,
    candidateMax = 32,
    palettePassMin = 0,
    palettePassMax = 128;

const defaultTier = supportedTiers[supportedTiers.length - 1],
    defaultFit = FitModes.contain,
    defaultBackground = "#000000",
    defaultCandidates = candidateMax,
    defaultPalettePasses = 24,
    defaultCompress = false;

const defaultMode = `oc-tier${defaultTier}`,
    defaultChars = `${OCTiers[defaultTier].charsW}x${OCTiers[defaultTier].charsH}`;

const argOptions = {
    background: { type: "string" },
    candidates: { type: "string" },
    chars: { type: "string" },
    compress: { type: "boolean" },
    fit: { type: "string" },
    height: { type: "string", short: "H" },
    help: { type: "boolean", short: "h" },
    mode: { type: "string", short: "m" },
    output: { type: "string", short: "o" },
    "palette-passes": { type: "string" },
    tier: { type: "string" },
    width: { type: "string", short: "W" }
};

const usage = `Usage: node ./scripts/convert.js inputPath [outputPath = ${path.basename(outputDir)}/inputName.ocif] [options]`,
    help = ScriptUtil.formatHelp(`
    ${usage}

    Options:
    ${ScriptUtil.helpOption("-m, --mode <mode>", `Target mode, ${modeNames.join(" or ")}, default ${defaultMode}`)}
    ${ScriptUtil.helpOption(`--tier <${supportedTiers.join("|")}>`, `Target OC graphics tier, default ${defaultTier}`)}
    ${ScriptUtil.helpOption("--fit <mode>", `Resize fit, ${fitModes.join(", ")}, default ${defaultFit}`)}
    ${ScriptUtil.helpOption("--background <color>", `Padding color, default ${defaultBackground}`)}
    ${ScriptUtil.helpOption("--chars <WxH>", `Character resolution, default ${defaultChars}`)}
    ${ScriptUtil.helpOption("--candidates <n>", `Palette candidates, ${candidateMin}-${candidateMax}, default ${defaultCandidates}`)}
    ${ScriptUtil.helpOption("--palette-passes <n>", `Palette optimization passes, ${palettePassMin}-${palettePassMax}, default ${defaultPalettePasses}`)}
    ${ScriptUtil.helpOption("--compress", "Compress DAT chunks with zlib")}
    ${ScriptUtil.helpOption("-o, --output <file>", "Output OCIF path")}
    ${ScriptUtil.helpOption(ScriptUtil.helpArgs.join(", "), "Show help")}
`);

function nowLabel() {
    return new Date().toISOString();
}

function formatDuration(ms) {
    if (ms < 1000) {
        return `${ms}ms`;
    }

    return `${(ms / 1000).toFixed(2)}s`;
}

function resolveConvertOptions(inputPath, outputPath, values = {}) {
    const inputExt = path.extname(inputPath),
        inputName = path.basename(inputPath, inputExt);

    outputPath = path.resolve(outputPath ?? path.join(outputDir, `${inputName}.ocif`));

    const fit = values.fit ?? defaultFit,
        background = values.background ?? defaultBackground,
        compress = values.compress ?? defaultCompress;

    const candidates = values.candidates ? ScriptUtil.parseInteger(values.candidates, "--candidates") : defaultCandidates,
        palettePasses = values["palette-passes"]
            ? ScriptUtil.parseInteger(values["palette-passes"], "--palette-passes")
            : defaultPalettePasses;

    let tier = defaultTier,
        charsW,
        charsH;

    if (values.mode) {
        const mode = values.mode.toLowerCase();
        const modeTier = modes.get(mode);

        if (typeof modeTier === "undefined") {
            throw new OCIFError(`--mode must be ${modeNames.join(" or ")}`);
        }

        tier = modeTier;
    }

    if (values.tier) {
        tier = ScriptUtil.parseInteger(values.tier, "--tier");
    }

    if (values.chars) {
        const charsMatch = /^(\d+)x(\d+)$/i.exec(values.chars);

        if (!charsMatch) {
            throw new OCIFError("--chars must use WxH, for example 160x50");
        }

        charsW = Number(charsMatch[1]);
        charsH = Number(charsMatch[2]);
    }

    if (values.width) {
        charsW = ScriptUtil.parseInteger(values.width, "--width");
    }

    if (values.height) {
        charsH = ScriptUtil.parseInteger(values.height, "--height");
    }

    if (!OCTiers[tier]) {
        throw new OCIFError(`Only OC tier ${supportedTiers.join(" and ")} are supported by this OCIF encoder`);
    }

    if (!fitModes.includes(fit)) {
        throw new OCIFError(`Unsupported fit mode: ${fit}`);
    }

    if (!Number.isInteger(candidates) || candidates < candidateMin || candidates > candidateMax) {
        throw new OCIFError(`--candidates must be an integer from ${candidateMin} to ${candidateMax}`);
    }

    if (!Number.isInteger(palettePasses) || palettePasses < palettePassMin || palettePasses > palettePassMax) {
        throw new OCIFError(`--palette-passes must be an integer from ${palettePassMin} to ${palettePassMax}`);
    }

    return {
        inputPath,
        outputPath,

        tier,
        fit,
        background,
        compress,
        candidates,
        palettePasses,
        charsW,
        charsH
    };
}

function parseArgs(args = process.argv.slice(2)) {
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

    return resolveConvertOptions(parsed.positionals[0], parsed.values.output ?? parsed.positionals[1], parsed.values);
}

async function convertImage(options, logOptions = {}) {
    const logger = logOptions.logger ?? console.log,
        prefix = logOptions.prefix ?? "",
        log = logOptions.log ?? true,
        startedAt = Date.now();

    if (log) {
        logger(`${prefix}Started: ${options.inputPath} -> ${options.outputPath} at ${nowLabel()}`);
    }

    const image = await OCIFConverter.convert(options),
        elapsed = Date.now() - startedAt;

    if (log) {
        logger(`${prefix}Finished: ${options.outputPath} at ${nowLabel()} (${formatDuration(elapsed)})`);
    }

    return {
        image,
        elapsed,
        inputPath: options.inputPath,
        outputPath: options.outputPath
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
        const result = await convertImage(args),
            image = result.image;

        console.log(`Written: ${args.outputPath}`);
        console.log(
            `OC canvas: ${image.charsW}x${image.charsH} chars, ${image.width}x${image.height} source pixels, ${image.depth} bpp`
        );
    } catch (err) {
        console.error(`ERROR: Occured while converting image:`);
        console.error(err);

        process.exit(1);
    }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
    main();
}

export { convertImage, formatDuration, parseArgs, resolveConvertOptions };
export default convertImage;
