import path from "path";

import FileUtil from "../src/util/FileUtil.js";
import ScriptUtil from "../src/util/ScriptUtil.js";
import OCIFError from "../src/errors/OCIFError.js";

const __dirname = ScriptUtil.getDirname(import.meta.url);

const repoDir = path.resolve(__dirname, "..", ".."),
    converterDir = path.resolve(__dirname, "..");

const viewerDir = path.join(repoDir, "viewers"),
    outputDir = path.join(converterDir, "output");

const runtimeFiles = [
    ["ocifview.lua", path.join(viewerDir, "ocifview.lua")],
    ["slideshow.lua", path.join(viewerDir, "slideshow.lua")]
];

const argOptions = {
    help: { type: "boolean", short: "h" }
};

const usage = "Usage: node ./scripts/copy.js rootPath",
    help = ScriptUtil.formatHelp(`
    ${usage}

    Copies viewer scripts to rootPath and OCIF files to rootPath/img

    Options:
    ${ScriptUtil.helpOption(ScriptUtil.helpArgs.join(", "), "Show help")}
`);

function parseArgs() {
    const args = process.argv.slice(2);
    ScriptUtil.printHelp(args, help);

    const parsed = ScriptUtil.parseArgs(args, argOptions, usage);

    if (parsed.positionals.length !== 1) {
        console.error("ERROR: rootPath is required.", "\n");
        console.log(usage);

        process.exit(1);
    }

    return {
        rootPath: path.resolve(parsed.positionals[0])
    };
}

async function prepareTarget(rootPath) {
    const imagePath = path.join(rootPath, "img");

    await FileUtil.ensureDir(imagePath);
    const clearedRoot = await FileUtil.clearOCIFFiles(rootPath),
        clearedImages = await FileUtil.clearOCIFFiles(imagePath);

    return {
        imagePath,
        clearedRoot,
        clearedImages
    };
}

function warnFailedCleanup(result, rootPath) {
    if (!result.clearedRoot) {
        console.warn(`WARN: Some old OCIF files could not be removed from ${rootPath}`);
    }

    if (!result.clearedImages) {
        console.warn(`WARN: Some old OCIF files could not be removed from ${result.imagePath}`);
    }
}

async function copyRuntimeFiles(rootPath) {
    for (const [name, filePath] of runtimeFiles) {
        const outputPath = path.join(rootPath, name);

        await FileUtil.copyFile(filePath, outputPath);
        console.log(`Written: ${outputPath}`);
    }
}

async function copyOCIFFiles(files, imagePath) {
    let count = 0;

    for (const filePath of files) {
        const outputPath = path.join(imagePath, path.basename(filePath));

        await FileUtil.copyFile(filePath, outputPath);
        count++;
    }

    return count;
}

async function main() {
    const args = parseArgs();

    let OCIFFiles, prepared;

    try {
        OCIFFiles = await FileUtil.getOCIFFiles(outputDir);
        if (OCIFFiles.length < 1) {
            throw new OCIFError(`No .ocif files found in ${outputDir}`);
        }

        prepared = await prepareTarget(args.rootPath);
        warnFailedCleanup(prepared, args.rootPath);
    } catch (err) {
        console.error("ERROR: Occured while preparing copy target:");
        console.error(err);

        process.exit(1);
    }

    try {
        await copyRuntimeFiles(args.rootPath);
    } catch (err) {
        console.error("ERROR: Occured while copying runtime files:");
        console.error(err);

        process.exit(1);
    }

    try {
        const OCIFCount = await copyOCIFFiles(OCIFFiles, prepared.imagePath);
        console.log(`Copied ${OCIFCount} OCIF files to ${prepared.imagePath}`);
    } catch (err) {
        console.error("ERROR: Occured while copying OCIF files:");
        console.error(err);

        process.exit(1);
    }
}

main();
