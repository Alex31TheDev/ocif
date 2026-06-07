import os from "os";
import path from "path";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";

import FileUtil from "../src/util/FileUtil.js";
import ScriptUtil from "../src/util/ScriptUtil.js";
import OCIFError from "../src/errors/OCIFError.js";
import convertImage, { formatDuration, resolveConvertOptions } from "./convert.js";

const __dirname = ScriptUtil.getDirname(import.meta.url);

const converterDir = path.resolve(__dirname, ".."),
    outputDir = path.join(converterDir, "output");

const defaultDigits = 3,
    defaultOutputName = path.basename(outputDir);

const argOptions = {
    background: { type: "string" },
    candidates: { type: "string" },
    chars: { type: "string" },
    compress: { type: "boolean" },
    digits: { type: "string" },
    fit: { type: "string" },
    height: { type: "string", short: "H" },
    help: { type: "boolean", short: "h" },
    mode: { type: "string", short: "m" },
    output: { type: "string", short: "o" },
    "palette-passes": { type: "string" },
    tier: { type: "string" },
    width: { type: "string", short: "W" },
    workers: { type: "boolean", short: "w" }
};

const usage = `Usage: node ./scripts/batch.js inputFolder [outputFolder = ${defaultOutputName}/inputFolderName] [options]`,
    help = ScriptUtil.formatHelp(`
    ${usage}

    Converts every supported image in inputFolder in numeric filename order

    Options:
    ${ScriptUtil.helpOption("-m, --mode <mode>", "Forwarded to convert.js")}
    ${ScriptUtil.helpOption("--tier <2|3>", "Forwarded to convert.js")}
    ${ScriptUtil.helpOption("--fit <mode>", "Forwarded to convert.js")}
    ${ScriptUtil.helpOption("--background <color>", "Forwarded to convert.js")}
    ${ScriptUtil.helpOption("--chars <WxH>", "Forwarded to convert.js")}
    ${ScriptUtil.helpOption("--candidates <n>", "Forwarded to convert.js")}
    ${ScriptUtil.helpOption("--palette-passes <n>", "Forwarded to convert.js")}
    ${ScriptUtil.helpOption("--compress", "Forwarded to convert.js")}
    ${ScriptUtil.helpOption("--digits <n>", `Number prefix width, default ${defaultDigits}`)}
    ${ScriptUtil.helpOption("-o, --output <folder>", "Output folder")}
    ${ScriptUtil.helpOption("-w, --workers [n]", "Enable parallel workers (uses all CPU cores if n is omitted)")}
    ${ScriptUtil.helpOption(ScriptUtil.helpArgs.join(", "), "Show help")}
`);

if (!isMainThread) {
    const { filePath, outputPath, values, label } = workerData;

    try {
        const options = resolveConvertOptions(filePath, outputPath, values);
        await convertImage(options, { prefix: label });
        parentPort.postMessage({ ok: true });
    } catch (err) {
        parentPort.postMessage({ ok: false, error: err.message ?? String(err) });
    }
}

function parseWorkersCount() {
    const argv = process.argv.slice(2);

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === "--workers" || arg === "-w") {
            const next = argv[i + 1];

            if (next !== undefined && /^\d+$/.test(next)) {
                return Number(next);
            }

            return null;
        }
    }

    return undefined;
}

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

    const inputFolder = path.resolve(parsed.positionals[0]),
        inputName = path.basename(inputFolder);

    const outputFolder = path.resolve(parsed.values.output ?? parsed.positionals[1] ?? path.join(outputDir, inputName));

    const digits = parsed.values.digits ? ScriptUtil.parseInteger(parsed.values.digits, "--digits") : defaultDigits;

    if (digits < 1) {
        throw new OCIFError("--digits must be at least 1");
    }

    const rawWorkers = parseWorkersCount();
    let workerCount;

    if (rawWorkers === undefined) {
        workerCount = null;
    } else if (rawWorkers === null) {
        workerCount = os.availableParallelism?.() ?? os.cpus().length;
    } else {
        workerCount = rawWorkers;
        if (workerCount < 1) throw new OCIFError("--workers must be at least 1");
    }

    return {
        inputFolder,
        outputFolder,
        digits,
        workerCount,
        values: parsed.values
    };
}

function makeOutputName(index, digits, filePath) {
    const number = String(index + 1).padStart(digits, "0"),
        name = path.basename(filePath, path.extname(filePath));

    return `${number}_${name}.ocif`;
}

async function runSequential(files, digits, outputFolder, values) {
    for (let index = 0; index < files.length; index++) {
        const filePath = files[index],
            outputPath = path.join(outputFolder, makeOutputName(index, digits, filePath)),
            options = resolveConvertOptions(filePath, outputPath, values);

        await convertImage(options, { prefix: `${index + 1}/${files.length} ` });
    }
}

async function runParallel(files, digits, outputFolder, values, concurrency) {
    const total = files.length;

    let nextIndex = 0,
        failed = 0;

    function spawnWorker() {
        return new Promise(resolve => {
            const index = nextIndex++;
            if (index >= total) return resolve();

            const filePath = files[index],
                outputPath = path.join(outputFolder, makeOutputName(index, digits, filePath)),
                label = `${index + 1}/${total} `;

            const worker = new Worker(new URL(import.meta.url), {
                workerData: { filePath, outputPath, values, label }
            });

            worker.once("message", ({ ok, error }) => {
                if (!ok) {
                    console.error(`ERROR: Worker failed for ${filePath}: ${error}`);
                    failed++;
                }
                resolve(spawnWorker());
            });

            worker.once("error", err => {
                console.error(`ERROR: Worker thread crashed for ${filePath}:`, err);
                failed++;
                resolve(spawnWorker());
            });
        });
    }

    const lanes = Array.from({ length: Math.min(concurrency, total) }, spawnWorker);
    await Promise.all(lanes);

    if (failed > 0) {
        throw new OCIFError(`${failed} of ${total} conversions failed in parallel mode`);
    }
}

async function main() {
    if (!isMainThread) return;

    let args;

    try {
        args = parseArgs();
    } catch (err) {
        console.error("ERROR:", err.message, "\n");
        console.log(usage);
        process.exit(1);
    }

    try {
        const startedAt = Date.now(),
            batchStartedAt = new Date().toISOString();

        const files = await FileUtil.getImageFiles(args.inputFolder),
            digits = Math.max(args.digits, String(files.length).length);

        if (files.length < 1) {
            throw new OCIFError(`No supported images found in ${args.inputFolder}`);
        }

        await FileUtil.ensureDir(args.outputFolder);

        const modeLabel = args.workerCount != null ? `${args.workerCount} workers` : "sequential";

        console.log(
            `Batch started: found ${files.length} files in ${args.inputFolder} at ${batchStartedAt} [${modeLabel}]`
        );

        if (args.workerCount != null) {
            await runParallel(files, digits, args.outputFolder, args.values, args.workerCount);
        } else {
            await runSequential(files, digits, args.outputFolder, args.values);
        }

        console.log(
            `Batch finished: ${files.length} images to ${args.outputFolder} at ${new Date().toISOString()} (${formatDuration(Date.now() - startedAt)})`
        );
    } catch (err) {
        console.error("ERROR: Occurred while batch converting images:");
        console.error(err);
        process.exit(1);
    }
}

main();
