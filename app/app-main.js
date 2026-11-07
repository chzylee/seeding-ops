/*
	Entry point for the COMPILED app server only -- `npm start` runs server.js
	directly and never touches this file.

	The installed exe never needs a rebuild while developing. If a project
	override (project-path.txt beside the exe, or SEEDING_PROJECT in the
	environment) points at a checkout that carries its own app/server.js, THAT
	file is loaded and run -- live server code straight from the working copy,
	picked up on the next app launch. Otherwise the copy of server.js embedded in
	this binary at compile time runs, against the project files laid out beside
	the exe (app/, lib/, config/, registry/, out/, .env), which is what a portable
	ZIP or an installed copy gets.

	Either way SEEDING_ROOT names the project folder on disk, because a compiled
	binary's __dirname points inside the bundle and the server reads real files
	(the page's JS, config/majors.json, registry/tiers.csv, out/, .env).

	SEEDING_DATA names where the user's data lives (registry/tiers.csv, out/,
	.env). Beside the code, except in an installed copy, whose install folder
	belongs to the installer: there it is the per-user data folder, and the first
	launch moves what an older install left beside the exe (lib/data-dir.js).

	The "./server.js" require is static so Bun bundles it into the binary; the
	live require is a runtime-computed path, which a Bun-compiled binary resolves
	against the real filesystem.

	Copied from mbaacc-stream-setup/server/app-main.js; the marker and names differ.
*/
"use strict";

const fs = require("fs");
const path = require("path");

function candidates() {
	const dirs = [];
	if (process.env.SEEDING_PROJECT) dirs.push(process.env.SEEDING_PROJECT.trim());
	const exeDir = path.dirname(process.execPath);
	try {
		const marker = path.join(exeDir, "project-path.txt");
		if (fs.existsSync(marker))
			dirs.push(fs.readFileSync(marker, "utf8").split(/\r?\n/)[0].trim());
	} catch { /* unreadable marker = no override */ }
	// The exe living IN a checkout is the zero-config case. Two layouts: the exe
	// at the project root, or tucked into <project>/app/ beside the code it runs
	// (the parent probe). A normal install passes through both harmlessly.
	dirs.push(exeDir, path.dirname(exeDir));
	return dirs.filter(Boolean);
}

// Where the data lives, decided before the server loads (it reads SEEDING_DATA at load). A failure
// there never stops the app: it runs on the project folder, as every version before this one did.
const { applyDataRoot } = require("../lib/data-dir");   // static, so Bun bundles it
const useDataRoot = (root) => applyDataRoot({ root, exeDir: path.dirname(process.execPath) });

const dirs = candidates();
const liveDir = dirs.find(d => fs.existsSync(path.join(d, "app", "server.js")));

if (liveDir) {
	process.env.SEEDING_ROOT = liveDir;
	useDataRoot(liveDir);
	const live = path.join(liveDir, "app", "server.js");
	console.log(`  server code   : live from ${live}`);
	require(live).main([]);
} else {
	// Embedded server; the project files must still be on disk beside the exe.
	const root = dirs.find(d => fs.existsSync(path.join(d, "config", "majors.json"))) || path.dirname(process.execPath);
	process.env.SEEDING_ROOT = root;
	useDataRoot(root);
	console.log(`  server code   : embedded; project folder ${root}`);
	require("./server.js").main([]);   // embedded at compile time
}
