#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const siteUrl = "https://marcoabbadini-uni.github.io";
const outputPath = path.join(rootDir, "sitemap.xml");

const extraFiles = [
  "CV/CV-Abbadini.pdf",
];

const ignoredFiles = new Set([
  "googlebf038bc5d4f717e5.html",
]);

const ignoredPathPrefixes = [
  "assets/",
  "images/",
  "teaching/2019-20-algebra2/email-templates/",
];

const preferredOrder = new Map([
  ["/", 0],
  ["/publications.html", 1],
  ["/talks.html", 2],
  ["/teaching/", 3],
  ["/teaching/2025-26-Categorical_dualities_in_logic/", 4],
  ["/teaching/2022-23-metodi_matematici/", 5],
  ["/teaching/2022-23-logica/", 6],
  ["/teaching/2021-22-matematica1/", 7],
  ["/teaching/2019-20-algebra2/", 8],
  ["/contact.html", 90],
  ["/CV/CV-Abbadini.pdf", 100],
]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    const relativePath = toPosix(path.relative(rootDir, fullPath));

    if (entry.isDirectory()) {
      const isIgnoredDirectory = ignoredPathPrefixes.some((prefix) => relativePath === prefix.slice(0, -1));
      if (entry.name.startsWith(".") || isIgnoredDirectory) {
        return [];
      }
      return walk(fullPath);
    }

    return [relativePath];
  });
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function isIgnored(relativePath) {
  return ignoredFiles.has(relativePath)
    || ignoredPathPrefixes.some((prefix) => relativePath.startsWith(prefix));
}

function fileToUrlPath(relativePath) {
  if (relativePath === "index.html") {
    return "/";
  }

  if (relativePath.endsWith("/index.html")) {
    return `/${relativePath.slice(0, -"index.html".length)}`;
  }

  return `/${relativePath}`;
}

function encodeUrlPath(urlPath) {
  return urlPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function lastModified(relativePath) {
  if (!hasUncommittedChanges(relativePath)) {
    try {
      const output = execFileSync(
        "git",
        ["log", "-1", "--format=%cs", "--", relativePath],
        { cwd: rootDir, encoding: "utf8" },
      ).trim();

      if (output) {
        return output;
      }
    } catch {
      // Fall through to filesystem mtime when Git metadata is unavailable.
    }
  }

  return fs.statSync(path.join(rootDir, relativePath)).mtime.toISOString().slice(0, 10);
}

function hasUncommittedChanges(relativePath) {
  try {
    const output = execFileSync(
      "git",
      ["status", "--short", "--", relativePath],
      { cwd: rootDir, encoding: "utf8" },
    ).trim();

    return output.length > 0;
  } catch {
    return false;
  }
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const discoveredFiles = walk(rootDir)
  .filter((relativePath) => relativePath.endsWith(".html"))
  .filter((relativePath) => !isIgnored(relativePath));

const sitemapEntries = [...discoveredFiles, ...extraFiles]
  .filter((relativePath) => fs.existsSync(path.join(rootDir, relativePath)))
  .map((relativePath) => {
    const urlPath = fileToUrlPath(relativePath);
    return {
      loc: `${siteUrl}${encodeUrlPath(urlPath)}`,
      urlPath,
      lastmod: lastModified(relativePath),
    };
  })
  .sort((a, b) => {
    const aRank = preferredOrder.get(a.urlPath) ?? 50;
    const bRank = preferredOrder.get(b.urlPath) ?? 50;

    if (aRank !== bRank) {
      return aRank - bRank;
    }

    return a.urlPath.localeCompare(b.urlPath);
  });

const xml = [
  "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
  "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
  ...sitemapEntries.flatMap((entry) => [
    "  <url>",
    `    <loc>${escapeXml(entry.loc)}</loc>`,
    `    <lastmod>${entry.lastmod}</lastmod>`,
    "  </url>",
  ]),
  "</urlset>",
  "",
].join("\n");

fs.writeFileSync(outputPath, xml);

console.log(`Wrote sitemap.xml with ${sitemapEntries.length} URLs.`);
