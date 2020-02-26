// Example braid-peer as a web server
w = 700

module.exports = require['websocket-server'] = function add_websocket_server(node, certificate, private_key) {
    var port = '3007'
    var s = new (require('ws')).Server({port})

    s.on('connection', function(conn) {
        var pipe = require('../pipe.js')({node, connect, send})

        conn.on('message', (msg) => {
            var m = JSON.parse(msg)
            nlog('ws: hub Recvs',
                 m.method.toUpperCase().padEnd(7),
                 ((pipe.them || m.my_name_is)+'').padEnd(3),
                 msg.substr(0,w))

            pipe.recv(JSON.parse(msg))
        })
        conn.on('close', () => {
            log('ws: server closed', s.dead ? '<<dead>>' : '')
            if (s.dead) return
            pipe.disconnected()
        })
        pipe.connected()

        function connect () {
            log('ws-serve: connecting!')
            // pipe.connected()
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