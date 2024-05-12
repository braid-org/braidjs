assert = require('assert')

// Blog Data
var resources = {
    '/blog': [
        {link: '/post/1'},
        {link: '/post/2'},
        {link: '/post/3'}
    ],
    '/post/1': {body: 'First post OMGGG!!!!'},
    '/post/2': {body: `Once upon a time,
I ate a big fish.
It was really tasty.`},
    '/post/3': {body: "It's nice when things come in threes."}
}
var curr_version = () => [ resources['/blog'].length + '' ]



// Subscription data
var subscriptions = {}
var rhash = (req) => JSON.stringify([req.headers.peer, req.url])


// Create our HTTP bindings!
var braidify = require('../../index.js').http_server
var app = require('http2-express-bridge')(require('express'))

// Middleware
app.use(log_request)
app.use(free_the_cors)
app.use(braidify)

// HTTP Routes
function getter (req, res) {
    // Make sure URL is valid
    if (!(req.url in resources)) {
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
    res.sendUpdate({
        version: curr_version(),
        body: JSON.stringify(resources[req.url])
    })

    if (!req.subscribe)
        res.end()
}
app.get('/blog',     getter)
app.get('/post/:id', getter)

app.put('/blog', async (req, res) => {
    var patches = (await req.parseUpdate()).patches

    console.log('Extending /blog with!', patches)
    // assert(patches.length === 1)
    // assert(patches[0].range === '[-0:-0]')

    resources['/blog'].push(JSON.parse(patches[0].content))

    for (var k in subscriptions) {
        var [peer, url] = JSON.parse(k)
        if (peer !== req.headers.peer && url === req.url)
            subscriptions[k].sendUpdate({
                version: curr_version(),
                patches
            })
    }

    res.statusCode = 200
    res.end()
})
app.put('/post/:id', async (req, res) => {
    var update = await req.parseUpdate()

    console.log('Setting', req.url, 'with', update)
    assert(typeof update.body === 'string')

    resources[req.url] = JSON.parse(update.body)

    for (var k in subscriptions) {
        var [peer, url] = JSON.parse(k)
        if (peer !== req.headers.peer && url === req.url)
            subscriptions[k].sendUpdate({
                version: curr_version(),
                body: update.body
            })
    }

    res.end()
})

// Now serve the HTML and client files
sendfile = (f) => (req, res) => res.sendFile(f, {root:'../..'})
app.get('/',                     sendfile('demos/blog/client.html'));
app.get('/braid-http-client.js', sendfile('braid-http-client.js'))


// Define Middleware
function log_request (req, res, next) {
    console.log(req.method, req.url)
    next()
}
function free_the_cors (req, res, next) {
    res.setHeader('Range-Request-Allow-Methods', 'PATCH, PUT')
    res.setHeader('Range-Request-Allow-Units', 'json')
    res.setHeader("Patches", "OK")
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
