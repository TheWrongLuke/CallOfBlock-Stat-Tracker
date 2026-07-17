import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const output = path.join(root, "dist");
const config = JSON.parse(await readFile(path.join(root, "site.config.json"), "utf8"));
const publicSiteUrl = String(process.env.COB_PUBLIC_SITE_URL || config.publicSiteUrl).replace(/\/+$/, "/");

if (path.dirname(output) !== root || path.basename(output) !== "dist") {
    throw new Error("Refusing to clean an unexpected build directory.");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const files = [
    "index.html",
    "app.js",
    "styles.css",
    "api-config.js",
    "store-catalog.js",
    "Icon.png",
    "robots.txt",
    "sitemap.xml",
    "site.webmanifest"
];
const directories = ["assets", "data", "src"];

for (const file of files) await cp(path.join(root, file), path.join(output, file));
for (const directory of directories) {
    await cp(path.join(root, directory), path.join(output, directory), { recursive: true });
}

const indexPath = path.join(output, "index.html");
let html = await readFile(indexPath, "utf8");
html = html
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${publicSiteUrl}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${publicSiteUrl}">`)
    .replace(
        /<meta property="og:image" content="[^"]*">/,
        `<meta property="og:image" content="${new URL(config.socialImage, publicSiteUrl)}">`
    )
    .replace(
        /<meta name="twitter:image" content="[^"]*">/,
        `<meta name="twitter:image" content="${new URL(config.socialImage, publicSiteUrl)}">`
    );
await writeFile(indexPath, html, "utf8");

const apiConfigPath = path.join(output, "api-config.js");
let apiConfig = await readFile(apiConfigPath, "utf8");
apiConfig = apiConfig.replace(
    /window\.COB_PUBLIC_SITE_URL\s*=\s*"[^"]*";/,
    `window.COB_PUBLIC_SITE_URL = ${JSON.stringify(publicSiteUrl)};`
);
await writeFile(apiConfigPath, apiConfig, "utf8");

await writeFile(
    path.join(output, "robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${new URL("sitemap.xml", publicSiteUrl)}\n`,
    "utf8"
);
await writeFile(
    path.join(output, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${publicSiteUrl}</loc></url>\n</urlset>\n`,
    "utf8"
);

console.log(`Built static site at ${output}`);
