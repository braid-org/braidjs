// Example braid-peer as a web browser client

module.exports = require['websocket-client'] = function add_websocket_client({node, url, prefix}) {
    url = url       || 'ws://localhost:3007/'
    prefix = prefix || '/*'

    console.log('ws-client: Making a client on', node.pid)

    var client_creds = null
    var enabled = true
    var sock

    var connect = () => {
        sock           = new WebSocket(url + '.braid-websocket')
        sock.onopen    = ()  => pipe.connected()
        sock.onmessage = msg => {console.log('ws-client: got msg', msg.data);
                                 pipe.recv(JSON.parse(msg.data))}
        sock.onclose   = ()  => {
            pipe.disconnected()
            if (enabled) setTimeout(connect, 5000)
        }
    }
    var pipe = require('./pipe.js')({
        id: node.pid,
        node,
        connect,
        send: (msg) => {console.log('ws-client: Sending', msg); sock.send(JSON.stringify(msg))}
    })
    node.bind(prefix, pipe)

    return {
        disable() {enabled = false; sock.terminate()},
        enable()  {enabled = true;  connect()},
        enabled() {return enabled},
        toggle()  {if (enabled) {disable()} else enable()}
    }
}
