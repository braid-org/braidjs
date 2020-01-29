// Example braid-peer as a web server

module.exports = require['http-server'] = function add_http_server(node, certificate, private_key) {
    var protocol = 'http',
        port = '3007'

    function http1_server () {
        var free_the_cors = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*"
        }
        var http = require('http')
        var server = http.createServer()
        server.listen(port, () => {
            console.log('Listening on ' + protocol + '://<host>:' + port)
        })
        server.on('request', (req, res) => {
            console.log("Got a request: {");
            for (let [k, v] of Object.entries(req.headers))
                console.log(`  ${k}: "${v}"`)
            console.log("}")

            switch (req.method) {
            case 'GET':
                console.log('Got a GET!!!')
                res.writeHead(209, {'subscribe': true, ...free_the_cors})
                res.write(`Version: "nooooodllle"
Parents:
Content-Type: application/json
Merge-Type: sync9
Content-Length: 81

[{"text": "Hi, everyone!",
  "author": {"type": "link", "value": "/user/tommy"}}]
`)
                // respond_sse(res.stream, req.url)
                break
            case 'OPTIONS':
                console.log('## We got the options~!!')
                res.writeHead(200, free_the_cors)
                res.end()
                // res.stream.end("forgotten")
                break
            case 'FORGET':
            case 'PUT':
            case 'PATCH':
                console.log("Got a set: {");
                for (let [k, v] of Object.entries(req.headers))
                    console.log(`  ${k}: "${v}"`)
                console.log("}")
                res.stream.respond({':status': 200, ...free_the_cors})
                res.stream.end("ack");
                break
            case 'DELETE':
                break
            default:
                res.stream.respond({':status': 404})
                res.stream.end()
                break
            }
        })

    }

    http1_server()

    function http2_server () {
        var http = require('http2'),
            fs = require('fs')
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

        var server_2 = http.createServer()

        server.on('error', (error) => {console.error(error)})

        server.on('session', function (session) {
            console.log("New Session!")
            session.on('close', () => console.log("Session closed"))
            session.on('goaway', () => console.log("Session goaway-ed"))
            session.on('error', (e) => console.log("Session errored:", e))
            session.on('timeout', () => console.log("Session timed out"))

            var pipe = require('./pipe.js')({node, send, connect})

            function send (args) {
                console.log('SEND!!! <implement me..> :/', args)
            }
            function connect () { pipe.connected() }

            var subscriptions_to_us = {}  // Every key that this session has gotton
            console.log('h2_serve: New connection')
            function h2_pubber (obj, t) {
                log('h2_pubber:', obj, t)
                var msg = {set: obj}
                if (t.version) msg.version = t.version
                if (t.parents) msg.parents = t.parents
                if (t.patch)   msg.patch =   t.patch
                if (t.patch)   msg.set    = msg.set.key
                msg = JSON.stringify(msg)

                if (global.network_delay) {
                    console.log('>>>> DELAYING!!!', global.network_delay)
                    obj = bus.clone(obj)
                    setTimeout(() => {conn.write(msg)}, global.network_delay)
                } else
                    session.write(msg)

                console.log('sockjs_s: SENT a', msg, 'to client')
            }

        })

        server.on('request', function (req, res) {
            console.log("Got a request: {");
            for (let [k, v] of Object.entries(req.headers))
                console.log(`  ${k}: "${v}"`)
            console.log("}")

            switch (req.method) {
            case 'GET':
                
                respond_sse(res.stream, req.url);
                break
            case 'OPTIONS':
                console.log('## We got the options~!!')
                res.stream.respond({':status': 200, ...free_the_cors})
                res.stream.end("forgotten")
                break
            case 'FORGET':
                if (!res.stream.session.open_gets[req.url]) {
                    res.stream.respond({':status': 404});
                    res.stream.end();
                } else {
                    res.stream.session.open_gets[req.url].close()
                    res.stream.respond({':status': 200, ...free_the_cors})
                    res.stream.end("forgotten");
                    delete res.stream.session.open_gets[req.url]
                }
                break
            case 'PUT':
            case 'PATCH':
                console.log("Got a set: {");
                for (let [k, v] of Object.entries(req.headers))
                    console.log(`  ${k}: "${v}"`)
                console.log("}")
                res.stream.respond({':status': 200, ...free_the_cors})
                res.stream.end("ack");
                break
            case 'DELETE':
                res.stream.respond({':status': 200, ...free_the_cors});
                res.stream.end("deeleeted de-1337-ed");
                break
            default:
                res.stream.respond({':status': 404})
                res.stream.end()
                break
            }
        })
        server.listen('3007', () => console.log(`Server listening!`));
    }
}