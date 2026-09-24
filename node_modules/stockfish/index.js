/// License: MIT

"use strict";

///NOTE: If enginePath is not passed in, it will use the default stockfish.js engine.
///      If cb is not passed in, it will return a Promise.
function initEngine(enginePath, cb)
{
    if (typeof enginePath === "function") {
        cb = enginePath;
        enginePath = null;
    }
    
    var fs = require("fs");
    var p = require("path");
    var pathToEngine = findDefaultEngine(enginePath);
    
    var ext = p.extname(pathToEngine);
    var basepath = pathToEngine.slice(0, -ext.length);
    var wasmPath = basepath + ".wasm";
    var basename = p.basename(basepath);
    var engineDir = p.dirname(pathToEngine);
    var buffers = [];
    
    var INIT_ENGINE = require(pathToEngine);
    
    var res;
    var rej;
    
    var engine = {
        locateFile: function (path)
        {
            if (path.indexOf(".wasm") > -1) {
                if (path.indexOf(".wasm.map") > -1) {
                    /// Set the path to the wasm map.
                    return wasmPath + ".map";
                }
                /// Set the path to the wasm binary.
                return wasmPath;
            } else {
                return pathToEngine;
            }
        },
    };
    
    function onDone(err)
    {
        if (typeof cb === "function") {
            cb(err, engine);
        } else if (rej && res) {
            if (err) {
                rej(err);
            } else {
                res(engine);
            }
        } else if (err) {
            throw new Error(err);
        }
    }
    
    function getVersion()
    {
        return require("./package.json").buildVersion;
    }
    
    function findDefaultEngine(path)
    {
        var filename = "stockfish.js";
        if (path) {
            /// Check if the path is a keyword.
            switch(path.toLowerCase()) {
                case "full":
                    filename = "stockfish-" + getVersion() + ".js";
                    break;
                case "lite":
                    filename = "stockfish-" + getVersion() + "-lite.js";
                    break;
                case "single":
                    filename = "stockfish-" + getVersion() + "-single.js";
                    break;
                case "lite-single":
                case "single-lite":
                    filename = "stockfish-" + getVersion() + "-lite-single.js";
                    break;
                case "asm":
                    filename = "stockfish-" + getVersion() + "-asm.js";
                    break;
                default:
                    /// If it is not a keyword, then it should be the path to the engine, so use that.
                    return p.resolve(process.cwd(), path);
            }
        }
        path = p.join(__dirname, "bin", filename);
        
        if (fs.existsSync(path)) {
            return path;
        }
        
        path = p.join(__dirname, "src", filename);
        
        if (fs.existsSync(path)) {
            return path;
        }
        
        throw new Error("Cannot find " + filename + ". Please provide the path to the engine. You may need to build the engine first.");
    }
    
    /// We have to manually assemble the WASM parts, if the engine is split into parts.
    fs.readdirSync(engineDir).sort().forEach(function (path)
    {
        ///NOTE: These could be out of order without zero padding.
        if (path.startsWith(basename + "-part-") && path.endsWith(".wasm")) {
            buffers.push(fs.readFileSync(p.join(engineDir, path)));
        }
    });
    
    if (buffers.length) {
        engine.wasmBinary = Buffer.concat(buffers);
    }
    
    if (typeof INIT_ENGINE !== "function") {
        throw new Error("Could not load the engine correctly.");
    }
    
    INIT_ENGINE()(engine).then(function checkIfReady()
    {
        
        if (engine._isReady) {
            if (!engine._isReady()) {
                return setTimeout(checkIfReady, 10);
            }
            delete engine._isReady;
        }
        
        engine.sendCommand = function (cmd)
        {
            /// Not sure why this needs to be async.
            setImmediate(function ()
            {
                engine.ccall("command", null, ["string"], [cmd], {async: /^go\b/.test(cmd)})
            });
        };
        
        onDone();
    });
        
    if (typeof cb === "function") {
        return engine;
    }
    
    return new Promise(function onCreate(resolve, reject)
    {
        res = resolve;
        rej = reject;
    });
}

module.exports = initEngine;
