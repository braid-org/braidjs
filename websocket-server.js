// Example braid-peer as a web server

module.exports = require['websocket-server'] = function add_websocket_server(node, certificate, private_key) {
    var port = '3007'
    // var http_server = require('http').createServer()
    var s = new (require('ws')).Server({port})
    // var s = require('sockjs').createServer({
    //     sockjs_url: 'https://cdn.jsdelivr.net/sockjs/0.3.4/sockjs.min.js',
    //     disconnect_delay: 600 * 1000,
    //     heartbeat_delay: 6000 * 1000
    // })

    s.on('connection', function(conn) {
        function connect () { log('ws-serve: connecting!'); /*pipe.connected()*/ }
        function send (msg) { log('ws-serve: sending', msg.substr(0,200)); conn.send(JSON.stringify(msg)) }

        var pipe = require('./pipe.js')({node, connect, send})
        conn.on('message', (msg) => {log('ws-serve: got data', pipe.them, msg); pipe.recv(JSON.parse(msg)) })
        conn.on('close', ()       => {log('ws-serve: closed'); pipe.disconnected() })
        pipe.connected()
    })
    // s.installHandlers(httpserver, {prefix:'/.braid-websocket'})
    // http_server.listen(port, () => { console.log('Listening on ' + 'http://<host>:' + port) })
}