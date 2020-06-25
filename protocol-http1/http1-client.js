var u = require('utilities.js');

// Binds a node to a url, allowing the node to send GETS and SETS to that url
module.exports = require['http1-client'] = function add_http_client({node, url, prefix}) {
    url = url       || 'https://localhost:80/'
    prefix = prefix || '/*'
    var enabled = true;

    // Make a fake pipe object
    // The real ones check acks and synchronization and such
    let pipe = {
        node,
        id: u.random_id(), 
        send: send,
        recv: function(args) {
            args.origin = pipe;
            console.log("Passing to node: ", args)
            node[args.method](args);
        },
        remote: true,
        connection: "http",
        them: "server"
    };

    node.bind(prefix, pipe)
    
    function send(args) {
        if (args.method === 'get')
            send_get(args)

        else if (args.method === 'set')
            send_set(args)

        else
            console.info('No http1 implementation for method', args.method.toUpperCase())
    }
    // Read sets from a persistent stream
    function sets_from_stream(stream, callback, finished) {
        // Set up a reader
        let reader = stream.getReader()
        let decoder = new TextDecoder('utf-8')
        let buffer = '';
        let headers = false;
        let patches = [];
        reader.read().then(function read ({value, done}) {
            if (done) {
                // subscription was closed
                if (buffer.trim().length)
                    console.debug("Connection was closed. Remaining data in buffer:", buffer);
                else
                    console.debug("Connection was closed. Buffer was empty.")
                finished();
                return;
            }
            const chunkStr = value ? decoder.decode(value) : "";
            // Remove newlines at the beginning, maybe unnecessary
            buffer = (buffer + chunkStr).trimStart();
            if (value)
                console.debug(`Got a chunk of length ${chunkStr.length}. Current buffer:`);
            else
                // If there's no new chunk then we must have had some data left over after a successful parse
                console.debug("Reading on unchanged buffer:")
            console.debug(buffer);
            // If we haven't parsed headers yet, try to parse headers.
            if (!headers) {
                console.debug("Trying to parse headers...")
                const parsedH = parse_headers();
                if (parsedH) {
                    headers = parsedH.headers;
                    // Take the parsed headers out of the buffer
                    buffer = buffer.substring(parsedH.consumeLength);
                    console.debug("Success. Headers:", headers)
                } else {
                    console.debug("Failed to parse headers. We probably don't have enough.")
                }
            }
            if (headers)
                console.debug("Trying to parse patches...")
            // Try to parse patches. parse_patches returns boolean
            if (headers && parse_patches()) {
                console.debug("Success. Patches:", patches)
                // We have a complete message ... 
                let msg = {
                    version: headers.version ? JSON.parse(headers.version) : null,
                    parents: headers.parents ? {} : null,
                    patches: (patches && patches.length) ? patches.slice() : null
                };
                if (headers.parents)
                    headers.parents.split(", ").forEach(x => msg.parents[JSON.parse(x)] = true)
                console.debug("Assembled complete message: ", msg);
                setTimeout(callback, 0, msg);
                headers = false;
                patches = [];
                // We've gotten a SET, but actually there might be more still in the buffer.
                // We have to keep reading messages until we fail, and only then can we look for the next chunk.
                console.debug("Restarting in current buffer...")
                return read({value: false, done: false});
            } else {
                if (headers)
                    console.debug("Couldn't parse patches. We probably don't have enough.")
                console.debug("Waiting for next chunk to continue reading")
                return reader.read().then(read);
            }
            
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
                console.debug("Got an absolute body")
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
                    if (!parsePatchHeaders) {
                        console.debug("Failed to parse patch headers!")
                        return false;
                    }
                    const patchHeaders = parsePatchHeaders.headers;
                    const headerLength = parsePatchHeaders.consumeLength;
                    // assume we have content-length...
                    const length = parseInt(patchHeaders['content-length']);
                    // Does our current buffer contain enough data that we have the entire patch?
                    if (buffer.length < headerLength + length) {
                        console.debug("Buffer is too small to contain the rest of the patch...")
                        return false;
                    }
                    // Assume that content-range is of the form 'json .index'
                    const r = patchHeaders['content-range']
                    const patchRange = r.startsWith("json ") ? r.substring(5) : r;
                    const patchValue = buffer.substring(headerLength, headerLength + length);
                    // We've got our patch!
                    patches.push(`${patchRange} = ${patchValue}`);
                    buffer = buffer.substring(headerLength + length);
                    console.debug(`Successfully parsed a patch. We now have ${patches.length}/${headers.patches}`);
                }
                console.debug("Parsed all patches.")
                return true;
            }
        }
    }
    function send_get (msg) {
        var h = {}
        if (msg.version) h.version = JSON.stringify(msg.version)
        if (msg.parents) h.parents = Object.keys(msg.parents).map(JSON.stringify).join(', ')
        if (msg.subscribe) h.subscribe = "keep-alive"
        const sendUrl = new URL(msg.key, url);
        function trySend(waitTime) {
            console.log(`Fetching ${sendUrl}`);
            const controller = new AbortController();
            fetch(sendUrl, {method: 'GET',
                            mode: 'cors',
                            headers: new Headers(h),
                            signal: controller.signal})
                .then(function (res) {
                    if (!res.ok) {
                        console.error("Fetch failed!", res)
                        return
                    }
                    sets_from_stream(res.body, 
                        callback = setMessage => {
                            // When acking and pruning is disabled, the first SET implies a welcome.
                            let resource = node.resource_at(msg.key)
                            let welcomed = resource.we_welcomed;
                            if (!welcomed[pipe.id]) {
                                welcomed[pipe.id] = {
                                    id: pipe.id,
                                    connection: pipe.connection,
                                    them: pipe.them
                                }
                            }
                            resource.weve_been_welcomed = true;
                            // Insert the method and key into this
                            setMessage.method = "set";
                            setMessage.key = msg.key;
                            pipe.recv(setMessage);
                        },
                        finished = () => {
                            // Maybe close the fetch?? idk
                            console.warn(`Subscription to ${msg.key} ended by remote host`);
                        }
                    );
                })
                .catch(function (err) {
                    console.error("Fetch GET failed: ", err)
                    // Exponential backoff
                    setTimeout(() => trySend(Math.min(waitTime * 5, 100000)), waitTime)
                })
        }
        trySend(100);
        
    }
    function send_set (msg) {
        var h = {
            'content-type': 'application/json',
            'merge-type': 'sync9'
        }
        if (msg.version) h.version = JSON.stringify(msg.version)
        if (msg.parents) h.parents = Object.keys(msg.parents).map(JSON.stringify).join(', ')
        if (msg.subscribe) {}

        let body = msg.patch;
        if (msg.patches) {
            // Write patches as pseudoheaders
            body = msg.patches.map(patch => {
                // We should use the sync9 patch parser
                const split = patch.match(/(.*?)\s*=\s*(.*)/); // (...) = (...)
                const length = `content-length: ${split[2].length}`;
                const range = `content-range: json ${split[1]}`;
                return `${length}\n${range}\n\n${split[2]}\n`
            }).join("\n");
            h.patches = msg.patches.length;
        }
        const sendUrl = new URL(msg.key, url);
        function trySend(waitTime) {
            fetch(sendUrl, {method: 'PUT',
                            body: body,
                            mode: 'cors',
                            headers: new Headers(h)})
                .then(function (res) {
                    res.text().then(function (text) {
                        console.log('send_set got a ', res.status, text)
                    })
                })
                .catch(function (err) {
                    console.error("Fetch SET failed: ", err);
                    // Exponential backoff
                    setTimeout(() => trySend(Math.min(waitTime * 5, 100000)), waitTime)
                });
        }
        trySend(20);
    }
    return {
        pipe,
        enabled() {return enabled},
        enable()  {nlog('ENABLING PIPE', pipe.id); enabled = true; connect()},
        disable() {nlog('DISABLING PIPE',pipe.id); enabled = false; },
        toggle()  {if (enabled) {disable()} else enable()}
    }
}