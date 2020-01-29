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
        console.log('connected')
        function connect () { console.log('connecting!'); /*pipe.connected()*/ }
        function send (msg) { console.log('sending',msg); conn.send(JSON.stringify(msg)) }

        var pipe = require('./pipe.js')({node, connect, send})
        conn.on('message', (msg) => {console.log('got data', msg); pipe.recv(JSON.parse(msg)) })
        conn.on('close', ()       => {console.log('closed'); pipe.disconnected() })
        pipe.connected()
    })
    // s.installHandlers(httpserver, {prefix:'/.braid-websocket'})
    // http_server.listen(port, () => { console.log('Listening on ' + 'http://<host>:' + port) })
}