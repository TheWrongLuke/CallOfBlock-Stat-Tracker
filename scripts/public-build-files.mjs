import path from "node:path";

const extensions = {
    src: new Set([".js"]),
    data: new Set([".json"]),
    assets: new Set([".css", ".png", ".webp", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf"])
};
const privateDirectories = new Set(["private", "secrets", "credentials", "node_modules", "output", "artifacts"]);

export function isPublicBuildFile(relativePath, isDirectory = false) {
    const parts = relativePath.replaceAll("\\", "/").split("/");
    if (
        !extensions[parts[0]] ||
        parts.some((part) => part.startsWith(".") || privateDirectories.has(part.toLowerCase()))
    ) {
        return false;
    }
    const name = parts.at(-1);
    if (/\.(?:bak|backup|log|err|sql|pem|key|dpapi)(?:\.|$)/i.test(name)) return false;
    if (parts[0] === "data" && name.startsWith("fixture-")) return false;
    const extension = path.posix.extname(name).toLowerCase();
    return isDirectory || extensions[parts[0]].has(extension);
}
