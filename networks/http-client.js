 const u = require('utilities.js')
// Example braid-peer as a web browser client

// To do:
//  - Copy the code from websocket-client into here, and modify it to fit HTTP
//  - The code below can all be used as helper functions

module.exports = require['http-client'] = function add_http_client({node, url, prefix}) {
   
    url = url       || 'https://localhost:3011/'
    prefix = prefix || '/*'
    client_creds = null;

    var preprefix = prefix.slice(0,-1)

    var pipe = require('pipe.js')({node, id: 'client-pipe', send, connect, disconnect})
    node.bind(prefix, pipe)

    var is_absolute = /^https?:\/\//
    var has_prefix = new RegExp('^' + preprefix)

    if (url[url.length-1]=='/') url = url.substr(0,url.length-1)
    // function nlog (s) {
    //     if (nodejs) {console.log(s)} else console.log('%c' + s, 'color: blue')
    // }
    

    function send(args) {
        if (args.method === 'get')
            h2_get(args)

        else if (args.method === 'set')
            h2_set(args)

        else
            console.log('Need to implement', args.method.toUpperCase(), '!!!!!')
    }

    function connect () {
        console.log("Hmm... I need to think about what connect() should do here...")
        pipe.connected()
    }
    function disconnect () {
        console.log("Hmm... I need to think about what disconnect() should do here... too..")
        pipe.disconnected()
    }

    function parse_headers (str) {
        // This string could contain a whole response.
        // So first let's isolate to just the headers.
        var end_of_headers = str.indexOf('\n\n'),
            stuff_to_parse = str.substr(0, end_of_headers)

        // Now let's grab everything from these headers
        var headers = {},
            regex = /([\w-]+): (.*)/g,
            temp
        while (temp = regex.exec(stuff_to_parse))
            headers[temp[1].toLowerCase()] = temp[2]

        return {headers, left_over: str.substr(end_of_headers + 2)}
    }
    function parse_version (str) { return JSON.parse(str) }
    function parse_parents (str) {
        console.log('parse_parents:',str);
        var versions = str ? JSON.parse('[' + str + ']') : []
        var result = {}
        versions.forEach(v => result[v] = true)
        return result
    }
    function h2_get ({key, subscribe}) {
        key = rem_prefix(key)
        function trySend() {
            console.log('Fetching', url + '/' + key)
            fetch(url + '/' + key, {method: 'GET', mode: 'cors',
                                    headers: {'subscribe': ''}})
                .then(function (res) {
                    if (!res.ok) {
                        console.error("Fetch failed!", Response)
                        return
                    }
                    var reader = res.body.getReader()
                    var decoder = new TextDecoder('utf-8')
                    var buffer = ''
                    function read() {
                        reader.read().then(function (x) {
                            var done = x.done, value = x.value
                            if (!done) {
                                buffer += decoder.decode(value)
                                console.log('We have buffer', buffer)

                                // Now try to parse it
                                var {headers, left_over} = parse_headers(buffer)
                                assert(headers['merge-type'] === 'sync9')

                                if (headers['content-length']) {
                                    console.log('Gonna grab the body, which is',
                                                parseInt(headers['content-length']),
                                                'characters of', left_over, ', or',
                                                left_over.substr(0, parseInt(headers['content-length'])))
                                    // Then this is setting the body.  First let's grab the body.
                                    var body = left_over.substr(0, parseInt(headers['content-length']))
                                    // Now remove it from the buffer
                                    buffer = left_over.substr(body.length + 2)
                                    console.log('Gonna send!', {method: 'set',
                                               key: preprefix + key,
                                               version: parse_version(headers['version']),
                                               parents: parse_parents(headers['parents']),
                                                                patches: ['= ' + body]})
                                    pipe.recv({method: 'set',
                                               key: preprefix + key,
                                               version: parse_version(headers['version']),
                                               parents: parse_parents(headers['parents']),
                                               patches: ['= ' + body]})
                                }

                                else if (headers['patches']) {
                                    // Then let's grab a sequence of patches!
                                    console.log('This is patches!!!!!!!')
                                }

                                console.log('Good job! We did something!')

                                // var m = buffer.match(/^(\d+)\n/)
                                // while (m) {
                                //     var content_length = parseInt(m[1])
                                //     if (buffer.length >=
                                //         content_length + m[1].length + 1) {
                                //         var content = buffer.substr(m[1].length + 1,
                                //                                     content_length + m[1].length + 1)
                                //         buffer = buffer.substr(content_length + m[1].length + 4)
                                //         console.log('Content is', content)
                                //         console.log('And buffer is now', JSON.stringify(buffer))
                                //         content = JSON.parse(content)
                                            
                                //         pipe.recv({method: 'set',
                                //                    key: preprefix + key,
                                //                    patches: content})
                                //     }
                                //     m = buffer.match(/^(\d+)\n/)

                                read()
                            }
                        })
                    }
                    read()
                })
                .catch(function (err) {
                    console.log("Fetch GET failed: ", err)
                    setTimeout(trySend, 3000)
                })
        }
        trySend()
    }

    function h2_set (obj, t) {
        var h = {}
        if (t.version) h.version = t.version
        if (t.parents) h.parents = t.parents.map(JSON.stringify).join(', ')
        var key = rem_prefix(obj.key)

        var body = t.patch ? t.patch : JSON.stringify(obj)
        function trySend(waitTime) {
            fetch(url + "/" + key, {method: 'PUT', body: body,
                                    headers: new Headers(h), mode: 'no-cors'})
                .then(function (res) {
                    res.text().then(function (text) {
                        console.log('h2_set got a ', res.status, text)
                    })
                })
                .catch(function (err) {
                    console.log("Fetch SET failed: ", err);
                    setTimeout(() => trySend(Math.min(waitTime * 5, 10000)), waitTime)
                });
        }
        trySend(10);
    }
    
    function h2_forget (key) {
        var key = rem_prefix(key)
        function trySend(waitTime) {
            fetch(url + "/" + key, {method: 'FORGET', mode: 'cors'})
                .then(function (res) {
                    res.text().then(function (text) {
                        console.log('h2_forget got a ', res.status, text)
                    })
                }).catch(function (err) {
                    console.log("Fetch FORGET failed: ", err);
                    setTimeout(() => trySend(Math.min(waitTime * 5, 10000)), waitTime)
                });
        }
        trySend(10);
    }
    function h2_delete (key) {
        var key = rem_prefix(key)
        function trySend(waitTime) {
            fetch(url + "/" + key, {method: 'DELETE', mode: 'cors'})
                .then(function (res) {
                    res.text().then(function (text) {
                        console.log('h2_delete got a ', res.status, text)
                    })
                }).catch(function (err) {
                    console.log("Fetch DELETE failed: ", err);
                    setTimeout(() => trySend(Math.min(waitTime * 5, 10000)), waitTime)
                });
        }
        trySend(10);
    }

    function add_prefix (key) {
        return is_absolute.test(key) ? key : preprefix + key }
    function rem_prefix (key) {
        return has_prefix.test(key) ? key.substr(preprefix.length) : key }
    function add_prefixes (obj) {
        return bus.translate_keys(bus.clone(obj), add_prefix) }
    function rem_prefixes (obj) {
        return bus.translate_keys(bus.clone(obj), rem_prefix) }

    // node(prefix).to_set    = function (obj, t) {
    //     bus.set.fire(obj)
    //     h2_set(obj, t)
    // }
    // bus(prefix).to_get    = function (key) {
    //     h2_get(key),
    //     keys_we_got.add(key)
    // }
    // bus(prefix).to_forget = function (key) {
    //     h2_forget(key),
    //     keys_we_got.delete(key)
    // }
    // bus(prefix).to_delete = h2_delete
}