var client = Math.random().toString(36).substr(2)
var abort_controller = new AbortController()

function make_and_promise () {
    var a = new Promise((r, e) => {
        setTimeout(_=>r(3),1000)
    })
    a.each = x => {
        console.log('ooo someone wants to each me with', x)
        a.then(x)
        setTimeout(_=>x('last call!'), 1500)
    }
    a.each(x => console.log('We got a result!', x))
}



function braid_fetch (url, options = {}, callback) {
    // Todo: when reconnecting, this needs a way of asking to continue where
    // parents left off.
    //
    //   - should it remember the parents?
    //   - or should it use a client, or fissure id?

    // Create the headers object
    var headers = {"client": client}
    if (options.version) headers.version = JSON.stringify(options.version)
    if (options.parents) headers.parents = options.parents.map(JSON.stringify).join(', ')
    if (options.subscribe)
        headers.subscribe = (typeof options.subscribe === 'number'
                             ? 'keep-alive=' + options.subscribe
                             : 'keep-alive')

    // Send the underlying fetch request
    function go () {
        console.log(`Fetching ${url}`);
        fetch(url, {method: 'GET',
                    mode: 'cors',
                    headers: new Headers(headers),
                    signal: abort_controller.signal})
            .then(function (res) {
                if (!res.ok) {
                    console.error("Fetch failed!", res)
                    return
                }
                //res.text().then(x=>console.log('Hooooooo', x))
                parse_response(res.body, callback,
                               () => console.warn(`Goodbye!`),
                               () => setTimeout(go, 5000))
            })
            .catch((err) => {
                //console.error("GET fetch failed: ", err)
                setTimeout(go, 5000)
            })
    }
    go()
        
        
    if (false) {
        var p = new Promise((resolve, error) => {
            
        })
        a.each = x => {
            console.log('ooo someone wants to each me with', x)
            a.then(x)
            setTimeout(_=>x('last call!'), 1500)
        }
    }
}

// Parse a stream of versions from the incoming bytes
function parse_response (stream, on_message, on_finished, on_error) {
    // Set up a reader
    var reader = stream.getReader(),
        decoder = new TextDecoder('utf-8'),
        input_buffer = '',
        parsed_headers = false,
        parsed_patches = []
    
    
    // Process one chunk of the stream at a time.
    reader.read().then(function read ({done, value}) {

        // First check if this connection has been closed!
        if (done) {
            if (input_buffer.trim().length)
                console.debug("Connection was closed. Remaining data in buffer:", input_buffer)
            else
                console.debug("Connection was closed. Buffer was empty.")
            on_finished()
            return
        }
        
        // Transform this chunk into text that we can work with.
        var chunk_string = decoder.decode(value)
        console.debug('Received text', chunk_string)

        // Add this chunk to our input buffer
        input_buffer = (input_buffer + chunk_string)

        // Now loop through the input_buffer until we hit a dead end
        while (true) {

            // Remove newlines at the beginning. (May be unnecessary.)
            //input_buffer.trimStart()

            // If we don't have headers yet, let's try to parse some
            if (!parsed_headers) {
                //console.debug("Trying to parse headers...")
                var parsedH = parse_headers()
                // Todo: Handle malformed headers by disconnecting
                if (parsedH) {
                    parsed_headers = parsedH.headers
                    // Take the parsed headers out of the buffer
                    input_buffer = input_buffer.substring(parsedH.consumeLength)
                    //console.debug("Header parsing Success:", parsed_headers)
                } else {
                    console.debug("Failed to parse headers.")
                    // This means we need to exit the loop and wait for
                    // more input.
                    break
                }
            }

            // We have headers now!

            if (parse_body()) {
                // Now we have a complete message!
                console.debug("Patch parse Success:", parsed_patches)

                // First, the parameters for the callback
                let version = JSON.parse(parsed_headers.version || 'null'),
                    patches = parsed_patches && parsed_patches.slice(),
                    parents = parsed_headers.parents
                if (parsed_headers.parents)
                    parents = JSON.parse('['+parsed_headers.parents+']')
                // console.debug("Assembled complete message: ",
                //               {version, patches, parents})

                // Now tell everyone!
                on_message({version, patches, parents})

                // Reset our parser state, to read the next message
                parsed_headers = false
                parsed_patches = []

                // And let's continue reading, in case there is more stuff in
                // this chunk for us to parse!
                console.debug("Restarting in current buffer...",
                              JSON.stringify(input_buffer))
            } else {
                // Patch parsing failed.  Let's wait for more data.
                console.debug("Couldn't parse patches.")
                // Todo: Handle malformed patches by disconnecting
                break
            }
        }

        // Now let's restart the whole process
        console.debug("Waiting for next chunk to continue reading")
        reader.read().then(read).catch(e => {
            // console.error('This reader failed with', e)
            on_error(e)
        })
    }).catch(e => {
        console.error('The reader failed with', e)
        on_error(e)
    })

    // Parsing helpers
    function parse_headers() {
        console.debug('Parsing headers from', input_buffer)
        // This string could contain a whole response.
        // So first let's isolate to just the headers.
        var end_of_headers = input_buffer.indexOf('\n\n')
        if (end_of_headers === -1) {
            console.debug('parse_headers: no double-newline')
            return false
        }
        var stuff_to_parse = input_buffer.substring(0, end_of_headers)
        
        // Now let's grab everything from these headers
        var headers = {},
            regex = /([\w-]+): (.*)/g,
            tmp,
            completed = false
        while (tmp = regex.exec(stuff_to_parse)) {
            //console.debug('Parse line:', tmp)
            headers[tmp[1].toLowerCase()] = tmp[2]
            if (regex.lastIndex === end_of_headers) {
                completed = true
                break
            }
        }
        
        // If we couldn't consume the entire buffer, then we can crash
        if (!completed) {
            console.debug('parse_headers: not completed')
            return false
        } else
            return {headers: headers, consumeLength: end_of_headers + 2}
    }

    function parse_body() {
        var content_length = parseInt(parsed_headers['content-length'])
        // console.debug("Trying to parse",
        //               content_length
        //               ? JSON.stringify(content_length) + ' bytes'
        //               : JSON.stringify(parsed_headers.patches) + ' patches',
        //               "from", JSON.stringify(input_buffer))

        if (content_length) {
            console.debug("Got an absolute body")
            // This message has "body"
            if (content_length > input_buffer.length) {
                console.debug("But we don't have enough data for it yet...")
                return false
            }

            parsed_patches = [{
                range: '',
                value: input_buffer.substring(0, content_length)
            }]
            input_buffer = input_buffer.substring(content_length + 2)
            console.debug('Now, we parsed',
                          JSON.stringify(parsed_patches[0].value),
                          'and input buffer is', JSON.stringify(input_buffer))
            return true
        }
        if (parsed_headers.patches) {
            // Parse patches until we run out of patches to parse or get
            // all of them
            while (parsed_patches.length < parsed_headers.patches) {
                input_buffer = input_buffer.trimStart()
                var parsePatchHeaders = parse_headers()
                if (!parsePatchHeaders) {
                    console.debug("Failed to parse patch headers!")
                    return false
                }
                var patchHeaders = parsePatchHeaders.headers
                var headerLength = parsePatchHeaders.consumeLength
                // assume we have content-length...
                var length = parseInt(patchHeaders['content-length'])

                // Does our current buffer contain enough data that we
                // have the entire patch?
                if (input_buffer.length < headerLength + length) {
                    console.debug("Buffer is too small to contain",
                                  "the rest of the patch...")
                    return false
                }

                // Assume that content-range is of the form 'json=.index'
                var r = patchHeaders['content-range']
                var patchRange = r.startsWith("json=") ? r.substring(5) : r
                var patchValue = input_buffer.substring(headerLength, headerLength + length)

                // We've got our patch!
                parsed_patches.push({range: patchRange, value: patchValue})
                input_buffer = input_buffer.substring(headerLength + length + 2)
                console.debug('Successfully parsed a patch.',
                              `We now have ${parsed_patches.length}/${parsed_headers.patches}`)
            }

            if (input_buffer[0] === '\n' && input_buffer[1] === '\n') {
                console.error(input_buffer)
                throw 'bad'
            }
            console.debug("Parsed all patches.")
            return true
        }
    }
}


function braid_put (url, options = {}, callback) {
    // Make the headers:
    //
    //    Version: "g09ur8z74r"
    //    Parents: "ej4lhb9z78"
    //    Content-Type: application/json
    //    Merge-Type: sync9
    //    Patches: 2
    //  
    var headers = {
        'client': client,
        'Cache-Control': 'no-cache, no-transform',
        ...options.headers
    }
    if (options.version) headers.version = JSON.stringify(options.version)
    if (options.parents && options.parents.length > 0)
        headers.parents = options.parents.map(JSON.stringify).join(', ')
    options.patches = options.patches || []
    headers.patches = options.patches.length

    // Make the body a sequence of patches:
    //
    //    Content-Length: 62                                | Patch 1
    //    Content-Range: json=.messages[1:1]                |
    //                                                      |
    //    [{text: "Yo!",                                    |
    //      author: {type: "link", value: "/user/yobot"}]   |
    //   
    //    Content-Length: 40                                | Patch 2
    //    Content-Range: json=.latest_change                |
    //                                                      |
    //    {"type": "date", "value": 1573952202370}          |

    var body = (options.patches || []).map(patch => {
        // We should use the sync9 patch parser
        var split = patch.match(/(.*?)\s*=\s*(.*)/)  // (...) = (...)
        var length = `content-length: ${split[2].length}`
        var range = `content-range: json=${split[1]}`
        return `${length}\n${range}\n\n${split[2]}\n`
    }).join('\n')

    // Now send the request
    return fetch(url, {method: 'PUT',
                       body: body,
                       mode: 'cors',
                       headers: new Headers(headers)})
        // .then(function (res) {
        //     res.text().then((text) => {
        //         console.debug(`braid_put response: status ${res.status}, body "${text}"`)
        //     })
        // })
        // .catch(function (err) { console.error("braid_set Fetch failed: ", err)})
}