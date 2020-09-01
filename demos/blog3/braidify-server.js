// Write an array of patches into the pseudoheader format.
function generate_patches(res, patches) {
    var patches_as_strings = false
    // This will return something like:
    // Patches: n
    // 
    // content-length: 14 // patch #1
    // content-range: json=.range (or) json=[indices]
    //
    // ["json object"]
    //
    // content-length: x // patch #2
    // ...
    let out = `Patches: ${patches.length}\n`
    for (let patch of patches) {
        out += "\n"
        if (patches_as_strings) {
            // This should be rewritten to use sync9's patch parser.
            var split = patch.match(/(.*?)\s*=\s*(.*)/)
            assert(split.length == 3)
            var range = split[1]
            var change = split[2]
        } else {
            console.log('patch is', patch)
            var range = patch.range,
                change = patch.value
            // if (res.getHeader('content-type') === 'application/json')
            //     change = JSON.stringify(change)
        }
        console.log({range, change})
        
        out += `content-length: ${change.length}\n`
        out += `content-range: json=${range}\n`
        out += "\n"
        out += `${change}\n`
    }
    return out
}


// This function reads num_patches in pseudoheader format from a
// ReadableStream and then fires a callback when they're finished.
function parse_patches (req, cb) {
    var num_patches = req.headers.patches,
        stream = req

    let patches = []
    let curr_patch = ""
    if (num_patches === 0)
        return cb(patches)

    stream.on('data', function parse (chunk) {
        while (patches.length < num_patches) {
            // Merge the latest chunk into our buffer
            curr_patch = (curr_patch + chunk)

            // We might have an extra newline at the start.  (mike: why?)
            curr_patch = curr_patch.trimStart()

            // First parse the patch headers.  It ends with a double-newline.
            // Let's see where that is.
            var p_headers_length = curr_patch.indexOf("\n\n")

            // Give up if we don't have a set of headers yet.
            if (curr_patch.indexOf("\n\n") === -1)
                return

            // Now let's parse those headers.
            var p_headers = require('parse-headers')(
                curr_patch.substring(0, p_headers_length)
            )

            // Content-length tells us how long the body of the patch will be.
            // TODO: Support Transfer-Encoding: Chunked in addition to content-length?
            assert(p_headers['content-length'])
            var body_length = parseInt(p_headers['content-length'])

            // Give up if we don't have the full patch yet.
            if (curr_patch.length < p_headers_length + 2 + body_length)
                return

            // Assume that content-range is of the form 'json=.index'
            var patch_range = p_headers['content-range'].startsWith("json=") ?
                p_headers['content-range'].substring(5) :
                p_headers['content-range']
            var patch_value =
                curr_patch.substring(p_headers_length + 2,
                                     p_headers_length + 2 + body_length)

            // console.log('headers is', req.headers)
            // if (req.headers['content-type'] === 'application/json')
            //     patch_value = JSON.parse(patch_value)

            // We've got our patch!
            patches.push({range: patch_range, value: patch_value})

            curr_patch = curr_patch.substring(p_headers_length + 2 + body_length)
        }

        // We got all the patches!  Pause the stream and tell the callback!
        stream.pause()
        cb(patches)
    })
    stream.on('end', () => {
        // If the stream ends before we get everything, then return what we
        // did receive
        console.error('Stream ended!')
        if (patches.length !== num_patches)
            console.error(`Got an incomplete PUT: ${patches.length}/${num_patches} patches were received`)
    })
}

function braidify (req, res, next) {
    console.log('\n## Braidifying', req.method, req.url, req.headers.client)

    // First, declare that we support CORS and JSON ranges!
    res.setHeader('Range-Request-Allow-Methods', 'PATCH, PUT')
    res.setHeader('Range-Request-Allow-Units', 'json')
    res.setHeader("Patches", "OK")

    // Extract braid info from headers
    var version = req.headers.version && JSON.parse(req.headers.version),
        parents = req.headers.parents && JSON.parse('['+req.headers.parents+']'),
        client = req.headers['client'],
        url = req.url.substr(1)

    // Parse the subscribe header as one of these forms:
    //
    //   keep-alive
    //   keep-alive=number
    //
    var subscribe = req.headers.subscribe
    if (subscribe) {
        let match = req.headers.subscribe.match(/keep-alive(=\w+)?/)
        if (match)
            subscribe =
                match[1] ? {keep_alive: true} : {keep_alive: parseInt(match[1])}
    }

    // Define convenience variables
    req.version   = version
    req.parents   = parents
    req.subscribe = subscribe

    // Add the braidly request/response helper methods
    res.sendVersion = (stuff) => send_version({res: res, ...stuff})
    res.sendVersion = (stuff) => send_version({res: res, ...stuff})
    req.patches = () => new Promise(
        (done, err) => parse_patches(req, (patches) => done(patches))
    )
    req.jsonPatches = () => new Promise(
        (done, err) => parse_patches(
            req,
            (patches) => done(patches.map(
                p => ({...p, value: JSON.parse(p.value)})
            ))
        )
    )
    req.startSubscription = res.startSubscription =
        function startSubscription (args) {
            console.log('Starting subscription!!')
            console.log('Timeouts are:',
                        req.socket.server.timeout,
                        req.socket.server.keepAliveTimeout)

            // Let's disable the timeouts
            req.socket.server.timeout = 0.0
            req.setTimeout(0, x => console.log('Request timeout!', x))
            res.setTimeout(0, x => console.log('Response timeout!', x))

            // We have a subscription!
            res.statusCode = 209
            res.setHeader("subscribe", req.headers.subscribe)
            res.setHeader('cache-control', 'no-cache, no-transform')
            res.setHeader('content-type', 'application/json')

            var connected = true
            function disconnected () {
                console.log(`Connection closed on ${req.url}`)

                if (!connected) return
                connected = false

                // Now call the callback
                if (args.onClose)
                    args.onClose()
            }

            res.on('close',   disconnected)
            res.on('finish',  disconnected)
            req.on('abort',   disconnected)
        }

    next()
}

function send_version({res, version, parents, patches, body}) {
    console.log('sending version', {version, parents, patches, body})
    if (body) assert(typeof body === 'string');
    (patches||[]).forEach(p=>assert(typeof p.value === 'string'))
    if (version)
        res.write(`Version: ${JSON.stringify(version)}\n`)
    if (parents && parents.length) {
        res.write(`Parents: ${parents.map(JSON.stringify).join(", ")}\n`)
    }

    res.write("Content-Type: application/json\n")
    res.write("Merge-Type: sync9\n")
    if (patches)
        res.write(generate_patches(res, patches)) // adds its own newline
    else if (body) {
        // if (res.getHeader('content-type') === 'application/json')
        //     body = JSON.stringify(body)
        res.write('Content-Length: ' + body.length + '\n')
        res.write('\n' + body + '\n')
    } else {
        console.trace("Missing body or patches")
        process.exit()
    }
    res.write("\n")
}


module.exports = braidify
