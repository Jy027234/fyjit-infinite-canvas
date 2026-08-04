import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const webRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(webRoot, "..");
const outputPath = path.join(repositoryRoot, "THIRD_PARTY_NOTICES.md");
const checkOnly = process.argv.includes("--check");
const licenseOverrides = new Map([["khroma", "MIT"]]); // package manifest omits it; upstream repository ships an MIT license.

const packages = await collectPackages(path.join(webRoot, "node_modules"));
if (!packages.length) throw new Error("No installed packages found. Run `bun install --frozen-lockfile` first.");
const unresolved = packages.filter((item) => item.license === "NOT DECLARED");
if (unresolved.length) throw new Error(`Missing license metadata: ${unresolved.map((item) => `${item.name}@${item.version}`).join(", ")}`);

const content = renderNotice(packages);
if (checkOnly) {
    const existing = existsSync(outputPath) ? await fs.readFile(outputPath, "utf8") : "";
    if (existing !== content) {
        console.error("THIRD_PARTY_NOTICES.md is stale. Run `bun run licenses:generate` and commit the result.");
        process.exit(1);
    }
    console.log(`Verified ${packages.length} third-party package records.`);
} else {
    await fs.writeFile(outputPath, content, "utf8");
    console.log(`Wrote ${path.relative(process.cwd(), outputPath)} with ${packages.length} package records.`);
}

async function collectPackages(nodeModulesPath) {
    const records = new Map();
    const visited = new Set();

    async function walk(currentNodeModules) {
        if (!existsSync(currentNodeModules)) return;
        const real = await fs.realpath(currentNodeModules);
        if (visited.has(real)) return;
        visited.add(real);

        const entries = await fs.readdir(currentNodeModules, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith(".")) continue;
            const entryPath = path.join(currentNodeModules, entry.name);
            if (entry.name.startsWith("@")) {
                for (const scopedEntry of await fs.readdir(entryPath, { withFileTypes: true })) {
                    if (scopedEntry.isDirectory() || scopedEntry.isSymbolicLink()) await readPackage(path.join(entryPath, scopedEntry.name));
                }
            } else if (entry.isDirectory() || entry.isSymbolicLink()) {
                await readPackage(entryPath);
            }
        }
    }

    async function readPackage(packagePath) {
        const manifestPath = path.join(packagePath, "package.json");
        if (!existsSync(manifestPath)) return;
        let manifest;
        try {
            manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        } catch {
            return;
        }
        if (manifest.name && manifest.version) {
            const license = licenseOverrides.get(manifest.name) || normalizeLicense(manifest.license ?? manifest.licenses);
            const repository = normalizeRepository(manifest.repository, manifest.homepage);
            records.set(`${manifest.name}@${manifest.version}`, { name: manifest.name, version: manifest.version, license, repository });
        }
        await walk(path.join(packagePath, "node_modules"));
    }

    await walk(nodeModulesPath);
    return [...records.values()].sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
}

function normalizeLicense(value) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
        const values = value.map((item) => (typeof item === "string" ? item : item?.type)).filter(Boolean);
        if (values.length) return values.join(" OR ");
    }
    if (value && typeof value.type === "string") return value.type;
    return "NOT DECLARED";
}

function normalizeRepository(repository, homepage) {
    const value = typeof repository === "string" ? repository : repository?.url;
    const normalized = String(value || homepage || "").replace(/^git\+/, "").replace(/^git:\/\//, "https://").replace(/\.git$/, "");
    if (normalized.startsWith("github:")) return `https://github.com/${normalized.slice("github:".length)}`;
    return normalized.startsWith("git@github.com:") ? normalized.replace("git@github.com:", "https://github.com/") : normalized;
}

function escapeCell(value) {
    return String(value || "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderNotice(records) {
    const generatedAt = "Generated from web/node_modules and audited project assets. Re-run `bun run licenses:generate` after dependency changes.";
    const packageRows = records.map((item) => `| ${escapeCell(item.name)} | ${escapeCell(item.version)} | ${escapeCell(item.license)} | ${item.repository ? `[source](${item.repository})` : "—"} |`).join("\n");
    return `# Third-Party Notices\n\n${generatedAt}\n\nThis inventory is informational and does not replace the license text shipped by each upstream project. FYJIT Infinite Canvas itself remains licensed under AGPL-3.0-or-later as described in [LICENSE](./LICENSE), [NOTICE](./NOTICE), and [UPSTREAM.md](./UPSTREAM.md). Product names and logos may also be trademarks of their owners.\n\n## Bundled source assets\n\n| Asset | Origin | License / use basis | Handling |\n| --- | --- | --- | --- |\n| \`web/public/logo.svg\` | Inherited from upstream Infinite Canvas | AGPL-3.0-or-later repository source | Bundled with source attribution |\n| \`web/public/icons/{claude,deepseek,gemini,glm,grok,openai}.svg\` | Inherited upstream provider icons; icon geometry corresponds to Lobe Icons | [MIT](https://github.com/lobehub/lobe-icons/blob/master/LICENSE) | Bundled; provider names/logos remain trademarks |\n| \`web/public/icons/linuxdo.svg\` | Inherited from upstream Infinite Canvas | Upstream repository source; Linux DO mark may be a trademark | Bundled only for provider identification |\n| Fonts | Browser/system sans-serif stack | No font binaries bundled | No redistribution |\n\n## Prompt-source content policy\n\nThe registry transport project [yukkcat/image-prompts](https://github.com/yukkcat/image-prompts) is MIT-licensed. Content is synchronized only when the individual source license has been audited. Unverified sources remain link-only and their prompt bodies, covers, and previews are neither downloaded nor cached.\n\n| Source | Content license | Audit result | Application policy |\n| --- | --- | --- | --- |\n| [Banana Prompt Quicker](https://github.com/glidea/banana-prompt-quicker) | [MIT](https://github.com/glidea/banana-prompt-quicker/blob/main/LICENSE) | Approved 2026-08-04 | Full sync with attribution |\n| [DavidWu GPT Image 2](https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts) | Not verifiable; repository returned 404 | Unverified 2026-08-04 | Link-only; full sync disabled |\n| [Awesome GPT Image](https://github.com/ZeroLu/awesome-gpt-image) | [MIT](https://github.com/ZeroLu/awesome-gpt-image/blob/main/LICENSE) | Approved 2026-08-04 | Full sync with attribution |\n| [Awesome GPT-4o](https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts) | [MIT](https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts/blob/main/LICENSE) | Approved 2026-08-04 | Full sync with attribution |\n| [YouMind GPT Image 2](https://github.com/YouMind-OpenLab/awesome-gpt-image-2) | [CC BY 4.0](https://github.com/YouMind-OpenLab/awesome-gpt-image-2/blob/main/LICENSE) | Approved 2026-08-04 | Full sync with attribution |\n| [YouMind Nano Banana Pro](https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts) | [CC BY 4.0](https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/blob/main/LICENSE) | Approved 2026-08-04 | Full sync with attribution |\n\nCustom prompt sources default to link-only. An operator must provide a license identifier, license URL, and attribution before enabling full-content synchronization. Imported prompt assets retain those fields in metadata.\n\n## JavaScript packages\n\n| Package | Version | Declared license | Repository |\n| --- | --- | --- | --- |\n${packageRows}\n`;
}
