assert = console.assert

var http = require('./http-server.js')
send = http.send

// The server reacts to Braid messages to provide:
//   - subscriptions
//   - chat data

var data = require('./data')
var subs = require('./subscriptions')
http.braid_handlers = {
    get:         (msg) => {
        data.subscribe(msg)
    },
    subscribe:   (msg) => {
        subs.subscribe(msg)
        data.subscribe(msg)
    },
    unsubscribe: (msg) => {
        subs.unsubscribe(msg)
        data.subscribe(msg)
    },
    change:      (msg) => {
        data.change(msg)
        subs.change(msg)
    }
}

// Start the server
var server = require('http').createServer(http.handle_request).listen(3009)
