// Example braid-peer as a web server
w = 700

// options = {
//     port: // default is 3007
//     wss: // default is null, will create a 'ws' module WebSocket.Server with the given port
// }
module.exports = require['websocket-server'] = function add_websocket_server(node, options) {
    if (!options) options = {}
    var s = options.wss || new (require('ws')).Server({port: options.port || 3007})
    s.on('connection', function(conn) {

        // work here
        var conn_id = Math.random().toString(36).slice(2)

        var pipe = require('../pipe.js')({node, connect, disconnect, send, conn_id})

        conn.on('message', (msg) => {
            var m = JSON.parse(msg)
            nlog('ws: hub Recvs',
                 m.method.toUpperCase().padEnd(7),
                 ((pipe.them || m.my_name_is)+'').padEnd(3),
                 msg.substr(0,w))
            pipe.recv(JSON.parse(msg))
        })
        conn.on('close', () => {

            console.log('close got called!..: <<dead>>' + s.dead+ ' :: connid: ' + conn_id)


            log('ws: socket closed ', s.dead ? '<<dead>>' : '')
            if (s.dead) return
            pipe.disconnected()
        })
        pipe.connected()

        function connect () {
            // we're connected already, nothing to do
            log('ws-serve: connected')
            // pipe.connected() <-- this is called just above
        }
        function disconnect () {
            conn.terminate()
        }
        function send (msg) {
            nlog('ws: hub Sends',
                 msg.method.toUpperCase().padEnd(7),
                 ((pipe.them || '?')+'').padEnd(3),
                 JSON.stringify(msg).substr(0,w))
            conn.send(JSON.stringify(msg))
        }
    })
    return s
}