var u = require('../../util/utilities.js')

// The synchronized data store
var chat = [
    {msg: 'hello'},
    {msg: 'oh, hi!'},
    {msg: 'croikie!'}
]
var curr_version = () => chat.length + ''

// Braid handlers for data
var handlers = {
    get (msg) {
        if (msg.parents && msg.parents.length > 0)
            return chat.slice(parseInt(msg.parents[0]))
        else
            return chat
    },

    subscribe (msg) {
        // If no parents specified, send the whole thing
        if (!msg.parents || msg.parents.length === 0)
            http.send({
                ...msg,
                ...{body: JSON.stringify(this.get(msg))},
                version: curr_version()
            })

        // If parents specified, parse it as a number, and send a patch from
        // that region in the chat to the end of the chat
        else {
            assert(msg.parents && msg.parents.length > 0)
            http.send({
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


// Receives Braid messages from HTTP
var receiver = (msg) =>
    handlers[msg.method] && handlers[msg.method](msg)

// Handles subscriptions
var subscribing_receiver = (msg) =>
    require('./subscriptions.js')(msg, http.send, receiver)

// Connect it to Braid-HTTP
var http = require('./http-server.js')
http.receiver = subscribing_receiver

// Start the server
var server = require('http').createServer(http.handle_request).listen(3009)
