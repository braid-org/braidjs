// Example braid-peer as a web server
const http = require('http2');
const fs = require('fs');
const assert = require('assert');

module.exports = require['http-server'] = function add_http_server(node, ssl, port) {
    var free_the_cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers":
        "Origin, X-Requested-With, Content-Type, Accept"
    }

    var server = http.createSecureServer({
        // ca: (fs.existsSync(this.options.certs.certificate_bundle)
        //      && require('split-ca')(this.options.certs.certificate_bundle)),
        key:  private_key,
        cert: certificate,
        ciphers: "ECDHE-RSA-AES256-SHA384:DHE-RSA-AES256-SHA384"
            + ":ECDHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA256"
            + ":ECDHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA256"
            + ":HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA",
        honorCipherOrder: true
    })

    server.on('error', (error) => {console.error(error)})

    server.on('session', function (session) {
        console.log("New Session!")
        session.on('close', () => console.log("Session closed"))
        session.on('goaway', () => console.log("Session goaway-ed"))
        session.on('error', (e) => console.log("Session errored:", e))
        session.on('timeout', () => console.log("Session timed out"))

        let pipe = require('./pipe.js')({node, send, connect, disconnect})
        let streams = {};

        function send (args) {
            // The args are super important here. Since we can't actually send things without a stream,
            // we have to pick one of the existing streams that has been created as a response to a GET (or maybe a SET?)
            // and send the response over that, first using stream.additionalHeaders(...) and then writing data into the stream
        }
        function connect () { pipe.connected() }
        function disconnect () { pipe.disconnected() }
        
        session.on('stream', (stream, headers) => {
            stream.on('error', (e) => console.log("Stream errored:", e))
            const method = headers[':method']
            const path = headers[':path']

            console.log("Stream opened with headers", headers)

            // Copy headers that we can always count on to be replicated
            let msg = {
                key: path,
                version: headers['version'],
                parents: headers['parents'],
                subscribe: headers['subscribe']
            }
            switch (method) {
                case "GET":
                    msg.method = "get";
                    stream.subscribe = msg.subscribe;
                    if (streams[key] && !streams[key].closed)
                        streams[key].close();
                    streams[key] = stream; // Close any existing streams dedicated to this key.
                    break;
                case "PUT": // This is a SET
                    assert(headers['merge-type'] == "sync9")
                    msg.method = "set"
                    if (headers['patches']) {
                        //
                    }
                    break;
                default:
                    stream.respond({':status': 501});
                    stream.end();
            }
            
        })
        function httpResponse(msg) {
            // 404 = GET, doesn't exist
            if (msg.method == "get" && !node.resources[msg.key])
                return 404;
            // 209 = GET, Subscribe
            if (msg.method == "get" && msg.subscribe)
                return 209;
            // 201 = SET, doesn't exist
            if (msg.method == "set" && !node.resources[msg.key])
                return 201;
            // 416 = SET, exists, bad patch format
            if (msg.method == "set") {}
            // 200 = GET or SET
            return 200;
        }

    })
    server.listen(port, () => console.log(`Server listening!`));
}