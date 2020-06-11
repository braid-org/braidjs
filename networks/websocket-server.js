// Example braid-peer as a web server
// options = {
//     port: // default is 3007
//     wss: // default is null, will create a 'ws' module WebSocket.Server with the given port
// }
module.exports = require['websocket-server'] = function add_websocket_server(node, options) {
    if (!options) options = {}
    var s = options.wss || new (require('ws')).Server({port: options.port || 3007})
    s.on('connection', function(conn) {
        var pipe = require('../pipe.js')({node, connect, disconnect, send})

        conn.on('message', (msg) => {
            var m = JSON.parse(msg)
            nlog('ws: hub Recvs',
                 m.method.toUpperCase().padEnd(7),
                 ((pipe.them || m.my_name_is)+'').padEnd(3),
                 m)
            pipe.recv(m)
        })
        conn.on('close', () => {
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
            let msgText = JSON.stringify(msg);
            nlog('ws: hub Sends',
                 msg.method.toUpperCase().padEnd(7),
                 ((pipe.them || '?')+'').padEnd(3),
                 msgText)
            conn.send(msgText);
        }
    })
    return s
}