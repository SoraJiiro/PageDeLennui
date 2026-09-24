#!/usr/bin/env node

/// License: MIT

/// Creates a symlink called stockfish.js of the full version.

"use strict";

var fs = require("fs");
var p = require("path");

var version = require("../package.json").buildVersion;

var binDir = p.join(__dirname, "..", "bin");
var jsLinkPath = p.join(binDir, "stockfish.js");
var wasmLinkPath = p.join(binDir, "stockfish.wasm");

/// Find existing files
var jsFile = p.join(binDir, "stockfish-" + version + ".js");
var wasmFile = p.join(binDir, "stockfish-" + version + ".wasm");

/// Remove existing target (file or symlink) if present
try {
    fs.unlinkSync(jsLinkPath);
} catch (e) {}
try {
    fs.unlinkSync(wasmLinkPath);
} catch (e) {}

/// Try symlink first (most efficient)
try {
    var relSource = p.relative(binDir, jsFile);
    fs.symlinkSync(relSource, jsLinkPath, "file");
    var relWASM = p.relative(binDir, wasmFile);
    fs.symlinkSync(wasmFile, wasmLinkPath, "file");
} catch (err) {
    /// Fallback to copy if symlink fails
    if (process.platform === "win32" && err.code === "EPERM") {
        console.warn("Warning: Symlink creation failed on Windows.\nThis can happen if Developer Mode is not enabled.\nTo enable: Settings > Update & Security > For developers > Developer Mode.\nFalling back to copy...");
    } else {
        console.log("Symlink failed (" + err.message + "). Falling back to copy...");
    }

    fs.copyFileSync(jsFile, jsLinkPath);
    fs.copyFileSync(wasmFile, wasmLinkPath);
}
