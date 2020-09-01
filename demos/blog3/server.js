var pubsub = require('./pubsub.js')
assert = require('assert')

// Chat Data
var state = {
    '/blog': [
        {link: '/post/1'},
        {link: '/post/2'},
        {link: '/post/3'}
    ],
    '/post/1': {body: 'First post madafakaaaa!!!!'},
    '/post/2': {body: `And now it\'s time for something serious.

Two men today were caught demonizing a small child.  The child kicked their butt, and the story ended there.`},
    '/post/3': {body: "It's nice when things come in threes."}
}
var curr_version = () => state['/blog'].length + ''



// Subscription data
var subscriptions = {}
var rhash = (req) => JSON.stringify([req.headers.client, req.url])


// Create our HTTP bindings!
var braidify = require('./braidify-server')
var app = require('express')()

// Middleware
app.use(free_cors)
app.use(braidify)

// HTTP Routes
function getter (req, res) {
    // Make sure URL is valid
    if (!(req.url in state)) {
        res.statusCode = 404
        res.end()
        return
    }

    // Honor any subscription request
    if (req.subscribe) {
        res.startSubscription({ onClose: _=> delete subscriptions[rhash(req)] })
        subscriptions[rhash(req)] = res
    } else
        res.statusCode = 200

    // Send the current version
    res.sendVersion({
        version: curr_version(),
        body: JSON.stringify(state[req.url])
    })
}
app.get('/blog',     getter)
app.get('/post/:id', getter)

app.put('/blog', async (req, res) => {
    var patches = await req.jsonPatches()

    assert(patches.length === 1)
    assert(patches[0].range === '[-0:-0]')

    state['/blog'].push(patches[0].value)

    patches.forEach(patch => {
        for (var k in subscriptions) {
            var [client, url] = JSON.parse(k)
            if (client !== req.headers.client && url === req.url)
                subscriptions[k].sendVersion({
                    version: curr_version(),
                    patches: patches.map(
                        p => ({...p, value: JSON.stringify(p.value)})
                    )
                })
        }
    })
    res.statusCode = 200
    res.end()
})
app.put('/post/:id', async (req, res) => {
    var patches = await req.jsonPatches()

    assert(patches.length === 1)
    assert(patches[0].range === '')

    state[req.url] = patches[0].value

    for (var k in subscriptions) {
        var [client, url] = JSON.parse(k)
        if (client !== req.headers.client && url === req.url)
            subscriptions[k].sendVersion({
                version: curr_version(),
                body: JSON.stringify(patches[0].value)
            })
    }

    res.end()
})


// Free the CORS!
function free_cors (req, res, next) {
    res.setHeader('Range-Request-Allow-Methods', 'PATCH, PUT')
    res.setHeader('Range-Request-Allow-Units', 'json')
    res.setHeader("Patches", "OK")
    var free_the_cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS, HEAD, GET, PUT, UNSUBSCRIBE",
        "Access-Control-Allow-Headers": "subscribe, client, version, parents, merge-type, content-type, patches, cache-control"
    }
    Object.entries(free_the_cors).forEach(x => res.setHeader(x[0], x[1]))
    if (req.method === 'OPTIONS') {
        res.writeHead(200)
        res.end()
    } else
        next()
}

// Launch the https server
var server = require('spdy').createServer(
    {
        cert:       require('fs').readFileSync('./certificate'),
        key:        require('fs').readFileSync('./private-key'),
        allowHTTP1: true
    },
    app
)
server.setTimeout(0, x => console.log('Server timeout!', x))
console.log('Server timeouts:', server.timeout, server.keepAliveTimeout)
server.listen(3009, _=> console.log('listening on port 3009...'))
