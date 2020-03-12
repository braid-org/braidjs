// Example braid-peer as a web browser client
w = 70

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
                 ' Recvs',
                 JSON.parse(msg.data).method.toUpperCase().padEnd(7),
                 '   ',
                 msg.data.substr(0,w))
            
            pipe.recv(JSON.parse(msg.data))
        }
        sock.onclose   = ()  => {
            pipe.disconnected()
            if (enabled) setTimeout(connect, 5000)
        }
    }
    var pipe = require('../pipe.js')({
        id: node.pid,
        type: 'ws-client',
        node,
        connect,
        send: (msg) => {
            nlog('ws:',
                 node.pid,
                 ' Sends',
                 msg.method.toUpperCase().padEnd(7),
                 '   ',
                 JSON.stringify(msg).substr(0,w))

            sock.send(JSON.stringify(msg))
        }
    })
    node.bind(prefix, pipe)

    return {
        pipe,
        enabled() {return enabled},
        enable()  {nlog('ENABLING PIPE', pipe.id);enabled = true; connect()},
        disable() {nlog('DISABLING PIPE',pipe.id);enabled = false;
                   try { sock.terminate() } catch (e) {}},
        toggle()  {if (enabled) {disable()} else enable()}
    }
}
