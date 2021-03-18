// Example braid-peer as a web server
// options = {
//     port: // default is 3007
//     wss: // default is null, will create a 'ws' module WebSocket.Server with the given port
// }
module.exports = require['websocket-server'] = function add_websocket_server(node, options) {
    if (!options) options = {}
    var s = options.wss || new (require('ws')).Server({port: options.port || 3007})
    s.on('connection', function(conn, req) {
        var pipe = require('./pipe.js')({node, connect, disconnect, send})
        const peer_name = (m) => (pipe.remote_peer || (m || {}).my_name_is || 'C-?').toString();
        const ip = req.socket.remoteAddress;
        // console.log(`New connection from ${ip}`)
        conn.on('message', (text) => {
            var msg = JSON.parse(text);
            if (msg.method != "ping" && msg.method != "pong") {
                nlogf('WS', peer_name(msg).slice(0,6).padEnd(6), '-->', 'server', msg);
            }
            pipe.recv(msg)
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
            let text = JSON.stringify(msg);
            if (msg.method != "ping" && msg.method != "pong") {
                nlogf('WS', 'server', '-->', peer_name().slice(0,6).padEnd(6), msg);
            }
            conn.send(text);
        }
    })
    return s
}