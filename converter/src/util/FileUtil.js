import fs from "fs/promises";
import path from "path";

import FileError from "../errors/FileError.js";

function throwFSError(msg, ref, cause) {
    const errRef = { cause };

    if (typeof ref === "object") {
        Object.assign(errRef, ref);
    } else {
        errRef.filePath = ref;
    }

    throw new FileError(msg, errRef);
}

async function ensureDir(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
        return dirPath;
    } catch (err) {
        throwFSError(`Could not create directory: ${dirPath}`, dirPath, err);
    }
}

let FileUtil = Object.freeze({
    imageExtensions: Object.freeze(
        new Set([".avif", ".bmp", ".gif", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"])
    ),

    OCIFExtensions: Object.freeze(new Set([".ocif"])),

    numericSortNames: names => {
        return names.sort((a, b) =>
            a.localeCompare(b, undefined, {
                numeric: true,
                sensitivity: "base"
            })
        );
    },

    parsePath: filePath => {
        let fileDir;

        if (typeof filePath === "object") {
            const pathOptions = filePath;
            ({ filePath, fileDir } = pathOptions);
        }

        if (filePath == null || String(filePath).length < 1) {
            throw new FileError("No file path provided", { filePath });
        }

        filePath = path.resolve(fileDir || "", filePath);
        fileDir ||= path.dirname(filePath);

        return [filePath, fileDir];
    },

    ensureDir: async filePath => {
        const [, dirPath] = FileUtil.parsePath(filePath);
        return ensureDir(dirPath);
    },

    readFile: async filePath => {
        [filePath] = FileUtil.parsePath(filePath);

        try {
            return await fs.readFile(filePath);
        } catch (err) {
            if (err.code === "ENOENT") {
                throwFSError(`File not found: ${filePath}`, filePath, err);
            }

            throwFSError(`Could not read file: ${filePath}`, filePath, err);
        }
    },

    writeFile: async (filePath, data) => {
        let fileDir;
        [filePath, fileDir] = FileUtil.parsePath(filePath);

        try {
            await ensureDir(fileDir);
            await fs.writeFile(filePath, data);

            return filePath;
        } catch (err) {
            throwFSError(`Could not write file: ${filePath}`, filePath, err);
        }
    },

    copyFile: async (srcPath, outPath) => {
        let outDir;
        [srcPath] = FileUtil.parsePath(srcPath);
        [outPath, outDir] = FileUtil.parsePath(outPath);

        try {
            await ensureDir(outDir);
            await fs.copyFile(srcPath, outPath);

            return outPath;
        } catch (err) {
            if (err.code === "ENOENT") {
                throwFSError(`File not found: ${srcPath}`, { srcPath, outPath }, err);
            }

            throwFSError(`Could not copy file: ${srcPath} to ${outPath}`, { srcPath, outPath }, err);
        }
    },

    deleteFile: async filePath => {
        [filePath] = FileUtil.parsePath(filePath);

        try {
            await fs.rm(filePath);
            return filePath;
        } catch (err) {
            if (err.code === "ENOENT") {
                throwFSError(`File not found: ${filePath}`, filePath, err);
            }

            throwFSError(`Could not delete file: ${filePath}`, filePath, err);
        }
    },

    getFilesByExtensions: async (dirPath, extensions) => {
        [dirPath] = FileUtil.parsePath(dirPath);

        try {
            const files = await fs.readdir(dirPath),
                names = files.filter(name => extensions.has(path.extname(name).toLowerCase()));

            return FileUtil.numericSortNames(names).map(name => path.join(dirPath, name));
        } catch (err) {
            if (err.code === "ENOENT") {
                return [];
            }

            throwFSError(`Could not read directory: ${dirPath}`, dirPath, err);
        }
    },

    getImageFiles: async dirPath => {
        return FileUtil.getFilesByExtensions(dirPath, FileUtil.imageExtensions);
    },

    getOCIFFiles: async dirPath => {
        return FileUtil.getFilesByExtensions(dirPath, FileUtil.OCIFExtensions);
    },

    clearOCIFFiles: async dirPath => {
        const paths = await FileUtil.getOCIFFiles(dirPath);

        let success = true;

        for (const filePath of paths) {
            try {
                await fs.rm(filePath);
            } catch {
                success = false;
            }
        }

        return success;
    }
});

export default FileUtil;
