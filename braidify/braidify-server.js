var assert = require('assert')

// Write an array of patches into the pseudoheader format.
function generate_patches(res, patches) {
    for (let patch of patches) {
        assert(typeof patch.unit    === 'string')
        assert(typeof patch.range   === 'string')
        assert(typeof patch.content === 'string')
    }

    // This will return something like:
    // Patches: n
    // 
    // content-length: 21
    // content-range: json .range
    //
    // {"some": "json object"}
    //
    // content-length: x
    // ...
    var result = `Patches: ${patches.length}\r\n`
    for (let patch of patches)
        result += `\r
content-length: ${patch.content.length}\r
content-range: ${patch.unit} ${patch.range}\r
\r
${patch.content}\r
`
    return result
}


// This function reads num_patches in pseudoheader format from a
// ReadableStream and then fires a callback when they're finished.
function parse_patches (req, cb) {
    // Todo: make this work in the case where there is no Patches: header, but
    // Content-Range is still set, nonetheless.

    var num_patches = req.headers.patches,
        stream = req

    let patches = []
    let buffer = ""
    if (num_patches === 0)
        return cb(patches)

    stream.on('data', function parse (chunk) {
        // Merge the latest chunk into our buffer
        buffer = (buffer + chunk)

        // We might have an extra newline at the start.  (mike: why?)
        buffer = buffer.trimStart()

        while (patches.length < num_patches) {
            // First parse the patch headers.  It ends with a double-newline.
            // Let's see where that is.
            var headers_end = buffer.match(/(\r?\n)(\r?\n)/)

            // Give up if we don't have a set of headers yet.
            if (!headers_end)
                return

            // Now we know where things end
            var first_newline = headers_end[1],
                headers_length = headers_end.index + first_newline.length,
                blank_line = headers_end[2]

            // Now let's parse those headers.
            var headers = require('parse-headers')(
                buffer.substring(0, headers_length)
            )

            // We require `content-length` to declare the length of the patch.
            if (!('content-length' in headers)) {
                // Print a nice error if it's missing
                console.error('No content-length in', JSON.stringify(headers))
                process.exit(1)
            }

            var body_length = parseInt(headers['content-length'])

            // Give up if we don't have the full patch yet.
            if (buffer.length < headers_length + blank_line.length + body_length)
                return

            // XX Todo: support custom patch types beyond content-range.

            // Content-range is of the form '<unit> <range>' e.g. 'json .index'
            var [unit, range] = headers['content-range'].match(/(\S+) (.*)/).slice(1)
            var patch_content =
                buffer.substring(headers_length + blank_line.length,
                                 headers_length + blank_line.length + body_length)

            // We've got our patch!
            patches.push({unit, range, content: patch_content})

            buffer = buffer.substring(headers_length + blank_line.length + body_length)
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
    console.log('\n## Braidifying', req.method, req.url, req.headers.peer)

    // First, declare that we support Patches and JSON ranges.
    res.setHeader('Range-Request-Allow-Methods', 'PATCH, PUT')
    res.setHeader('Range-Request-Allow-Units', 'json')
    res.setHeader("Patches", "OK")

    // Extract braid info from headers
    var version = req.headers.version && JSON.parse(req.headers.version),
        parents = req.headers.parents && JSON.parse('['+req.headers.parents+']'),
        peer = req.headers['peer'],
        url = req.url.substr(1)

    // Parse the subscribe header
    var subscribe = req.headers.subscribe
    if (subscribe === 'true')
        subscribe = true

    // Define convenience variables
    req.version   = version
    req.parents   = parents
    req.subscribe = subscribe

    // Add the braidly request/response helper methods
    res.sendVersion = (stuff) => send_version(res, stuff, req.url, peer)
    req.patches = () => new Promise(
        (done, err) => parse_patches(req, (patches) => done(patches))
    )
    req.patchesJSON = () => new Promise(
        (done, err) => parse_patches(
            req,
            (patches) => done(patches.map(
                p => ({...p, content: JSON.parse(p.content)})
            ))
        )
    )
    req.startSubscription = res.startSubscription =
        function startSubscription (args = {}) {
            console.log('Starting subscription!!')
            console.log('Timeouts are:',
                        req.socket.server.timeout,
                        req.socket.server.keepAliveTimeout)

            res.isSubscription = true

            // Let's disable the timeouts
            req.socket.server.timeout = 0.0

            // We have a subscription!
            res.statusCode = 209
            res.setHeader("subscribe", req.headers.subscribe)
            res.setHeader('cache-control', 'no-cache, no-transform')

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

    next && next()
}

function send_version(res, data, url, peer) {
    var {version, parents, patches, body} = data

    function set_header (key, val) {
        if (res.isSubscription)
            res.write(`${key}: ${val}\r\n`)
        else
            res.setHeader(key, val)
    }
    function write_body (body) {
        if (res.isSubscription)
            res.write('\r\n' + body + '\r\n')
        else
            res.write(body)
    }

    console.log('sending version', {url, peer, version, parents, patches, body,
                                    subscription: res.isSubscription})

    // Validate that the body and patches are strings
    if (body)
        assert(typeof body === 'string')
    else {
        assert(patches)
        patches.forEach(p => assert(typeof p.content === 'string'))
    }

    // Write the headers or virtual headers
    for (var [header, value] of Object.entries(data)) {
        // Version and Parents get output in the Structured Headers format
        if (header === 'version')
            value = JSON.stringify(value)
        else if (header === 'parents')
            value = parents.map(JSON.stringify).join(", ")

        // We don't output patches or body yet
        else if (header === 'patches' || header == 'body')
            continue

        set_header(header, value)
    }

    // Write the patches or body
    if (patches)
        res.write(generate_patches(res, patches)) // adds its own newline
    else if (body) {
        set_header('content-length', body.length)
        write_body(body)
    } else {
        console.trace("Missing body or patches")
        process.exit()
    }

    // Add a newline to prepare for the next version
    // See also https://github.com/braid-org/braid-spec/issues/73
    if (res.isSubscription)
        res.write("\r\n")
}


module.exports = braidify
