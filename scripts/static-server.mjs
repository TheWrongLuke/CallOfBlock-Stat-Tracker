import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const argumentsMap = new Map(
    process.argv.slice(2).map((argument) => {
        const [key, value = ""] = argument.split("=", 2);
        return [key, value];
    })
);
const root = path.resolve(projectRoot, argumentsMap.get("--root") || ".");
const port = Number(argumentsMap.get("--port") || 4173);
const publicRoot = path.join(root, "public");

const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".webp": "image/webp",
    ".xml": "application/xml; charset=utf-8"
};

async function isFile(filePath) {
    try {
        return (await stat(filePath)).isFile();
    } catch (_error) {
        return false;
    }
}

const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
        const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
        const requestedFilePath = path.resolve(root, `.${requestedPath}`);
        if (requestedFilePath !== root && !requestedFilePath.startsWith(`${root}${path.sep}`)) {
            response.writeHead(403).end("Forbidden");
            return;
        }
        let filePath = requestedFilePath;
        if (!(await isFile(filePath))) {
            const publicFilePath = path.resolve(publicRoot, `.${requestedPath}`);
            if (publicFilePath !== publicRoot && !publicFilePath.startsWith(`${publicRoot}${path.sep}`)) {
                throw new Error("Invalid public path");
            }
            filePath = publicFilePath;
        }
        const fileStat = await stat(filePath);
        if (!fileStat.isFile()) throw new Error("Not a file");
        response.writeHead(200, {
            "Cache-Control": "no-store",
            "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
        });
        createReadStream(filePath).pipe(response);
    } catch (_error) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    }
});

server.listen(port, "127.0.0.1", () => {
    console.log(`Call of Block preview: http://127.0.0.1:${port}/`);
});
