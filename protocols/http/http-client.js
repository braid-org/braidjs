var peer = Math.random().toString(36).substr(2)


// ***************************
// http
// ***************************

function braidify_http (http) {
    http.normal_get = http.get
    http.get = function braid_req (arg1, arg2, arg3) {
        var url, options, cb

        // Parse parameters
        if (typeof arg1 === 'string' || arg1 instanceof URL) {
            url = arg1
            if (typeof arg2 === 'function')
                cb = arg2
            else {
                options = arg2
                cb = arg3
            }
        } else {
            options = arg2
            cb = arg3
        }

        // Handle options
        if (options.subscribe) {
            if (!options.headers)
                options.headers = {}
            options.headers.subscribe = 'keep-alive'
        }

        // Wrap the callback
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
            
        // Put parameters back
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
    fetch,
    Headers

if (typeof window === 'undefined') {
    // Nodejs
    normal_fetch = require('node-fetch')
    Headers = normal_fetch.Headers
    var to_whatwg_stream = require('node-web-streams').toWebReadableStream
} else {
    // Web Browser
    normal_fetch = window.fetch
    window.fetch = braid_fetch
}

if (typeof module !== 'undefined' && module.exports)
    module.exports = braid_fetch


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

    var original_signal = params.signal
    var underlying_aborter = new AbortController()
    params.signal = underlying_aborter.signal
    if (original_signal)
        original_signal.addEventListener('abort', () => underlying_aborter.abort())

    // Now run the actual fetch!
    var andThen
    var promise = new Promise((resolve, reject) => {
        var fetched = normal_fetch(url, params)

        if (params.subscribe) {
            andThen = cb => {
                fetched.then(function (res) {
                    if (!res.ok) reject(new Error('Subscription request failed', res))

                    parse_versions(
                        res.body,
                        cb,
                        (err) => {
                            // Now abort the underlying fetch
                            underlying_aborter.abort()
                            reject(err)
                        }
                    )
                })
                return promise
            }
        } else
            fetched.then(resolve).catch(reject)
    })

    promise.andThen = andThen

    return promise
}

// Parse a stream of versions from the incoming bytes
async function parse_versions (stream, cb, on_error) {
    var aborted

    if (typeof window === 'undefined')
        stream = to_whatwg_stream(stream)

    // Set up a reader
    var reader = stream.getReader(),
        decoder = new TextDecoder('utf-8'),
        state = {input: ''}
    
    async function read ({done, value}) {
        var versions = []

        // First check if this connection has been closed!
        if (done) {
            console.debug("Connection closed.")
            aborted = true
            return
        }
        
        // Transform this chunk into text that we can work with.
        state.input += decoder.decode(value)

        // Now loop through the input_buffer until we hit a dead end
        do {
            state = parse_version (state)
            if (state.result === 'success')
                versions.push({
                    version: state.version,
                    parents: state.parents,
                    body: state.body,
                    patches: state.patches
                })

            else if (state.result === 'error') {
                on_error(state.message)
                return
            }
        } while (state.result !== 'waiting');

        return versions
    }

    while (!aborted) {
        try {
            var versions = await read((await reader.read()))
        } catch (e) {
            aborted = true
            on_error(e)
        }

        try {
            if (aborted) return
            versions.forEach( cb )
        } catch (e) {
            aborted = true
            on_error(e)
        }
    }
}


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
    // Ignore optional newline at start
    if (input[0] === '\n')
        input = input.substr(1)

    // Look for the end of the headers
    var headers_length = input.indexOf('\n\n') + 1
    if (headers_length === -1)
        return {result: 'waiting'}

    var stuff_to_parse = input.substring(0, headers_length)
    
    // Now grab everything from the header region
    var headers = {},
        header_regex = /([\w-_]+):\s?(.*)\n/gy,
        match,
        completed = false

    while (match = header_regex.exec(stuff_to_parse)) {
        // console.log('match', match && [match[1], match[2]])
        headers[match[1].toLowerCase()] = match[2]
        if (header_regex.lastIndex === headers_length)
            completed = true
    }

    // If there's stuff left over, we have a problem
    if (!completed) {
        // If there's a newline in the stuff, then there must be a bad header
        if (stuff_to_parse.substr(header_regex.lastIndex).indexOf('\n') !== -1) {
            return {
                result: 'error',
                message: 'failed to parse headers from '
                    + JSON.stringify(stuff_to_parse.substr(header_regex.lastIndex)),
                headers_so_far: headers,
                last_index: header_regex.lastIndex, headers_length
            }
        }
        else
            return {result: 'waiting'}
    }

    // Success!  Let's parse special headers
    if ('version' in headers)
        headers.version = JSON.parse(headers.version)
    if ('parents' in headers)
        headers.parents = JSON.parse('['+headers.parents+']')
    if ('patches' in headers)
        headers.patches = JSON.parse(headers.patches)

    // And return the parsed result
    return {result: 'success',
            headers,
            input: input.substring(headers_length + 1)}
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
                    return {result: 'error', message: 'no content-length in patch',
                            patch: last_patch, input: state.input}

                if (!('content-range' in last_patch.headers))
                    return {result: 'error', message: 'no content-range in patch',
                            patch: last_patch, input: state.input}

                var content_length = parseInt(last_patch.headers['content-length'])

                // Does input have the entire patch contents yet?
                if (state.input.length < content_length) {
                    state.result = 'waiting'
                    return state
                }

                // Content-range is of the form '<unit> <range>' e.g. 'json .index'
                
                var match = last_patch.headers['content-range'].match(/(\S+) (.*)/)
                if (!match)
                    return {result: 'error', message: 'cannot parse content-range in patch',
                            patch: last_patch, input: state.input}

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

    return {result: 'error',
            message: 'cannot parse body without content-length or patches header'}
}
