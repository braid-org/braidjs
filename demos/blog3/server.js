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


var subscriptions = {}
var req_hash = (req) => JSON.stringify([req.headers.client, req.url])

// Define the HTTP routes
var braidify = require('./braidify-server')
var app = require('express')()
//app.use((req, res, next) => console.log('Got requiest!', req.method, req.url), next())
app.use(free_cors)
app.use(braidify)
app.get('/blog', (req, res) => {
    // Honor any subscription request
    if (req.subscribe) {
        res.startSubscription()
        subscriptions[req_hash(req)] = res
    } else
        res.statusCode = 200
    
    // Now return the current value
    res.sendVersion({
        version: curr_version(),
        body: JSON.stringify(state.blog)
    })

    // Todo: return a slice if parents is specified.
})

app.put('/blog', async (req, res) => {
    var patches = await req.patches()
    console.log('We got patches!', patches)
    patches.forEach(patch => {
        for (var k in subscriptions) {
            var [client, url] = JSON.parse(k)
            if (client !== req.headers.client && url === req.url)
                subscriptions[k].sendVersion(req)
        }
    })
    res.statusCode = 200
    res.end()
})
app.get('/post/:id', (req, res) => {
    res.sendVersion({
        version: curr_version(),
        body: JSON.stringify(state[req.url.substr(1)])
    })
    // res.write(JSON.stringify(
    //     state[req.url.substr(1)]
    // ))
    res.end()
})
app.put('/post/:id', async (req, res) => {
    var stuff = await req.patches()
    state[req.url.substr(1)] = stuff
    res.sendVersion({
        version: curr_version(),
        body: stuff
    })
    // res.write(JSON.stringify(
    //     state[req.url.substr(1)]
    // ))
    res.end()
})

app.unsubscribe('/blog', (req, res) => {
    console.log('---yeeeeeeehaw!!!!!----')
    console.log('This is some shit!')
    // Forget:
    //  - passed the same req, res from the get
    //  - called automatically when a non-subscription
    delete subscriptions[req_hash(req)]
    res.statusCode = 200
    res.write('good!')
    res.end()
    console.log('ok we unsubscribed')
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
require('spdy').createServer(
    {
        cert:       require('fs').readFileSync('./certificate'),
        key:        require('fs').readFileSync('./private-key'),
        allowHTTP1: true
    },
    app
).listen(3009, _=> console.log('listening on port 3009...'))

// var pretty_msg = x => ({...x, ...{res:x.res && true,
//                                   req:x.req && true}})
