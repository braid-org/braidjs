var assert = require('assert')

// Chat Data
var resources = {
    '/chat': [
        {text: 'Hello!'},
        {text: 'This is a post!'},
        {text: 'This is a post-modern!'}
    ]
}
var chat_version = () => [resources['/chat'].length.toString()]
var post_versions = {}

// Subscription data
var subscriptions = {}
var subscription_hash = (req) => JSON.stringify([req.headers.peer, req.url])

// Create our HTTP bindings!
//var braidify = require('../../braid-http-server')
var braidify = require('../../index.js').http_server
var app = require('http2-express-bridge')(require('express'))

// Middleware
app.use(free_the_cors)
app.use(braidify)

app.get('/chat', (req, res) => {
    console.log('get for peer', req.headers.peer)
    // Honor any subscription request
    if (req.subscribe) {     // Using the new subscription feature braidify is adding to req & res
        res.startSubscription({ onClose: _=> delete subscriptions[subscription_hash(req)] })
        subscriptions[subscription_hash(req)] = res
        console.log('We are subscribing at hash', subscription_hash(req))
    } else {
        res.statusCode = 200
    }

    // Send the current version
    res.sendUpdate({
        version: chat_version(),
        body: JSON.stringify(resources['/chat'])
    })

    if (!req.subscribe)
        res.end()
})

app.put('/chat', async (req, res) => {
    var patches = await req.patches()  // Braidify adds .patches() to request objects

    // Bug: Should return error code (40x?) for invalid request instead of crashing
    assert(patches.length === 1)
    assert(patches[0].range === '[-0:-0]')
    assert(patches[0].unit === 'json')

    resources['/chat'].push(JSON.parse(patches[0].content))

    // Now send the data to all subscribers
    for (var k in subscriptions) {
        var [peer, url] = JSON.parse(k)
        if (url === req.url  // Send only to subscribers of this URL
            && peer !== req.headers.peer)  // Skip the peer that sent this PUT

            subscriptions[k].sendUpdate({
                version: chat_version(),
                patches
            })
    }
    
    res.statusCode = 200
    res.end()
})

// Now serve the HTML and client files
var sendfile = (f) => (req, res) => res.sendFile(require('path').join(__dirname, f))
app.get('/',                   sendfile('client.html'));
app.get('/braid-http-client.js', sendfile('../../braid-http-client.js'))

// Free the CORS!
function free_the_cors (req, res, next) {
    console.log('free the cors!', req.method, req.url)

    // Hey... these headers aren't about CORS!  Let's move them into the braid
    // libraries:
    res.setHeader('Range-Request-Allow-Methods', 'PATCH, PUT')
    res.setHeader('Range-Request-Allow-Units', 'json')
    res.setHeader("Patches", "OK")
    // ^^ Actually, it looks like we're going to delete these soon.

    var free_the_cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS, HEAD, GET, PUT, UNSUBSCRIBE",
        "Access-Control-Allow-Headers": "subscribe, peer, version, parents, merge-type, content-type, patches, cache-control"
    }
    Object.entries(free_the_cors).forEach(x => res.setHeader(x[0], x[1]))
    if (req.method === 'OPTIONS') {
        res.writeHead(200)
        res.end()
    } else
        next()
}

// Launch the https server
var server = require('http2').createSecureServer(
    {
        cert:       require('fs').readFileSync('./certificate'),
        key:        require('fs').readFileSync('./private-key'),
        allowHTTP1: true
    },
    app
)
// server.setTimeout(0, x => console.log('Server timeout!', x))
// console.log('Server timeouts:', server.timeout, server.keepAliveTimeout)
server.listen(3009, _=> console.log('listening on port 3009...'))
