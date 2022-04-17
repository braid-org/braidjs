// This file is still being used with the sync9-chat demo, but Mike will
// refactor it soon.

// Example braid-peer as a web server
//const fs = require('fs');
const assert = require('assert');
//const pipe = require('../pipe.js');
const parseHeaders = require('parse-headers');
var u = require('../util/utilities.js');

module.exports = function add_http_server(node) {
    // Write an array of patches into the pseudoheader format.
    const openPipes = {};
    function writePatches(patches) {
        // This will return something like:
        // Patches: n
        // 
        // content-length: 14 // patch #1
        // content-range: json .range (or) json [indices]
        //
        // ["json object"]
        //
        // content-length: x // patch #2
        // ...
        let out = `patches: ${patches.length}\n`
        for (let patch of patches) {
            out += "\n"
            // This should be rewritten to use sync9's patch parser.
            const split = patch.match(/(.*?)\s*=\s*(.*)/);
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
    // This function reads n patches in pseudoheader format from a ReadableStream
    //   and then fires a callback when they're finished
    // Might be nice to use a promise here
    function readPatches(n, stream, cb) {
        let patches = [];
        let curPatch = "";
        if (n == 0)
            return cb(patches);
        stream.on('data', function parse (chunk) {
            // Otherwise we'll have extra newline at the start. I'm not sure if this would mess up parse-headers.
            curPatch = (curPatch + chunk).trimStart();
            // Find out if we have an entire patch.
            // This means: first, we look for a double newline.
            const headerLength = curPatch.indexOf("\n\n");
            if (headerLength == -1) return;
            // Now that we have all the headers, we have to parse them and look for content-length
            // TODO: Support Transfer-Encoding: Chunked (maybe?)
            const headers = parseHeaders(curPatch.substring(0, headerLength));
            assert(headers['content-length']);
            const length = parseInt(headers['content-length']);
            // Does our current buffer contain enough data that we have the entire patch?
            if (curPatch.length < headerLength + 2 + length) return;
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
            } else 
                // Try parsing for another message in the current buffer
                parse("");
        });
        stream.on('end', () => {
            // If the stream ends before we get everything, then return what we did receive
            if (patches.length != n) {
                console.warn(`Got an incomplete PUT: ${patches.length}/${n} patches were received`);
                cb(patches);
            }
        })
    }
    // Construct a (fake) pipe object that allows writing data into a persistent stream
    function responsePipe(res, id) {
        // Construct pipe
        const pipe = {
            id: id,
            send: sendVersions,
            disconnect: disconnect
            //connection: "http", // These are supposed to be unique ids of some sort :)
        };

        const allowedMethods = ["set", "welcome"]
        // The node will call this method with JSON messages
        function sendVersions (args) {
            let symbol = allowedMethods.includes(args.method) ? '-=>' : '-|>';
            if (args.method === 'error')
                symbol = '-!>'
            if (args.method != "ping" && args.method != "pong") {
                nlogf('H1', 'server', symbol, id.slice(0,6).padEnd(6), args);
            }
            // The protocol doesn't support things like acks and fissures
            if (!allowedMethods.includes(args.method)) {
                return;
            }
            // Extract the three relevant fields from JSON message
            let versions = [];
            if (args.method == "welcome") {
                versions = args.versions.map(f => ({
                    version: f.version,
                    parents: f.parents,
                    patches: f.patches
                }))
            } else if (args.method == "set") {
                versions = [{
                    version: args.version,
                    parents: args.parents,
                    patches: args.patches
                }]
            }
            for (let version of versions) {
                if (version.version)
                    res.write(`Version: ${JSON.stringify(version.version)}\n`)
                if (Object.keys(version.parents).length)
                    res.write(`Parents: ${Object.keys(version.parents).map(JSON.stringify).join(", ")}\n`)
                
                res.write("Merge-Type: sync9\n")
                res.write("Content-Type: application/json\n")
                res.write(writePatches(version.patches)) // adds its own newline
                res.write("\n")
            }
        }
        function disconnect () {res.end(); }
        return pipe;
    }
    // The entry point of the server.
    // Listen for requests
    function handleHttpResponse(req, res) {
        // Apply hardcoded access control headers
        // The cors() method will return true if the request is an OPTIONS request
        // (It'll also respond 200 and end the stream)
        if (cors(req, res))
            return;
        // There should be a better way to do this.
        // Initially, this would take a message, create a pipe, and recv the message
        // But it turns out that in many cases you actually want to set some data on the node
        //   before it receives the message but after the pipe is created
        const create_pipe = (id) => {
            if (openPipes[id]) {
                console.error("ClientID collision!");
                return;
            }
            let pipe = responsePipe(res, id);
            openPipes[id] = {key: req.url, origin: pipe};
            res.on('close', () => {
                console.log(`Connection closed on ${req.url}`);
                assert(openPipes[id]);
                node.forget(openPipes[id]);
                delete openPipes[id];
            });
        };
        const recv = (id, msg) => {
            if (msg.method != "ping" && msg.method != "pong") {
                nlogf('H1', id.slice(0,6).padEnd(6), '=->', 'server', msg);
            }
            if (openPipes[id])
                msg.origin = openPipes[id].origin;
            return node[msg.method](msg);
        }
        // Copy headers that have the same value in HTTP as Braid
        let msg = {
            key: req.url
        }
        // Copy headers that need minor modifications but no additional conditionals
        if (req.headers.version)
            msg.version = JSON.parse(req.headers.version)
        if (req.headers.parents) {
            msg.parents = {};
            req.headers.parents.split(", ").forEach(x => msg.parents[JSON.parse(x)] = true)
        }
        // If we end up having more methods supported, maybe make this a switch
        if (req.method == "GET") {
            res.setHeader('cache-control', 'no-cache, no-transform');
            
            if (!req.headers.hasOwnProperty("subscribe")) {
                // Respond over plain http
                res.setHeader('content-type', 'text/json');
                res.statusCode = 200;
                // If the origin is just an id, then there will be no callback or subscription.
                msg.origin = {id: 'null-pipe'};
                // And the node will just return the value of the resource at the specified version 
                res.end(JSON.stringify(node.get(msg)));
                return;
            }
            // Set some headers needed to indicate a subscription.
            res.statusCode = 209;
            res.setHeader("subscribe", req.headers.subscribe)
            res.setHeader('content-type', 'text/braid-patches');
            // res.setHeader('connection', 'Keep-Alive');
            // Parse the subscribe header. Options are:
            // keep-alive=true    # this can actually be specified as just keep-alive, but we can support that later
            // keep-alive=false
            // keep-alive=number
            let subStr = req.headers.subscribe.match(/keep-alive=(\w+)/)[1];
            let sub = false;
            if (subStr == "true")
                sub = true;
            else if (subStr != "false") // It's a number
                sub = parseInt(subStr);
            msg.subscribe = {"keep-alive": sub};
            msg.method = "get"

            // Receive the request
            const clientID = `${req.headers['x-client-id'] || u.random_id()}=>${msg.key}`;
            create_pipe(clientID);
            // recv will call get(), which will return the value of the resource if successful and undefined otherwise
            let result = recv(clientID, msg);
            if (result == undefined)
                res.end(500);
        }
        else if (req.method == "PUT") {
            // We only support these headers right now...
            assert(req.headers["content-type"] == "application/json")
            assert(req.headers["merge-type"] == "sync9")
            let status = 200;
            if (!node.resources[msg.key])
                // If we don't have the resource, it'll be created.
                // We actually need to add a way to prevent clients from creating braid resources with the same names
                //   as file resources, which would make them unreadable.
                // I think we should instead make the server explicitly bind itself to some paths.
                status = 201;
            res.statusCode = status;
            msg.method = "set"
            // Parse patches
            // Try to read patches from the request body
            // req.headers.patches is the number of patches expected
            readPatches(req.headers.patches, req, (patches) => {
                // When finished, create a pipe.
                msg.patches = patches;
                res.setHeader("patches", "OK");
                const clientID = `${req.headers['x-client-id'] || u.random_id()}=>${msg.key}`;
                // recv will call node.set, which will return `version` if successful and undefined otherwise
                // TODO: Maybe return an error code from get/set?
                let result = recv(clientID, msg);
                if (result == undefined)
                    res.statusCode = 500;
                res.end();
            })
        }
    }
    function cors(req, res) {
        const free_the_cors = {
            "Access-Control-Allow-Origin": "*"
            ,"Access-Control-Allow-Methods": "OPTIONS, HEAD, GET, PUT"
            ,"Access-Control-Allow-Headers": "subscribe, x-client-id, version, parents, merge-type, content-type"
        };
        Object.entries(free_the_cors).forEach(x => res.setHeader(x[0], x[1]));
        if ( req.method === 'OPTIONS' ) {
            res.writeHead(200);
            res.end();
            return true;
        }
        return false;
    }
    process.on('SIGINT', function() {
        if (Object.keys(openPipes).length) {
            console.log("\nForgetting H1 connections:");
            Object.values(openPipes).forEach(sub => {
                console.log(`    pipe ${sub.origin.id} on resource${sub.key}`);
                node.forget(sub);
                sub.origin.disconnect();
            });
            console.log("Closing process");
        }   
        process.exit();
    });
    return handleHttpResponse;
}