// Example braid-peer as a web server
// options = {
//     port: // default is 3007
//     wss: // default is null, will create a 'ws' module WebSocket.Server with the given port
// }
module.exports = require['websocket-server'] = function add_websocket_server(node, options) {
    if (!options) options = {}
    var s = options.wss || new (require('ws')).Server({port: options.port || 3007})
    s.on('connection', function(conn, req) {
        var pipe = require('../pipe.js')({node, connect, disconnect, send})

        const ip = req.socket.remoteAddress;
        // console.log(`New connection from ${ip}`)
        conn.on('message', (msg) => {
            var m = JSON.parse(msg);
            if (m.method != "ping" && m.method != "pong") {
                nlog('ws: hub Recvs',
                     m.method.toUpperCase().padEnd(7),
                     ((pipe.remote_peer || m.my_name_is)+'').slice(0,4).padEnd(4),
                     msg.substr(0, terminal_width() - 27))
                // console.log(`${ip} -> Server:`);
                // console.group();
                // console.dir(m, {depth: 3});
                // console.groupEnd();
            }
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
            if (msg.method != "ping" && msg.method != "pong") {
                nlog('ws: hub Sends',
                     msg.method.toUpperCase().padEnd(7),
                     ((pipe.remote_peer || '?')+'').slice(0,4).padEnd(4),
                     JSON.stringify(msg).substr(0, terminal_width() - 27))
                // console.log(`Server -> ${ip}:`);
                // console.group();
                // console.dir(msg, {depth: 3});
                // console.groupEnd();
            }
            conn.send(msgText);
        }
    })
    return s
}