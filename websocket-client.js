// Example braid-peer as a web browser client

module.exports = require['websocket-client'] = function add_websocket_client({node, url, prefix}) {
    url = url       || 'ws://localhost:3007/'
    prefix = prefix || '/*'

    var client_creds = null
    var enabled = true
    var sock

    var connect = () => {
        sock           = new WebSocket(url + '.braid-websocket')
        sock.onopen    = ()  => pipe.connected()
        sock.onmessage = msg => {
            nlog('ws:',
                 node.pid,
                 'recv',
                 JSON.parse(msg.data).method.toUpperCase().padEnd(7),
                 msg.data.substr(0,70))
            
            pipe.recv(JSON.parse(msg.data))
        }
        sock.onclose   = ()  => {
            pipe.disconnected()
            if (enabled) setTimeout(connect, 5000)
        }
    }
    var pipe = require('./pipe.js')({
        id: node.pid,
        type: 'ws-client',
        node,
        connect,
        send: (msg) => {
            nlog('ws:',
                node.pid,
                'send',
                msg.method.toUpperCase().padEnd(7),
                JSON.stringify(msg).substr(0,70))

            sock.send(JSON.stringify(msg))
        }
    })
    node.bind(prefix, pipe)

    return {
        pipe,
        enabled() {return enabled},
        enable()  {enabled = true;  connect()},
        disable() {enabled = false; sock.terminate()},
        toggle()  {if (enabled) {disable()} else enable()}
    }
}
