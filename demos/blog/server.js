var pubsub = require('./pubsub.js')
assert = console.assert

// Chat Data
var state = {
    blog: [
        {link: 'post/1'},
        {link: 'post/2'},
        {link: 'post/3'}
    ],
    'post/1': {body: 'First post madafakaaaa!!!!'},
    'post/2': {body: `And now it\'s time for something serious.

Two men today were caught demonizing a small child.  The child kicked their butt, and the story ended there.`},
    'post/3': {body: "It's nice when things come in threes."}
}
var curr_version = () => state.blog.length + ''


// Braid interface to the Data
var braid_data = {
    get (msg) {
        console.log('get msg.url:', {url: msg.url, state: state[msg.url]})
        if (msg.url === 'blog')
            if (msg.parents && msg.parents.length > 0)
                return state.blog.slice(parseInt(msg.parents[0]))
            else
                return state.blog
        else
            return state[msg.url]
    },

    subscribe (msg) {
        console.log('Subscribing', this.get(msg), pretty_msg(msg))

        // If no parents specified, send the whole thing
        if (!msg.parents || msg.parents.length === 0)
            msg.res.sendPatch({
                version: curr_version(),
                body: JSON.stringify(this.get(msg))
            })

        // If parents specified, parse it as a number, and send a patch from
        // that region in the blog to the end of the blog
        else {
            assert(msg.parents && msg.parents.length > 0)
            msg.res.sendPatch({
                version: curr_version(),
                patches: this.get(msg)
            })
        }
    },
    
    change (msg) {
        msg.parents = msg.parents || [curr_version()]
        state.blog.push(JSON.parse(msg.patches[0].value))
        msg.version = msg.version || curr_version()

        console.log('server.js: We got an update!',
                    {version: msg.version, parents: msg.parents,
                     patches: msg.patches, body: msg.body})
    },
    
    curr_version,
}


// Merge the braids
var braid_handlers = {
    get:         (msg) => {
        braid_data.subscribe(msg)
    },
    subscribe:   (msg) => {
        pubsub    .subscribe(msg)
        braid_data.subscribe(msg)
    },
    unsubscribe: (msg) => {
        pubsub     .unsubscribe(msg)
        braid_data.subscribe(msg)
    },
    change:      (msg) => {
        braid_data.change(msg)
        pubsub    .change(msg)
    }
}

// Start the server
var http = require('./http-server.js')
http.braid_handlers = braid_handlers
//send = http.send

var type = 'spdy'

if (type === 'h1') {
    require('https').createServer(
        { cert: require('fs').readFileSync('./certificate'),
          key: require('fs').readFileSync('./private-key')
        },

        http.handle_request
    ).listen(3009)
}
else if (type === 'h2') {
    require('http2').createSecureServer(
        { cert: require('fs').readFileSync('./certificate'),
          key: require('fs').readFileSync('./private-key'),
          allowHTTP1: true },

        http.handle_request
    ).listen(3009)
}
else if (type === 'spdy') {
    var app = require('express')()
    app.use(my_middle)
    require('spdy').createServer(
        { cert: require('fs').readFileSync('./certificate'),
          key: require('fs').readFileSync('./private-key'),
          allowHTTP1: true },

        // (req, res) => {
        //     console.log('got request!')
        //     http.handle_request(req, res)
        // }
        app
    ).listen(3009)

    console.log('App subscribe is', app.subscribe)
    console.log('App silly is', app.silly)

    app.options('/*', free_cors)
    app.get('/blog', (req, res) => {
        // braid.setup(req, res, {handlers})
        // - installs parser
        // - connects to event handlers for get, subscribe, unsubscribe,
        //   change, delete...
        //  ... might need user to not call res.end() or
        //  similar... constraining their existing use of express
        if (req.subscribe)
            req.enter_stream()
        http.handle_request(req, res)
    })
    app.get('/post/:id', (req, res) => {
        http.handle_request(req, res)
    })

    app.subscribe('/post/:id', (req, res) => {
    })
    app.unsubscribe('/post/:id', (req, res) => {
    })
    app.put('/post/:id', (req, res) => {
    })
}

function my_middle (req, res, next) {
    console.log('My middle is running on', req.method, req.url, '!')
    next()
}

function pubsub_middleware (req, res, next) {
    if (req.method === 'GET'
        && req.headers.subscribe) {
        // subscribe this response
        // register a handler for when the connection closes
    }
}

function free_cors (req, res) {
    res.setHeader('Range-Request-Allow-Methods', 'PATCH, PUT')
    res.setHeader('Range-Request-Allow-Units', 'json')
    res.setHeader("Patches", "OK")
    var free_the_cors = {
        "Access-Control-Allow-Origin": "*"
        ,"Access-Control-Allow-Methods": "OPTIONS, HEAD, GET, PUT"
        ,"Access-Control-Allow-Headers": "subscribe, client, version, parents, merge-type, content-type, patches, cache-control"
    }
    Object.entries(free_the_cors).forEach(x => res.setHeader(x[0], x[1]))
    if (req.method === 'OPTIONS') {
        res.writeHead(200)
        res.end()
        return
    }
}

var pretty_msg = x => ({...x, ...{res:x.res && true,
                                  req:x.req && true}})
