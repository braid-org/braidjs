var assert = require('assert')

// Return a string of patches in pseudoheader format.
//
//   The `patches` argument can be:
//     - Array of patches
//     - A single patch
//
//   Multiple patches are generated like:
//
//       Patches: n
//
//       content-length: 21
//       content-range: json .range
//
//       {"some": "json object"}
//
//       content-length: x
//       ...
//
//   A single patch is generated like:
//
//       content-length: 21
//       content-range: json .range
//
//       {"some": "json object"}
//
function generate_patches(res, patches) {
    var result = ''

    // `patches` must be a patch object or an array of patch objects
    //  - Object:  {unit, range, content}
    //  - Array:  [{unit, range, content}, ...]

    assert(typeof patches === 'object')  // An array is also an object

    // An array of one patch behaves like a single patch
    if (Array.isArray(patches)) {

        // Add `Patches: N` header if array
        result += `Patches: ${patches.length}\r\n\r\n`
    } else
        // Else, we'll out put a single patch
        patches = [patches]

    // Generate each patch
    patches.forEach((patch, i) => {
        assert(typeof patch.unit    === 'string')
        assert(typeof patch.range   === 'string')
        assert(typeof patch.content === 'string')

        if (i > 0)
            result += '\r\n\r\n'

        let extra_headers = Object.fromEntries(Object.entries(patch).filter(([k, v]) => k != 'unit' && k != 'range' && k != 'content'))

        result += `Content-Length: ${patch.content.length}\r
Content-Range: ${patch.unit} ${patch.range}\r
${Object.entries(extra_headers).map(([k, v]) => `${k}: ${v}\r\n`).join('')}\r
${patch.content}`
    })
    return result
}


// This function reads num_patches in pseudoheader format from a
// ReadableStream and then fires a callback when they're finished.
function parse_patches (req, cb) {
    var num_patches = req.headers.patches

    // Parse a request body as an "everything" patch
    if (!num_patches && !req.headers['content-range']) {
        var body = ''
        req.on('data', chunk => {body += chunk.toString()})
        req.on('end', () => {
            cb([{unit: 'everything', range: '', content: body}])
        })
    }

    // Parse a single patch, lacking Patches: N
    else if (num_patches === undefined && req.headers['content-range']) {

        // We only support range patches right now, so there must be a
        // Content-Range header.
        assert(req.headers['content-range'], 'No patches to parse: need `Patches: N` or `Content-Range:` header in ' + JSON.stringify(req.headers))

        // Parse the Content-Range header
        // Content-range is of the form '<unit> <range>' e.g. 'json .index'
        var [unit, range] = parse_content_range(req.headers['content-range'])

        // The contents of the patch is in the request body
        var buffer = ''
        // Read the body one chunk at a time
        req.on('data', chunk => buffer = buffer + chunk)
        // Then return it
        req.on('end', () => {
            patches = [{unit, range, content: buffer}]
            cb(patches)
        })
    }

    // Parse multiple patches within a Patches: N block
    else {
        num_patches = parseInt(num_patches)
        let patches = []
        let buffer = ""

        // We check to send send patches each time we parse one.  But if there
        // are zero to parse, we will never check to send them.
        if (num_patches === 0)
            return cb([])

        req.on('data', function parse (chunk) {

            // Merge the latest chunk into our buffer
            buffer = (buffer + chunk)

            while (patches.length < num_patches) {
                // We might have extra newlines at the start, because patches
                // can be separated by arbitrary numbers of newlines
                buffer = buffer.trimStart()

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
                    console.error('No content-length in', JSON.stringify(headers),
                                  'from', {buffer, headers_length})
                    process.exit(1)
                }

                var body_length = parseInt(headers['content-length'])

                // Give up if we don't have the full patch yet.
                if (buffer.length < headers_length + blank_line.length + body_length)
                    return

                // XX Todo: support custom patch types beyond content-range.

                // Content-range is of the form '<unit> <range>' e.g. 'json .index'
                var [unit, range] = parse_content_range(headers['content-range'])
                var patch_content =
                    buffer.substring(headers_length + blank_line.length,
                                     headers_length + blank_line.length + body_length)

                // We've got our patch!
                patches.push({unit, range, content: patch_content})

                buffer = buffer.substring(headers_length + blank_line.length + body_length)
            }

            // We got all the patches!  Pause the stream and tell the callback!
            req.pause()
            cb(patches)
        })
        req.on('end', () => {
            // If the stream ends before we get everything, then return what we
            // did receive
            console.error('Request stream ended!')
            if (patches.length !== num_patches)
                console.error(`Got an incomplete PUT: ${patches.length}/${num_patches} patches were received`)
        })
    }
}

function parse_content_range (range_string) {
    var match = range_string.match(/(\S+)( (.*))?/)
    if (!match) throw 'Cannot parse Content-Range in ' + string
    var [unit, range] = [match[1], match[3] || '']
    return [unit, range]
}

function braidify (req, res, next) {
    // console.log('\n## Braidifying', req.method, req.url, req.headers.peer)

    // First, declare that we support Patches and JSON ranges.
    res.setHeader('Range-Request-Allow-Methods', 'PATCH, PUT')
    res.setHeader('Range-Request-Allow-Units', 'json')

    // Extract braid info from headers
    var version = req.headers.version && JSON.parse('['+req.headers.version+']'),
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
    res.sendUpdate = (stuff) => send_update(res, stuff, req.url, peer)
    res.sendVersion = res.sendUpdate
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
            // console.log('Starting subscription!')
            // console.log('Timeouts are:',
            //             req.socket.server.timeout,
            //             req.socket.server.keepAliveTimeout)

            res.isSubscription = true

            // Let's disable the timeouts
            req.socket.server.timeout = 0.0

            // We have a subscription!
            res.statusCode = 209
            res.setHeader("subscribe", req.headers.subscribe)
            res.setHeader('cache-control', 'no-cache, no-transform')
            if (req.httpVersionMajor == 1) {
                // Explicitly disable transfer-encoding chunked for http 1
                res.setHeader('transfer-encoding', '')
            }

            // Tell nginx not to buffer the subscription
            res.setHeader('X-Accel-Buffering', 'no')

            var connected = true
            function disconnected (x) {
                if (!connected) return
                connected = false
                // console.log(`Connection closed on ${req.url} from`, x, 'event')

                // Now call the callback
                if (args.onClose)
                    args.onClose()
            }

            res.on('close',   x => disconnected('close'))
            res.on('finish',  x => disconnected('finish'))
            req.on('abort',   x => disconnected('abort'))
        }

    // Check the Useragent to work around Firefox bugs
    if (req.headers['user-agent']
        && typeof req.headers['user-agent'] === 'string'
        && req.headers['user-agent'].toLowerCase().indexOf('firefox') > -1)
        res.is_firefox = true

    next && next()
}

function send_update(res, data, url, peer) {
    var {version, parents, patches, patch, body} = data

    function set_header (key, val) {
        if (res.isSubscription)
            res.write(`${key}: ${val}\r\n`)
        else
            res.setHeader(key, val)
    }
    function write_body (body) {
        if (res.isSubscription)
            res.write('\r\n' + body)
        else
            res.write(body)
    }

    // console.log('sending version', {url, peer, version, parents, patches, body,
    //                                 subscription: res.isSubscription})

    // Validate that the body and patches are strings
    if (body !== undefined)
        assert(typeof body === 'string')
    else {
        // Only one of patch or patches can be set
        assert(!(patch && patches))
        assert((patch || patches) !== undefined)
        assert((patch || patches) !== null)

        // Patches must be an array
        if (patches)
            assert(Array.isArray(patches))

        // But if using `patch`, then we set `patches` to just that object
        if (patch)
            patches = patch

        // Now `patches` will be an array of patches or a single patch object.
        //
        // This distinction is used in generate_patches() to determine whether
        // to inline a single patch in the update body vs. writing out a
        // Patches: N block.
        assert(typeof patches === 'object')
        if (Array.isArray(patches))
            patches.forEach(p => {
                assert('unit' in p)
                assert('range' in p)
                assert('content' in p)
                assert(typeof p.content === 'string')
            })
    }

    var body_exists = body || body === ''
    assert(body_exists || patches, 'Missing body or patches')
    assert(!(body_exists && patches), 'Cannot send both body and patches')

    // Write the headers or virtual headers
    for (var [header, value] of Object.entries(data)) {
        header = header.toLowerCase()

        // A header set to undefined acts like it wasn't set
        if (value === undefined)
            continue

        // Version and Parents get output in the Structured Headers format,
        // so we convert `value` from array to comma-separated strings.
        if (header === 'version') {
            header = 'Version'               // Capitalize for prettiness
            value = value.map(JSON.stringify).join(", ")
        } else if (header === 'parents') {
            header = 'Parents'               // Capitalize for prettiness
            value = value.map(JSON.stringify).join(", ")
        }

        // We don't output patches or body yet
        else if (header === 'patches' || header === 'body' || header === 'patch')
            continue

        set_header(header, value)
    }

    // Write the patches or body
    if (typeof body === 'string') {
        set_header('Content-Length', (new TextEncoder().encode(body)).length)
        write_body(body)
    } else
        res.write(generate_patches(res, patches))

    // Add a newline to prepare for the next version
    // See also https://github.com/braid-org/braid-spec/issues/73
    if (res.isSubscription) {
        var extra_newlines = 1
        if (res.is_firefox)
            // Work around Firefox network buffering bug
            // See https://github.com/braid-org/braidjs/issues/15
            extra_newlines = 240

        for (var i = 0; i < 1 + extra_newlines; i++)
            res.write("\r\n")
    }
}


module.exports = braidify
