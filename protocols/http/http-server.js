var assert = require('assert')

// Write an array of patches into the pseudoheader format.
function generate_patches(res, patches) {
    // This will return something like:
    // Patches: n
    // 
    // content-length: 14 // patch #1
    // content-range: json .range (or) json=[indices]
    //
    // ["json object"]
    //
    // content-length: x // patch #2
    // ...
    var result = `Patches: ${patches.length}\n`
    for (let patch of patches) {
        result += "\n"
        console.log('patch is', patch)
        
        result += `content-length: ${patch.content.length}\n`
        result += `content-range: ${patch.unit} ${patch.range}\n`
        result += "\n"
        result += `${patch.content}\n`
    }
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
            var p_headers_length = buffer.indexOf("\n\n")

            // Give up if we don't have a set of headers yet.
            if (buffer.indexOf("\n\n") === -1)
                return

            // Now let's parse those headers.
            var p_headers = require('parse-headers')(
                buffer.substring(0, p_headers_length)
            )

            // Content-length tells us how long the body of the patch will be.
            // TODO: Support Transfer-Encoding: Chunked in addition to content-length?
            assert(p_headers['content-length'])
            var body_length = parseInt(p_headers['content-length'])

            // Give up if we don't have the full patch yet.
            if (buffer.length < p_headers_length + 2 + body_length)
                return

            // Content-range is of the form '<unit> <range>' e.g. 'json .index'
            var [unit, range] = p_headers['content-range'].match(/(\S+) (.*)/).slice(1)
            var patch_content =
                buffer.substring(p_headers_length + 2,
                                 p_headers_length + 2 + body_length)

            // console.log('headers is', req.headers)
            // if (req.headers['content-type'] === 'application/json')
            //     patch_content = JSON.parse(patch_content)

            // We've got our patch!
            patches.push({unit, range, content: patch_content})

            buffer = buffer.substring(p_headers_length + 2 + body_length)
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
    res.sendVersion = (stuff) => send_version(res, stuff)
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
        function startSubscription (args) {
            console.log('Starting subscription!!')
            console.log('Timeouts are:',
                        req.socket.server.timeout,
                        req.socket.server.keepAliveTimeout)

            res.isSubscription = true

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

function send_version(res, data) {
    var {version, parents, patches, body} = data

    function set_header (key, val) {
        if (res.isSubscription)
            res.write(`${key}: ${val}\n`)
        else
            res.setHeader(key, val)
    }
    function write_body (body) {
        if (res.isSubscription)
            res.write('\n' + body + '\n')
        else
            res.write(body)
    }

    console.log('sending version', {version, parents, patches, body,
                                    subscription: res.isSubscription})

    // Validate that the body and patches are strings
    if (body)
        assert(typeof body === 'string')
    else
        patches.forEach(p => assert(typeof p.content === 'string'))

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
        // if (res.getHeader('content-type') === 'application/json')
        //     body = JSON.stringify(body)
        set_header('content-length', body.length)
        write_body(body)
    } else {
        console.trace("Missing body or patches")
        process.exit()
    }

    // Add a newline to prepare for the next version
    // See also https://github.com/braid-org/braid-spec/issues/73
    if (res.isSubscription)
        res.write("\n")
}


module.exports = braidify
