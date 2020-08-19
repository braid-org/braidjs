var pubsub = require('./pubsub.js')
assert = console.assert

// Data
var chat = [
    {msg: 'hello'},
    {msg: 'oh, hi!'},
    {msg: 'croikie!'}
]
var curr_version = () => chat.length + ''

// Braid interface to the data
var braid_data = {
    get (msg) {
        if (msg.parents && msg.parents.length > 0)
            return chat.slice(parseInt(msg.parents[0]))
        else
            return chat
    },

    subscribe (msg) {
        // If no parents specified, send the whole thing
        if (!msg.parents || msg.parents.length === 0)
            send({
                ...msg,
                ...{body: JSON.stringify(this.get(msg))},
                version: curr_version()
            })

        // If parents specified, parse it as a number, and send a patch from
        // that region in the chat to the end of the chat
        else {
            assert(msg.parents && msg.parents.length > 0)
            send({
                ...msg,
                ...{patches: this.get(msg)},
                version: curr_version()
            })
        }
    },
    
    change (msg) {
        msg.parents = msg.parents || [curr_version()]
        chat.push(JSON.parse(msg.patches[0].value))
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
send = http.send
var server = require('http').createServer(http.handle_request).listen(3009)
