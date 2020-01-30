// Example braid-peer as a web server

module.exports = require['websocket-server'] = function add_websocket_server(node, certificate, private_key) {
    var port = '3007'
    var s = new (require('ws')).Server({port})

    s.on('connection', function(conn) {
        function connect () { log('ws-serve: connecting!'); /*pipe.connected()*/ }
        function send (msg) { log('ws-serve: SEND', JSON.stringify(msg).substr(0,70)); conn.send(JSON.stringify(msg)) }

        var pipe = require('./pipe.js')({node, connect, send})
        conn.on('message', (msg) => {log('ws-serve: RECV', pipe.them, msg.substr(0,70)); pipe.recv(JSON.parse(msg)) })
        conn.on('close', ()       => {log('ws-serve: closed'); pipe.disconnected() })
        pipe.connected()
    })
    return s
}