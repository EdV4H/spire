/**
 * `@edv4h/spire-render/headless` must import with no `react` installed.
 *
 * The claim is about the *built* package, not the source, and it cannot be
 * checked from inside vitest — the workspace resolves React either way, and
 * giving the render package `@types/node` just to spawn a process would quietly
 * let its source start using Node APIs. So it lives here, as a packaging check.
 *
 * Run: node scripts/check-headless-entry.mjs
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../packages/render/dist", import.meta.url));

const HOOK = `
export async function resolve(spec, ctx, next) {
	if (spec === "react" || spec.startsWith("react/")) throw new Error("react is not installed");
	return next(spec, ctx);
}
`;

function importWithoutReact(entry) {
	const source = `
		import { register } from "node:module";
		import { pathToFileURL } from "node:url";
		register("data:text/javascript,${encodeURIComponent(HOOK)}", pathToFileURL("./"));
		try {
			const mod = await import(${JSON.stringify(`${dist}/${entry}`)});
			console.log("OK:" + typeof mod.renderToSVG);
		} catch (error) {
			console.log("ERR:" + String(error.message).split("\\n")[0]);
		}
	`;
	return execFileSync(process.execPath, ["--input-type=module", "-e", source], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	}).trim();
}

if (!existsSync(`${dist}/headless.js`)) {
	console.error("packages/render/dist is missing — run `pnpm turbo run build` first.");
	process.exit(1);
}

const failures = [];

const headless = importWithoutReact("headless.js");
if (headless !== "OK:function") {
	failures.push(`headless entry needs react: ${headless}`);
}

// Not a wart to fix: the main entry exports `SpireMap`, so it must load React.
// Asserted so that the two entries are known to differ — if this ever stops
// being true, `headless` has become dead API and should be removed rather than
// linger.
const main = importWithoutReact("index.js");
if (!main.startsWith("ERR:")) {
	failures.push(`main entry no longer needs react (${main}) — is headless still needed?`);
}

if (failures.length > 0) {
	for (const failure of failures) console.error(`✗ ${failure}`);
	process.exit(1);
}

console.log("✓ headless imports without react; main entry still requires it");
