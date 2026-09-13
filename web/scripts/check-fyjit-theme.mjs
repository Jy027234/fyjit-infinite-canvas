import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const colorTokens = [
    "background",
    "foreground",
    "card",
    "card-foreground",
    "popover",
    "popover-foreground",
    "primary",
    "primary-foreground",
    "secondary",
    "secondary-foreground",
    "muted",
    "muted-foreground",
    "accent",
    "accent-foreground",
    "destructive",
    "destructive-foreground",
    "success",
    "success-foreground",
    "warning",
    "warning-foreground",
    "info",
    "info-foreground",
    "neutral",
    "neutral-foreground",
    "border",
    "input",
    "ring",
    "chart-1",
    "chart-2",
    "chart-3",
    "chart-4",
    "chart-5",
    "overview-accent-1",
    "overview-accent-2",
    "overview-accent-3",
    "skeleton-base",
    "skeleton-highlight",
    "table-row",
    "table-header",
    "table-header-hover",
    "table-disabled",
    "table-disabled-hover",
    "table-disabled-border",
];

const antPaletteKeys = ["background", "container", "elevated", "text", "primary", "success", "warning", "error", "info", "border", "outline", "shadow"];
const antTokenMappings = ["colorPrimary", "colorSuccess", "colorWarning", "colorError", "colorInfo", "colorText", "colorBgBase", "colorBgContainer", "colorBorder", "controlHeight", "borderRadius", "fontFamily", "boxShadow"];

const webRoot = process.cwd();
const contractPath = path.join(webRoot, "src/styles/fyjit-creative-theme-v1.css");
const globalsPath = path.join(webRoot, "src/styles/globals.css");
const antThemePath = path.join(webRoot, "src/lib/app-theme.ts");
const themeDocPath = path.resolve(webRoot, "../THEME.md");

function argument(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

function read(file) {
    return fs.readFileSync(file, "utf8");
}

function extractBlock(source, marker) {
    const start = source.indexOf(marker);
    if (start < 0) throw new Error(`Missing block: ${marker}`);
    const open = source.indexOf("{", start);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === "{") depth += 1;
        if (source[index] === "}") depth -= 1;
        if (depth === 0) return source.slice(open + 1, index);
    }
    throw new Error(`Unclosed block: ${marker}`);
}

function declarations(block) {
    return new Map(Array.from(block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g), ([, key, value]) => [key, normalizeValue(value)]));
}

function normalizeValue(value) {
    return value
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\(\s+/g, "(")
        .replace(/\s+\)/g, ")")
        .replace(/var\(--([\w-]+)\)/g, (_, key) => `var(--fyjit-color-${key.replace(/^fyjit-color-/, "")})`);
}

function assert(condition, message, failures) {
    if (!condition) failures.push(message);
}

const contract = read(contractPath);
const globals = read(globalsPath);
const antTheme = read(antThemePath);
const themeDoc = read(themeDocPath);
const contractModes = {
    light: declarations(extractBlock(contract, ":root")),
    dark: declarations(extractBlock(contract, ".dark {")),
};
const failures = [];

for (const [mode, values] of Object.entries(contractModes)) {
    for (const token of colorTokens) assert(values.has(`fyjit-color-${token}`), `${mode}: contract is missing --fyjit-color-${token}`, failures);
}

for (const token of colorTokens) assert(globals.includes(`--${token}: var(--fyjit-color-${token})`), `globals.css does not map --${token}`, failures);

for (const mode of ["light", "dark"]) {
    const palette = extractBlock(antTheme, `${mode}: {`);
    for (const key of antPaletteKeys) assert(new RegExp(`\\b${key}\\s*:`).test(palette), `app-theme.ts ${mode} palette is missing ${key}`, failures);
}
for (const token of antTokenMappings) assert(new RegExp(`\\b${token}\\s*:`).test(antTheme), `app-theme.ts does not map ${token}`, failures);

const version = contract.match(/--fyjit-theme-version:\s*["']([^"']+)["']/)?.[1];
assert(Boolean(version), "theme contract has no version", failures);
assert(Boolean(version && themeDoc.includes(`Contract version: \`${version}\``)), `THEME.md does not declare contract version ${version || "<missing>"}`, failures);

const explicitSource = argument("--source") || process.env.FYJIT_THEME_SOURCE;
const localSource = path.resolve(webRoot, "../../fyjitweb/web/default/src/styles/theme.css");
const sourcePath = explicitSource ? path.resolve(explicitSource) : fs.existsSync(localSource) ? localSource : undefined;

if (explicitSource && !fs.existsSync(sourcePath)) failures.push(`FYJIT theme source does not exist: ${sourcePath}`);
if (sourcePath && fs.existsSync(sourcePath)) {
    const source = read(sourcePath);
    const sourceModes = {
        light: declarations(extractBlock(source, ":root")),
        dark: declarations(extractBlock(source, ".dark {")),
    };
    for (const mode of ["light", "dark"]) {
        for (const token of colorTokens) {
            const sourceValue = sourceModes[mode].get(token);
            const contractValue = contractModes[mode].get(`fyjit-color-${token}`);
            assert(Boolean(sourceValue), `${mode}/${token}: source token is missing`, failures);
            if (sourceValue && contractValue) assert(sourceValue === contractValue, `${mode}/${token}: source=${sourceValue} contract=${contractValue}`, failures);
        }
    }
    console.log(`FYJIT theme source compared: ${sourcePath}`);
} else {
    console.log("FYJIT theme source not present; ran contract, Tailwind, Ant Design and version checks.");
}

if (failures.length) {
    console.error(`FYJIT theme check failed (${failures.length}):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
} else {
    console.log(`FYJIT theme check passed (${colorTokens.length} shared color tokens).`);
}
