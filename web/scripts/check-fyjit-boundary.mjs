import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = join(root, "src");
const forbiddenFiles = [
    "src/components/layout/app-config-modal.tsx",
    "src/components/layout/channel-editor-drawer.tsx",
    "src/services/api/image.ts",
    "src/services/api/video.ts",
    "src/services/api/audio.ts",
    "src/services/api/model-plugin.ts",
    "src/services/app-sync.ts",
    "src/services/config-file.ts",
    "src/services/webdav-sync.ts",
];
const forbiddenPatterns = [
    /\bapiKey\b/i,
    /config\.baseUrl/,
    /api\.openai\.com/i,
    /generativelanguage\.googleapis\.com/i,
    /x-goog-api-key/i,
    /请先配置\s*(?:API Key|Base URL)/i,
];

const violations = forbiddenFiles.filter((file) => existsSync(join(root, file))).map((file) => `${file}: forbidden direct-provider module`);
for (const file of walk(sourceRoot)) {
    if (!/\.(?:ts|tsx)$/.test(file) || /\.test\.(?:ts|tsx)$/.test(file)) continue;
    const content = readFileSync(file, "utf8");
    for (const pattern of forbiddenPatterns) {
        if (pattern.test(content)) violations.push(`${relative(root, file)}: forbidden marker ${pattern}`);
    }
}

if (violations.length) {
    console.error(violations.join("\n"));
    process.exit(1);
}
console.log("FYJIT browser boundary check passed");

function* walk(directory) {
    for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) yield* walk(path);
        else yield path;
    }
}
