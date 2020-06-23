var u = require('utilities.js');
// Example braid-peer as a web browser client

// To do:
//  - Copy the code from websocket-client into here, and modify it to fit HTTP
//  - The code below can all be used as helper functions

module.exports = require['http1-client'] = function add_http_client({node, url, prefix}) {
   
    url = url       || 'https://localhost:80/'
    prefix = prefix || '/*'
    client_creds = null;

    var pipe = require('pipe.js')(
        {   node,
            id: null, 
            send: send,
            connect: connect,
            disconnect: disconnect
        })
    node.bind(prefix, pipe)

    function send(args) {
        if (args.method === 'get')
            send_get(args)

        else if (args.method === 'set')
            send_set(args)

        else
            console.info('No http1 implementation for method', args.method.toUpperCase())
    }

    function connect () {
        pipe.connected()
    }
    function disconnect () {
        pipe.disconnected()
    }
    function sets_from_stream(stream, callback, finished) {
        // Set up a reader
        let reader = stream.getReader()
        let decoder = new TextDecoder('utf-8')
        let buffer = '';
        let headers = false;
        let patches = [];
        reader.read().then(function read ({done, chunk}) {
            if (done) {
                // subscription was closed
                finished();
                return;
            }
            buffer = (buffer + (chunk ? decoder.decode(chunk) : "")).trimStart();
            if (!headers) {
                const parsedH = parse_headers();
                if (parsedH) {
                    headers = parsedH.headers;
                    buffer = buffer.substring(parsedH.consumeLength);
                }
            }
            if (headers && parse_patches()) {
                // We have a complete message ... 
                let msg = {
                    version: JSON.parse(headers.version),
                    parents: headers['parents'].split(", ").map(JSON.parse),
                    patches: patches.slice()
                };
                setTimeout(callback, 0, msg);
                headers = false;
                patches = [];
            }
            return reader.read().then(read);
            
        });
        function parse_headers() {
            // This string could contain a whole response.
            // So first let's isolate to just the headers.
            const end_of_headers = buffer.indexOf('\n\n');
            if (end_of_headers == -1)
                return false;
            const stuff_to_parse = buffer.substring(0, end_of_headers)
    
            // Now let's grab everything from these headers
            var headers = {},
                regex = /([\w-]+): (.*)/g,
                temp
            while (temp = regex.exec(stuff_to_parse))
                headers[temp[1].toLowerCase()] = temp[2]
    
            return {headers: headers, consumeLength: end_of_headers + 2}
        }
        function parse_patches() {
            if (headers['content-length']) {
                // This message has "body"
                const length = headers['content-length'];
                if (h.length + length < buffer.length)
                    return false;
                // ... 
                // This behavior is not in the initial http1 spec, so we don't have to worry about it
            }
            if (headers.patches) {
                // Parse patches until we run out of patches to parse or get all of them
                while (patches.length < headers.patches) {
                    buffer = buffer.trimStart();
                    const parsePatchHeaders = parse_headers();
                    if (!parsePatchHeaders)
                        return false;
                    
                    const patchHeaders = parsePatchHeaders.headers;
                    const headerLength = parsePatchHeaders.consumeLength;
                    // assume we have content-length...
                    const length = patchHeaders['content-length'];
                    // Does our current buffer contain enough data that we have the entire patch?
                    if (headerLength + length < buffer.length)
                        return false;
                    // Assume that content-range is of the form 'json .index'
                    const r = headers['content-range']
                    const patchRange = r.startsWith("json ") ? r.substring(5) : r;
                    const patchValue = curPatch.substring(headerLength, headerLength + length);
                    // We've got our patch!
                    patches.push(`${patchRange} = ${patchValue}`);
                    buffer = buffer.substring(headerLength + length);
                }
                return true;
            }
        }
    }
    function send_get (msg) {
        var h = {}
        if (msg.version) h.version = msg.version
        if (msg.parents) h.parents = msg.parents.map(JSON.stringify).join(', ')
        if (msg.subscribe) h.subscribe = msg.subscribe;
        const sendUrl = new URL(msg.key, url);
        function trySend(waitTime) {
            console.log(`Fetching ${sendUrl}`)
            fetch(sendUrl, {method: 'GET', mode: 'cors',
                                        headers: new Headers(h)})
                .then(function (res) {
                    if (!res.ok) {
                        console.error("Fetch failed!", res)
                        return
                    }
                    sets_from_stream(res.body, 
                        callback = setMessage => {
                            // Insert the method and key into this
                            setMessage.method = "set";
                            setMessage.key = msg.key;
                            pipe.recv(setMessage);
                        },
                        finished = () => {
                            // Maybe close the fetch?? idk
                            console.log(`Subscription to ${msg.key} ended by remote host`);
                        }
                    );
                })
                .catch(function (err) {
                    console.log("Fetch GET failed: ", err)
                    setTimeout(() => trySend(Math.min(waitTime * 5, 10000)), waitTime)
                })
        }
        trySend(100);
        
    }

    function send_set (msg) {
        var h = {
            'content-type': 'application/json',
            'merge-type': 'sync9'
        }
        if (msg.version) h.version = msg.version
        if (msg.parents) h.parents = msg.parents.map(JSON.stringify).join(', ')
        if (msg.subscribe) {}

        let body = msg.patch;
        if (msg.patches) {
            body = msg.patches.map(p => {
                const split = patch.match(/(.*?)\s*=\s*(.*)/); // (...) = (...)
                const length = `content-length: ${split[2].length}`;
                const range = `content-range: json ${split[1]}`;
                return `${length}\n${range}\n\n${split[2]}\n`
            }).join("\n");
            h.patches = msg.patches.length;
        }
        const sendUrl = new URL(msg.key, url);
        function trySend(waitTime) {
            fetch(sendUrl, {method: 'PUT', body: body,
                                    headers: new Headers(h), mode: 'no-cors'})
                .then(function (res) {
                    res.text().then(function (text) {
                        console.log('send_set got a ', res.status, text)
                    })
                })
                .catch(function (err) {
                    console.log("Fetch SET failed: ", err);
                    setTimeout(() => trySend(Math.min(waitTime * 5, 10000)), waitTime)
                });
        }
        trySend(20);
    }
}