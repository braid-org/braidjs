// Example braid-peer as a web server
//const fs = require('fs');
const assert = require('assert');
const pipe = require('../pipe.js');
const parseHeaders = require('parse-headers');
var u = require('../util/utilities.js')
module.exports = function add_http_server(node, server, fileCb) {
    function writePatches(patches) {
        let out = `patches: ${patches.length}\n`
        for (let patch of patches) {
            out += "\n"
            const split = patch.match(/(.*?)\s*=\s*(.*)/); // (...) = (...)
            assert(split.length == 3)
            const range = split[1];
            const change = split[2];
            out += `content-length: ${change.length}\n`;
            out += `content-range: json ${range}\n`;
            out += "\n";
            out += `${change}\n`;
        }
        return out;
    }
    function readPatches(n, stream, cb) {
        let patches = [];
        let curPatch = "";
        stream.on('data', (chunk) => {
            // Otherwise we'll have extra newline at the start. I'm not sure if this would mess up parse-headers.
            curPatch = (curPatch + chunk).trimStart();
            // Find out if we have an entire patch.
            // This means: first, we look for a double newline.
            const headerLength = curPatch.indexOf("\n\n");
            if (headerLength == -1) return;
            // Now that we have all the headers, we have to parse them and look for content-length
            // TODO: Support Transfer-Encoding: Chunked
            const headers = parseHeaders(curPatch.substring(0, headerLength));
            assert(headers['content-length']);
            const length = headers['content-length'];
            // Does our current buffer contain enough data that we have the entire patch?
            if (headerLength + 2 + length < curPatch.length) return;
            // Assume that content-range is of the form 'json .index'
            const patchRange = headers['content-range'].startsWith("json ") ?
                headers['content-range'].substring(5) :
                headers['content-range'];
            const patchValue = curPatch.substring(headerLength + 2, headerLength + 2 + length);
            // We've got our patch!
            patches.push(`${patchRange} = ${patchValue}`);
            curPatch = curPatch.substring(headerLength + 2 + length);
            if (patches.length == n) {
                stream.pause();
                cb(patches);
            }
        });
        stream.on('end', () => {
            // If the stream ends before we get everything, then return what we did receive
            if (patches.length != n) {
                console.warn(`Got an incomplete PUT: ${patches.length}/${n} patches were received`);
                cb(patches);
            }
        })
    }
    function responsePipe(res, keepAlive) {
        // Construct pipe
        const reqPipe = pipe(
            {   node,
                id: null,
                send: sendVersions,
                connect: connect,
                disconnect: disconnect
            });

        //const writeHeaderHttpStyle = (header, value)
        // The send function has to handle the different ways that we might be encoding data into http/1
        const allowedMethods = ["set", "welcome"]
        function sendVersions (args) {
            console.log("Sending a response:", args)
            if (!keepAlive)
                disconnect();
            if (!allowedMethods.includes(args.method))
                return;
            // Rewrite the arguments into headers and body (or text stream)
            // And send it back through `res`.
            let versions = [];
            if (args.method == "welcome") {
                versions = args.versions.map(f => {return {
                    version: f.version,
                    parents: f.parents,
                    patches: f.changes // The node object should be changed to call this patches
                }})
            } else if (args.method == "set") {
                versions = [{
                    version: args.version,
                    parents: args.parents,
                    patches: args.patches
                }]
            }
            if (keepAlive) {
                // If keepAlive is set, then we're technically writing headers into the body.
                // Every version should be split by lines.
                // We'll choose to put this at the end, and content-length should make the meaning clear.
                for (let version of versions) {
                    res.write(`Version: ${JSON.stringify(version.version)}\n`)
                    res.write(`Parents: ${version.parents.map(JSON.stringify).join(", ")}\n`)
                    res.write("Merge-Type: sync9\n")
                    res.write("Content-Type: application/json\n")
                    res.write(writePatches(version)+"\n")
                    res.write("\n")
                }
            }
        }
        function connect () { reqPipe.connected() }
        function disconnect () { reqPipe.disconnected(); res.end(); }
        return reqPipe;
    }
    function handleHttpResponse(req, res) {
        console.log("Got a request:", req.method, req.url);
        const ip = req.socket.remoteAddress;
        const done = parsedMessage => {
            let p = responsePipe(res, parsedMessage.subscribe);
            p.recv({method: "hello", my_name_is: ip, connection: u.random_id()})
            p.recv(parsedMessage);
            return p;
        }
        // Copy headers that have the same value in HTTP as Braid
        let msg = {
            key: req.url,
            subscribe: req.headers['subscribe']
        }
        if (req.headers.version)
            msg.version = JSON.parse(req.headers['version'])
        if (req.headers.parents)
           msg.parents = req.headers['parents'].split(", ").map(JSON.parse)
        if (req.method == "GET") {
            if (!node.resources[msg.key] && !node._default_val_for(msg.key)) {
                // Assume this is a file request
                fileCb(req, res);
                return;
            }
            let status = 200;
            if (msg.subscribe) {
                status = 209;
                res.setHeader("subscribe", msg.subscribe)
                res.setHeader('content-type', 'text/event-stream');
                res.setHeader('cache-control', 'no-cache, no-transform');
            }
            res.statusCode = status;
            msg.method = "get"
            done(msg);
        }
        else if (req.method == "PUT") {
            assert(req.headers["content-type"] == "application/json")
            assert(req.headers["merge-type"] == "sync9")
            let status = 200;
            if (!node.resources[msg.key])
                status = 201;
            res.statusCode = status;
            msg.method = "set"
            // Parse patches
            readPatches(req.headers["patches"], res, (patches) => {
                msg.patches = patches;
                res.setHeader("Patches", "OK");
                done(msg);
            })
        }
    }
    server.on('request', handleHttpResponse);
}
