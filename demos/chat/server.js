assert = require('assert')

// Chat Data
var state = {
    '/chat': [
        {text: 'Hello!'},
        {text: 'This is a post!'},
        {text: 'This is a post-modern!'}
    ]
}
var chat_version = () => state['/chat'].length + ''
var post_versions = {}
curr_version = chat_version

// Subscription data
var subscriptions = {}
var subscriptionHash = (req) => JSON.stringify([req.headers.client, req.url])

// Create our HTTP bindings!
var braidify = require('../../protocols/http/http-server')
var app = require('express')()

// Middleware
app.use(free_the_cors)
app.use(braidify)

app.get('/chat', (req, res) => {
    // Honor any subscription request
    if (req.subscribe) {
        res.startSubscription({ onClose: _=> delete subscriptions[subscriptionHash(req)] })
        subscriptions[subscriptionHash(req)] = res
    } else {
        res.statusCode = 200
    }

    // Send the current version
    res.sendVersion({
        version: curr_version(),
        body: JSON.stringify(state['/chat'])
    })

    // Bug: if this isn't a subscription, then sendVersion() should set
    // headers on the response, rather than including virtual headers in the
    // body.

    if (!req.subscribe)
        res.end()
})

app.put('/chat', async (req, res) => {
    var patches = await req.patches()

    assert(patches.length === 1)
    assert(patches[0].range === '[-0:-0]')

    state['/chat'].push(JSON.parse(patches[0].content))

    for (var k in subscriptions) {
        var [client, url] = JSON.parse(k)
        if (client !== req.headers.client && url === req.url) {
            subscriptions[k].sendVersion({
                version: curr_version(),
                patches
            })
        }
    }
    
    res.statusCode = 200
    res.end()
})

// Now serve the HTML and client files
sendfile = (f) => (req, res) => res.sendFile(require('path').join(__dirname, f))
app.get('/',                   sendfile('client.html'));
app.get('/braidify-client.js', sendfile('../../protocols/http/http-client.js'))

// Free the CORS!
function free_the_cors (req, res, next) {
    console.log('free the cors!', req.method, req.url)
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
