import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(webRoot, "dist");
const budget = JSON.parse(fs.readFileSync(path.join(webRoot, "bundle-budget.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(distRoot, ".vite/manifest.json"), "utf8"));
const entry = manifest["index.html"];

if (!entry?.file || !entry.css?.length) throw new Error("Vite manifest is missing initial JS or CSS assets.");

const assetBytes = (asset) => fs.readFileSync(path.join(distRoot, asset));
const totalSize = (assets) => {
    const buffers = [...new Set(assets)].map(assetBytes);
    return {
        raw: buffers.reduce((total, buffer) => total + buffer.length, 0),
        gzip: buffers.reduce((total, buffer) => total + zlib.gzipSync(buffer).length, 0),
    };
};

const routeEntries = Object.entries(manifest).filter(([key, value]) => value.isDynamicEntry && (key.startsWith("src/pages/") || value.name === "project"));
if (!routeEntries.length) throw new Error("Vite manifest has no route chunks.");
const [largestRouteKey, largestRoute] = routeEntries.reduce((largest, candidate) => (assetBytes(candidate[1].file).length > assetBytes(largest[1].file).length ? candidate : largest));

const metrics = [
    { key: "initialJs", label: `initial JS (${entry.file})`, size: totalSize([entry.file]) },
    { key: "largestRouteChunk", label: `largest route JS (${largestRouteKey} -> ${largestRoute.file})`, size: totalSize([largestRoute.file]) },
    { key: "initialCss", label: `initial CSS (${entry.css.length} files)`, size: totalSize(entry.css) },
];

const failures = [];
for (const metric of metrics) {
    const limit = budget.limitsKiB?.[metric.key];
    if (!limit) throw new Error(`Missing bundle limit for ${metric.key}.`);
    const raw = metric.size.raw / 1024;
    const gzip = metric.size.gzip / 1024;
    console.log(`${metric.label}: ${raw.toFixed(1)} KiB raw / ${gzip.toFixed(1)} KiB gzip (budget ${limit.raw}/${limit.gzip} KiB)`);
    if (raw > limit.raw || gzip > limit.gzip) failures.push(metric.label);
}

if (failures.length) {
    console.error(`Bundle budget exceeded: ${failures.join(", ")}`);
    console.error(budget.reviewPolicy);
    process.exitCode = 1;
} else {
    console.log(`Bundle budget passed (${budget.baseline}).`);
}
