import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const output = path.join(root, "dist");
const config = JSON.parse(await readFile(path.join(root, "config", "site.config.json"), "utf8"));
const pages = JSON.parse(await readFile(path.join(root, "config", "public-pages.json"), "utf8"));
const publicSiteUrl = String(process.env.COB_PUBLIC_SITE_URL || config.publicSiteUrl).replace(/\/+$/, "/");

if (path.dirname(output) !== root || path.basename(output) !== "dist") {
    throw new Error("Refusing to clean an unexpected build directory.");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const publicFiles = ["robots.txt", "sitemap.xml", "site.webmanifest"];
const directories = ["assets", "data", "src"];

for (const file of publicFiles) {
    await cp(path.join(root, "public", file), path.join(output, file));
}
for (const directory of directories) {
    await cp(path.join(root, directory), path.join(output, directory), { recursive: true });
}

const sourceHtml = await readFile(path.join(root, "index.html"), "utf8");
const socialImageUrl = new URL(config.socialImage, publicSiteUrl).toString();
const routeViewTags = new Map([
    ["home-view", "main"],
    ["leaderboard-view", "main"],
    ["playtests-view", "main"],
    ["feedback-view", "main"],
    ["ticket-view", "main"],
    ["admin-tickets-view", "main"],
    ["community-admin-view", "main"],
    ["admin-help-view", "main"],
    ["admin-progression-view", "main"],
    ["player-view", "section"],
    ["match-view", "main"],
    ["account-view", "main"],
    ["store-view", "main"]
]);

const routeViewAllowlist = {
    home: new Set(["home-view"]),
    stats: new Set([
        "leaderboard-view",
        "admin-tickets-view",
        "community-admin-view",
        "admin-help-view",
        "admin-progression-view",
        "player-view",
        "match-view",
        "account-view",
        "store-view"
    ]),
    playtests: new Set(["playtests-view", "community-admin-view"]),
    feedback: new Set(["feedback-view", "ticket-view"]),
    help: new Set(["home-view"]),
    about: new Set()
};

for (const [id, page] of Object.entries(pages)) {
    const canonicalUrl = new URL(String(page.path || "/").replace(/^\//, ""), publicSiteUrl).toString();
    const targetDirectory = page.directory ? path.join(output, page.directory) : output;
    await mkdir(targetDirectory, { recursive: true });
    await writeFile(
        path.join(targetDirectory, "index.html"),
        renderPublicPage(sourceHtml, { id, page, canonicalUrl, socialImageUrl, publicSiteUrl }),
        "utf8"
    );
}

const apiConfigPath = path.join(output, "src", "config", "api-config.js");
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
await writeFile(path.join(output, "sitemap.xml"), buildSitemap(Object.values(pages), publicSiteUrl), "utf8");

console.log(`Built static site at ${output}`);

function renderPublicPage(html, { id, page, canonicalUrl, socialImageUrl, publicSiteUrl }) {
    const structuredData = pageStructuredData(id, page, canonicalUrl, publicSiteUrl);
    const entry = String(page.entry || id).replace(/[^a-z0-9-]/gi, "");
    const rendered = html
        .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(page.title)}</title>`)
        .replace(metaPattern("name", "description"), `$1${escapeHtml(page.description)}$2`)
        .replace(metaPattern("property", "og:title"), `$1${escapeHtml(page.title)}$2`)
        .replace(metaPattern("property", "og:description"), `$1${escapeHtml(page.description)}$2`)
        .replace(metaPattern("property", "og:url"), `$1${escapeHtml(canonicalUrl)}$2`)
        .replace(metaPattern("property", "og:image"), `$1${escapeHtml(socialImageUrl)}$2`)
        .replace(metaPattern("name", "twitter:title"), `$1${escapeHtml(page.title)}$2`)
        .replace(metaPattern("name", "twitter:description"), `$1${escapeHtml(page.description)}$2`)
        .replace(metaPattern("name", "twitter:url"), `$1${escapeHtml(canonicalUrl)}$2`)
        .replace(metaPattern("name", "twitter:image"), `$1${escapeHtml(socialImageUrl)}$2`)
        .replace(/(<link(?=[^>]*\brel="canonical")[^>]*\bhref=")[^"]*("[^>]*>)/i, `$1${escapeHtml(canonicalUrl)}$2`)
        .replace(
            /<script id="page-structured-data" type="application\/ld\+json">[\s\S]*?<\/script>/i,
            `<script id="page-structured-data" type="application/ld+json">\n${JSON.stringify(structuredData, null, 4)}\n    </script>`
        )
        .replace(
            /<body class="[^"]*" data-public-route="[^"]*">/i,
            `<body class="${id === "home" ? "home-route" : ""}" data-public-route="${id}">`
        )
        .replace("<!-- PUBLIC_PAGE_INTRO -->", "")
        .replace(
            /<script type="module" src="\.\/src\/entries\/home\.js\?v=[^"]*"><\/script>/i,
            `<script type="module" src="./src/entries/${entry}.js?v=page-runtime-1"></script>`
        );
    return pruneRouteViews(pruneSharedPageShell(renderPageHero(rendered, id, page), id), id);
}

function renderPageHero(html, routeId, page) {
    if (routeId === "home") return html;
    const intro = (Array.isArray(page.intro) ? page.intro : []).map((paragraph) => escapeHtml(paragraph)).join(" ");
    return html
        .replace(/(<p class="eyebrow">)[\s\S]*?(<\/p>)/i, `$1${escapeHtml(page.kicker || "Call of Block")}$2`)
        .replace(
            /(<h1 class="hero-site-title"[^>]*><a class="hero-title-link"[^>]*>)[\s\S]*?(<\/a><\/h1>)/i,
            `$1${escapeHtml(page.heading || page.title)}$2`
        )
        .replace(/(<p class="hero-text">)[\s\S]*?(<\/p>)/i, `$1\n                ${intro}\n            $2`);
}

function pruneSharedPageShell(html, routeId) {
    let output = html;
    if (routeId !== "home") {
        output = output.replace(/\s*<div class="hero-champions">[\s\S]*?(?=\s*<div class="hero-status">)/i, "");
    }
    if (!new Set(["home", "stats"]).has(routeId)) {
        output = output.replace(/\s*<div class="hero-status">[\s\S]*?<\/div>(?=\s*<\/header>)/i, "");
    }
    if (routeId !== "stats") {
        output = output.replace(/\s*<script src="\.\/src\/config\/store-catalog\.js\?v=[^"]*"><\/script>/i, "");
    }
    if (routeId === "help") {
        const helpContent = output.match(/<!-- HELP_CONTENT_START -->([\s\S]*?)<!-- HELP_CONTENT_END -->/i)?.[1] || "";
        output = output.replace(
            /<main class="home-view" id="home-view">[\s\S]*?<\/main>/i,
            `<main class="home-view" id="home-view">${helpContent}</main>`
        );
    }
    return output.replace(/\s*<!-- HELP_CONTENT_(?:START|END) -->\s*/gi, "\n");
}

function pruneRouteViews(html, routeId) {
    const allowed = routeViewAllowlist[routeId] || new Set();
    let output = html;
    for (const [viewId, tagName] of routeViewTags) {
        if (allowed.has(viewId)) continue;
        const pattern = new RegExp(
            `<${tagName}(?=[^>]*\\bid="${escapeRegExp(viewId)}")[^>]*>[\\s\\S]*?<\\/${tagName}>\\s*`,
            "i"
        );
        output = output.replace(pattern, "");
    }
    return output;
}

function metaPattern(attribute, value) {
    return new RegExp(`(<meta(?=[^>]*\\b${attribute}="${escapeRegExp(value)}")[^>]*\\bcontent=")[^"]*("[^>]*>)`, "i");
}

function pageStructuredData(id, page, canonicalUrl, publicSiteUrl) {
    if (id === "home") {
        return {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Call of Block",
            alternateName: ["Call of Block 2", "CallOfBlock", "COB"],
            url: publicSiteUrl
        };
    }
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebPage",
                name: page.title,
                description: page.description,
                url: canonicalUrl,
                isPartOf: { "@type": "WebSite", name: "Call of Block", url: publicSiteUrl }
            },
            {
                "@type": "BreadcrumbList",
                itemListElement: [
                    {
                        "@type": "ListItem",
                        position: 1,
                        name: "Call of Block",
                        item: publicSiteUrl
                    },
                    {
                        "@type": "ListItem",
                        position: 2,
                        name: page.heading,
                        item: canonicalUrl
                    }
                ]
            }
        ]
    };
}

function buildSitemap(pageDefinitions, baseUrl) {
    const urls = pageDefinitions
        .map(
            (page) =>
                `    <url><loc>${escapeXml(new URL(String(page.path || "/").replace(/^\//, ""), baseUrl))}</loc></url>`
        )
        .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function escapeXml(value) {
    return escapeHtml(String(value));
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
