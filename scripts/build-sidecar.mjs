/*
	Compile app/app-main.js (the loader that embeds app/server.js, or defers to
	a working copy's app/server.js at runtime) into the standalone binary that
	Tauri ships as a sidecar, and give it the filename Tauri insists on.

	Tauri's externalBin looks for "<name>-<rust target triple>" and strips the
	triple back off when it installs the app, so the file MUST be named for the
	target it was built for -- "seeding-server-x86_64-pc-windows-msvc.exe", not
	"seeding-server.exe". Getting this wrong fails at bundle time with a
	confusing "binary not found", which is why the triple is resolved from rustc
	rather than guessed whenever rustc is available.

	Run:  npm run sidecar
	CI runs the same script before tauri-action, once per matrix target.

	Copied from mbaacc-stream-setup/scripts/build-sidecar.mjs; only the names differ.
*/
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src-tauri", "binaries");
const NAME = "seeding-server";

/*
	Rust triple -> Bun target. Only the platforms the release workflow builds
	are listed; anything else should fail loudly rather than silently produce a
	binary for the wrong architecture.
*/
const BUN_TARGET = {
	"x86_64-pc-windows-msvc": "bun-windows-x64",
	"aarch64-apple-darwin": "bun-darwin-arm64",
	"x86_64-apple-darwin": "bun-darwin-x64",
	"x86_64-unknown-linux-gnu": "bun-linux-x64",
};

// Prefer rustc's own answer -- it is the same value Tauri will look for. The
// fallback only matters for a machine with Bun but no Rust, i.e. local use.
function hostTriple() {
	if (process.env.SIDECAR_TARGET) return process.env.SIDECAR_TARGET;
	try {
		const out = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
		const m = out.match(/^host:\s*(\S+)$/m);
		if (m) return m[1];
	} catch { /* no rustc: fall through */ }

	const guess = {
		"win32:x64": "x86_64-pc-windows-msvc",
		"darwin:arm64": "aarch64-apple-darwin",
		"darwin:x64": "x86_64-apple-darwin",
		"linux:x64": "x86_64-unknown-linux-gnu",
	}[`${process.platform}:${process.arch}`];
	if (!guess) {
		console.error(`  Unsupported host ${process.platform}/${process.arch}.`);
		console.error("  Set SIDECAR_TARGET to a Rust target triple to override.");
		process.exit(1);
	}
	return guess;
}

const triple = hostTriple();
const bunTarget = BUN_TARGET[triple];
if (!bunTarget) {
	console.error(`  No Bun target mapped for "${triple}".`);
	console.error(`  Known: ${Object.keys(BUN_TARGET).join(", ")}`);
	process.exit(1);
}

const ext = triple.includes("windows") ? ".exe" : "";
const outfile = join(OUT_DIR, `${NAME}-${triple}${ext}`);
mkdirSync(OUT_DIR, { recursive: true });

console.log(`  target  ${triple}  (bun: ${bunTarget})`);
console.log(`  outfile ${outfile}`);

// bun.exe by name rather than via a shell: shell:true does not escape args,
// and the outfile path contains spaces on a default Windows checkout.
const bunExe = process.platform === "win32" ? "bun.exe" : "bun";
const r = spawnSync(bunExe, [
	"build", "--compile", "--minify",
	`--target=${bunTarget}`,
	join(ROOT, "app", "app-main.js"),
	"--outfile", outfile,
], { stdio: "inherit" });

if (r.error && r.error.code === "ENOENT") {
	console.error("\n  Bun is not installed. Get it from https://bun.sh\n");
	process.exit(1);
}
if (r.status !== 0) process.exit(r.status ?? 1);
if (!existsSync(outfile)) {
	console.error(`\n  Bun reported success but ${outfile} is missing.\n`);
	process.exit(1);
}
console.log("  sidecar built");
