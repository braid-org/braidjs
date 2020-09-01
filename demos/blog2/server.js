var pubsub = require('./pubsub.js')
assert = console.assert

// Chat Data
var blog = [
    {body: 'First post madafakaaaa!!!!'},
    {body: `And now it\'s time for something serious.

Two men today were caught demonizing a small child.  The child kicked their butt, and the story ended there.`},
    {body: "It's nice when things come in threes."}
]
var curr_version = () => blog.length + ''


// Braid interface to the Data
var data = {
    get (msg) {
        console.log('get msg.url:', {url: msg.url, blog})
        if (msg.parents && msg.parents.length > 0)
            return blog.slice(parseInt(msg.parents[0]))
        else
            return blog
    },

    subscribe (msg) {
        console.log('Subscribing', this.get(msg), pretty_msg(msg))

        // If no parents specified, send the whole thing
        if (!msg.parents || msg.parents.length === 0)
            braid.send({
                ...msg,
                ...{body: JSON.stringify(this.get(msg))},
                version: curr_version()
            })

        // If parents specified, parse it as a number, and send a patch from
        // that region in the blog to the end of the blog
        else {
            assert(msg.parents && msg.parents.length > 0)
            braid.send({
                ...msg,
                ...{patches: this.get(msg)},
                version: curr_version()
            })
        }
    },
    
    change (msg) {
        assert(msg.patches.length === 1)
        // Todo: make this work for editing a single blog post
        if (msg.patches[0].range === '[-0:-0]') {
            msg.parents = msg.parents || [curr_version()]
            blog.push(JSON.parse(msg.patches[0].value))
            msg.version = msg.version || curr_version()
        } else
            console.log('Got unknown patch!', msg.patches[0])

        console.log('server.js: We got an update!',
                    {version: msg.version, parents: msg.parents,
                     patches: msg.patches, body: msg.body})
    },
    
    curr_version,
}


// Merge the braids
var handlers = {
    get:         (msg) => {
        return JSON.stringify(data.get(msg))
    },
    subscribe:   (msg) => {
        pubsub.subscribe(msg)
        data  .subscribe(msg)
    },
    unsubscribe: (msg) => {
        pubsub.unsubscribe(msg)
        data  .subscribe(msg)
    },
    change:      (msg) => {
        data  .change(msg)
        pubsub.change(msg)
    }
}

// Start the server
braid = require('./http-server.js')
braid.recv = handlers

var type = 'spdy'

// HTTP
if (type === 'h1') {
    require('http').createSecureServer(
        { cert: require('fs').readFileSync('./certificate'),
          key: require('fs').readFileSync('./private-key')
        },

        braid.handle_request
    ).listen(3009)
}
else if (type === 'h2') {
    require('http2').createSecureServer(
        { cert: require('fs').readFileSync('./certificate'),
          key: require('fs').readFileSync('./private-key'),
          allowHTTP1: true },

        braid.handle_request
    ).listen(3009)
}
else if (type === 'h2-mixed') {
    require('http2').createSecureServer(
        { cert: require('fs').readFileSync('./certificate'),
          key: require('fs').readFileSync('./private-key'),
          allowHTTP1: true },

        (req, res) => {
            if (req.url === '/blog')
                braid.handle_request(req, res)
            else if (req.url === '/yjs') {
                res.end('<h1>this is a yjs thing')
            }
            else {
                res.end('<h1>Nothing! Absolutely nothing!</h1>You are so stupid!')
            }
        }
    ).listen(3009)
}
else if (type === 'h2-experiment') {
    require('http2').createSecureServer(
        { cert: require('fs').readFileSync('./certificate'),
          key: require('fs').readFileSync('./private-key'),
          allowHTTP1: true },

        // Let's see if I could keep the res here, and handle pubsub and
        // everything within the request.
        (req, res) => {
            if (req.url === '/blog') {
                braid.handle_request(
                    req, res
                ).then(() => {
                    handle_pubsub(req, res)
                    sync_blog(req, res)
                })
            }
            else if (req.url === '/yjs') {
                res.end('<h1>this is a yjs thing')
            }
            else {
                res.end('<h1>Nothing! Absolutely nothing!</h1>You are so stupid!')
            }
        }
    ).listen(3009)
}
else if (type === 'h2-express') {
    var app = require('express')()
    require('http2').createSecureServer(
        { cert: require('fs').readFileSync('./certificate'),
          key: require('fs').readFileSync('./private-key'),
          allowHTTP1: true },

        (req, res) => {
            console.log('got request!')
            app(req, res)
        }
        //app
    ).listen(3009)

    app.get('/blog', (req, res) => {
        // braid.setup(req, res, {handlers})
        // - installs parser
        // - connects to event handlers for get, subscribe, unsubscribe,
        //   change, delete...
        //  ... might need user to not call res.end() or
        //  similar... constraining their existing use of express
        braid.handle_request(req, res)
    })
}
else if (type === 'spdy') {
    var app = require('express')()
    require('spdy').createServer(
        { cert: require('fs').readFileSync('./certificate'),
          key: require('fs').readFileSync('./private-key'),
          allowHTTP1: true },

        (req, res) => {
            console.log('got request!')
            braid.handle_request(req, res)
        }
        //app
    ).listen(3009)
}

// else if (type === 'h2-with-detection') {
//     require('http2').createSecureServer(
//         { cert: require('fs').readFileSync('./certificate'),
//           key: require('fs').readFileSync('./private-key'),
//           allowHTTP1: true },

//         (req, res) => {
//             (req, res) => {
//                 console.log('Request! Version:', req.httpVersion)
//                 braid.handle_request(req, res)
//             }
//         }
//     ).listen(3009)
// }
// else if (type === 'h1-simple') {
//     require('http').createServer(
//         braid.handle_request
//     ).listen(3009)
// }
// else if (type === 'h1-longer') {
//     var server = require('http').createServer()
//     server.on('request', braid.handle_request)
//     server.listen(3009)
// }

var pretty_msg = x => ({...x, ...{res:x.res && true,
                                  req:x.req && true}})
