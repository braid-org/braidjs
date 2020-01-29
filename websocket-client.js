// Example braid-peer as a web browser client

module.exports = require['websocket-client'] = function add_websocket_client(node, url) {
    url = url || 'ws://localhost:3007/'

    var prefix = '/*',
        client_creds = null

    var enabled = true

    var sock
    var connect = () => {
        sock           = new WebSocket(url + '.braid-websocket')
        sock.onopen    = ()  => pipe.connected()
        sock.onmessage = msg => {console.log('got msg', msg.data);
                                 pipe.recv(JSON.parse(msg.data))}
        sock.onclose   = ()  => {
            pipe.disconnected()
            if (enabled) setTimeout(connect, 5000)
        }
    }
    var pipe = require('./pipe.js')({
        node,
        connect,
        send: (msg) => {console.log('Sending', msg); sock.send(JSON.stringify(msg))}
    })
    node.bind('/*', pipe)

    return {
        disable() {enabled = false; sock.terminate()},
        enable()  {enabled = true;  connect()},
        enabled() {return enabled},
        toggle()  {if (enabled) {disable()} else enable()}
    }
}
