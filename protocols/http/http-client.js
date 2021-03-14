var peer = Math.random().toString(36).substr(2)


// ***************************
// http
// ***************************

function braidify_http (http) {
    http.normal_get = http.get
    http.get = function braid_req (arg1, arg2, arg3) {
        var url, options, cb

        // http.get() supports two forms:
        //
        //  - http.get(url[, options][, callback])
        //  - http.get(options[, callback])
        //
        // We need to know which arguments are which, so let's detect which
        // form we are looking at.

        // Detect form #1: http.get(url[, options][, callback])
        if (typeof arg1 === 'string' || arg1 instanceof URL) {
            url = arg1
            if (typeof arg2 === 'function')
                cb = arg2
            else {
                options = arg2
                cb = arg3
            }
        }

        // Otherwise it's form #2: http.get(options[, callback])
        else {
            options = arg2
            cb = arg3
        }

        // Now we know where the `options` are specified.  Let's handle the
        // braid `subscribe` header.
        if (options.subscribe) {
            if (!options.headers)
                options.headers = {}
            options.headers.subscribe = 'keep-alive'
        }

        // Wrap the callback to provide our new .on('version', ...) feature
        var on_version,
            on_error,
            orig_cb = cb
        cb = (res) => {
            res.orig_on = res.on
            res.on = (key, f) => {
                if (key === 'version')
                    on_version = f
                else if (key === 'error') {
                    on_error = f
                    res.orig_on(key, f)
                } else
                    res.orig_on(key, f)
            }

            // XX Bug: I think the following should only happen if:
            // 
            //   1. This is called with options.subscribe
            //   2. And .on('version', ...) has been called

            // When we get data we'll parse it and add new versions
            var state = {input: ''}
            res.orig_on('data', (chunk) => {
                // console.log('chunk:', JSON.stringify(chunk.toString()))
                state.input += chunk.toString()
                do {
                    state = parse_version(state)
                    if (state.result === 'success') {
                        on_version && on_version({
                            version: state.version,
                            parents: state.parents,
                            body: state.body,
                            patches: state.patches
                        })
                        state = {input: state.input}
                    }
                    else if (state.result === 'error') {
                        on_error && on_error(state.message)
                        return
                    }
                } while (state.result !== 'waiting')
            })
            orig_cb && orig_cb(res)
        }
            
        // Now put the parameters back in their prior order and call the
        // underlying .get() function
        if (url) {
            arg1 = url
            if (options) {
                arg2 = options
                arg3 = cb
            } else {
                arg2 = cb
            }
        } else {
            arg1 = options
            arg2 = cb
        }

        http.normal_get(arg1, arg2, arg3)
    }
    return http
}

braid_fetch.braidify = {http: braidify_http}


// ***************************
// Fetch
// ***************************

var normal_fetch,
    AbortController,
    Headers

if (typeof window === 'undefined') {
    // Nodejs
    normal_fetch = require('node-fetch')
    AbortController = require('abort-controller')
    Headers = normal_fetch.Headers
    var to_whatwg_stream = require('node-web-streams').toWebReadableStream
} else {
    // Web Browser
    normal_fetch = window.fetch
    AbortController = window.AbortController
    Headers = window.Headers
    window.fetch = braid_fetch
}

if (typeof module !== 'undefined' && module.exports)
    module.exports = {fetch: braid_fetch, http: braidify_http}


function braid_fetch (url, params = {}) {
    // Todo: when reconnecting, this needs a way of asking to continue where
    // parents left off.
    //
    //   - should it remember the parents?
    //   - or should it use a peer, or fissure id?

    // Initialize the headers object
    if (!params.headers)
        params.headers = new Headers()

    // Always set the peer
    params.headers.set('peer', peer)

    // We provide some shortcuts for Braid params
    if (params.version)
        params.headers.set('version', JSON.stringify(params.version))
    if (params.parents)
        params.headers.set('parents', params.parents.map(JSON.stringify).join(', '))
    if (params.subscribe)
        params.headers.set('subscribe',
                            (typeof params.subscribe === 'number'
                             ? 'keep-alive=' + params.subscribe
                             : 'keep-alive'))

    // Prepare patches
    if (params.patches) {
        console.assert(Array.isArray(params.patches), 'Patches must be array')
        console.assert(!params.body, 'Cannot send both patches and body')

        params.patches = params.patches || []
        params.headers.set('patches', params.patches.length)
        params.body = (params.patches).map(patch => {
            var length = `content-length: ${patch.content.length}`
            var range = `content-range: ${patch.unit} ${patch.range}`
            return `${length}\n${range}\n\n${patch.content}\n`
        }).join('\n')
    }

    // We have to wrap the AbortController with a new one.
    //
    // This is because we want to be able to abort the fetch that the user
    // passes in.  However, the fetch() command uses a silly "AbortController"
    // abstraction to abort fetches, which has both a `signal` and a
    // `controller`, and only passes the signal to fetch(), but we need the
    // `controller` to abort the fetch itself.

    var original_signal = params.signal
    var underlying_aborter = new AbortController()
    params.signal = underlying_aborter.signal
    if (original_signal)
        original_signal.addEventListener(
            'abort',
            () => underlying_aborter.abort()
        )

    // We wrap the original fetch's promise with a custom promise.
    //
    // This promise includes an additional .andThen(cb) method.  It calls the
    // cb multiple times, and then if there's any crash, it'll call the
    // original promise's .catch(cb) clause.
    //
    // We couldn't just augment the original promise with the .andThen()
    // method, because there is no way of calling the .catch() method of the
    // original promise ourselves.  You cannot get access to a promise's
    // internal callback method that has been set by some other code.

    var andThen
    var promise = new Promise((resolve, reject) => {

        // Run the actual fetch here!
        var fetched = normal_fetch(url, params)

        // If this is a subscribe, then include our little .andThen()  ;)
        if (params.subscribe) {
            andThen = cb => {
                fetched.then(function (res) {
                    if (!res.ok)
                        reject(new Error('Subscription request failed', res))

                    // Parse the streamed response
                    handle_fetch_stream(
                        res.body,
                        (result, err) => {
                            if (!err)
                                cb(result)
                            else {
                                // Abort the underlying fetch
                                underlying_aborter.abort()
                                reject(err)
                            }
                        }
                    )
                })
                // This catch will get called if the fetch request fails to
                // connect..
                .catch(reject)
                return promise
            }
        }

        // But if this wasn't a `subscribe` request, then we just wrap the
        // underlying promise with our superpromise directly:
        else fetched.then(resolve).catch(reject)

        // ... and we're done.
    })

    promise.andThen = andThen

    return promise
}


// Parse a stream of versions from the incoming bytes
async function handle_fetch_stream (stream, cb) {
    if (typeof window === 'undefined')
        stream = to_whatwg_stream(stream)

    // Set up a reader
    var reader = stream.getReader(),
        decoder = new TextDecoder('utf-8'),
        state = {input: ''}
    
    while (true) {
        var versions = []

        try {
            // Read the next chunk of stream!
            var {done, value} = await reader.read()

            // Check if this connection has been closed!
            if (done) {
                console.debug("Connection closed.")
                cb(null, 'Connection closed')
                return
            }

            // Transform this chunk into text that we can work with.
            state.input += decoder.decode(value)

            // Now loop through the input_buffer until we hit a dead end
            do {

                // This calls the actual parser
                state = parse_version (state)

                // Maybe we parsed a version!  That's cool!
                if (state.result === 'success') {
                    cb({
                        version: state.version,
                        parents: state.parents,
                        body: state.body,
                        patches: state.patches
                    })

                    // Reset the parser for the next version!
                    state = {input: state.input}
                }

                // Or maybe there's an error to report upstream
                else if (state.result === 'error') {
                    cb(null, state.message)
                    return
                }

              // We stop once we've run out of parseable input.
            } while (state.result !== 'waiting' && state.input.trim() !== '')
        }

        catch (e) {
            cb(null, e)
            return
        }
    }
}

// ****************************
// General parsing functions
// ****************************
//
// Each of these functions takes parsing state as input, mutates the state,
// and returns the new state.
//
// Depending on the parse result, each parse function returns:
//
//  parse_<thing> (state)
//  => {result: 'waiting', ...}  If it parsed part of an item, but neeeds more input
//  => {result: 'success', ...}  If it parses an entire item
//  => {result: 'error', ...}    If there is a syntax error in the input


function parse_version (state) {
    // If we don't have headers yet, let's try to parse some
    if (!state.headers) {
        var parsed = parse_headers(state.input)

        // If header-parsing fails, send the error upstream
        if (parsed.result === 'error')
            return parsed
        if (parsed.result === 'waiting') {
            state.result = 'waiting'
            return state
        }

        state.headers = parsed.headers
        state.version = state.headers.version
        state.parents = state.headers.parents

        // Take the parsed headers out of the buffer
        state.input = parsed.input
    }

    // We have headers now!  Try parsing more body.
    return parse_body(state)
}


// Parsing helpers
function parse_headers (input) {
    // First, find the start & end block of the headers.  The headers start
    // when there are no longer newlines, and end at the first double-newline.

    // Skip the newlines at the start
    while (input[0] === '\n')
        input = input.substr(1)

    // Now look for a double-newline that will mark the end of the headers
    var headers_length = input.indexOf('\n\n') + 1

    // ...if we found none, then we need to wait for more input to complete
    // the headers..
    if (headers_length === 0)
        return {result: 'waiting'}

    // We now know what stuff to parse!
    var headers_source = input.substring(0, headers_length)
    
    // Let's parse it!  First define some variables:
    var headers = {},
        header_regex = /([\w-_]+):\s?(.*)\n/gy,  // Parses one line a time
        match,
        found_last_match = false

    // And now loop through the block, matching one line at a time
    while (match = header_regex.exec(headers_source)) {
        // console.log('Header match:', match && [match[1], match[2]])
        headers[match[1].toLowerCase()] = match[2]

        // This might be the last line of the headers block!
        if (header_regex.lastIndex === headers_length)
            found_last_match = true
    }

    // If the regex failed before we got to the end of the block, throw error:
    if (!found_last_match)
        return {
            result: 'error',
            message: 'Parse error in headers: "'
                     + headers_source.substr(header_regex.lastIndex) + '"',
            headers_so_far: headers,
            last_index: header_regex.lastIndex, headers_length
        }

    // Success!  Let's parse special headers
    if ('version' in headers)
        headers.version = JSON.parse(headers.version)
    if ('parents' in headers)
        headers.parents = JSON.parse('['+headers.parents+']')
    if ('patches' in headers)
        headers.patches = JSON.parse(headers.patches)

    // And return the parsed result
    return {
        result: 'success',
        headers,
        input: input.substring(headers_length + 1)
    }
}

function parse_body (state) {
    // Parse Body Snapshot

    var content_length = parseInt(state.headers['content-length'])
    if (content_length) {
        if (content_length > state.input.length) {
            state.result = 'waiting'
            return state
        }

        var consumed_length = content_length + 2
        state.result = 'success',
        state.body = state.input.substring(0, content_length),
        state.input = state.input.substring(consumed_length)
        return state
    }

    // Parse Patches

    else if (state.headers.patches) {
        state.patches = state.patches || []

        var last_patch = state.patches[state.patches.length-1]

        // Parse patches until the final patch has its content filled
        while (!(state.patches.length === state.headers.patches
                 && 'content' in last_patch)) {

            state.input = state.input.trimStart()

            // Are we starting a new patch?
            if (!last_patch || 'content' in last_patch) {
                last_patch = {}
                state.patches.push(last_patch)
            }

            // Parse patch headers
            if (!('headers' in last_patch)) {
                var parsed = parse_headers(state.input)

                // If header-parsing fails, send the error upstream
                if (parsed.result === 'error')
                    return parsed
                if (parsed.result === 'waiting') {
                    state.result = 'waiting'
                    return state
                }

                // We parsed patch headers!  Update state.
                last_patch.headers = parsed.headers
                state.input = parsed.input
            }

            // Todo: support arbitrary patches, not just range-patch

            // Parse Range Patch format
            {
                if (!('content-length' in last_patch.headers))
                    return {
                        result: 'error',
                        message: 'no content-length in patch',
                        patch: last_patch, input: state.input
                    }

                if (!('content-range' in last_patch.headers))
                    return {
                        result: 'error',
                        message: 'no content-range in patch',
                        patch: last_patch, input: state.input
                    }

                var content_length = parseInt(last_patch.headers['content-length'])

                // Does input have the entire patch contents yet?
                if (state.input.length < content_length) {
                    state.result = 'waiting'
                    return state
                }

                // Content-range is of the form '<unit> <range>' e.g. 'json .index'
                
                var match = last_patch.headers['content-range'].match(/(\S+) (.*)/)
                if (!match)
                    return {
                        result: 'error',
                        message: 'cannot parse content-range in patch',
                        patch: last_patch, input: state.input
                    }

                last_patch.unit = match[1]
                last_patch.range = match[2]
                last_patch.content = state.input.substr(0, content_length)

                // Consume the parsed input
                state.input = state.input.substring(content_length)
            }
        }

        state.result = 'success'
        return state
    }

    return {
        result: 'error',
        message: 'cannot parse body without content-length or patches header'
    }
}
