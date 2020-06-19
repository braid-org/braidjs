// Example braid-peer as a web browser client
w = 70

module.exports = require['websocket-client'] = function add_websocket_client({node, url, prefix, create_websocket}) {
    url = url       || 'ws://localhost:3007/'
    prefix = prefix || '/*'

    var client_creds = null
    var enabled = true
    var sock

    create_websocket = create_websocket || function () {
        return new WebSocket(url + '.braid-websocket')
    }

    var reconnect_timeout = null
    
    var connect = () => {
        clearTimeout(reconnect_timeout)
        if (!enabled) { return }

        sock           = create_websocket()
        sock.onopen    = ()  => {
            pipe.connected()
        }
        sock.onmessage = msg => {
            nlog('ws:',
                 node.pid,
                 ' Recvs',
                 JSON.parse(msg.data).method.toUpperCase().padEnd(7),
                 '   ',
                 msg.data.substr(0,w))
            pipe.recv(JSON.parse(msg.data))
        }
        var onclose_called_already = false
        var local_sock = sock
        sock.onclose   = (a)  => {
            if (onclose_called_already) { return }
            onclose_called_already = true
            if (local_sock != sock) { return }
            
            pipe.disconnected()
            if (enabled) {
                if (typeof(g_debug_WS_messages_delayed) != 'undefined')
                    g_debug_WS_messages_delayed.push(connect)
                else reconnect_timeout = setTimeout(connect, 5000)
            }
        }
        sock.onerror = () => {}
    }
    var disconnect = () => {
        sock.close()
        sock.onclose()
    }

    var pipe = require('../pipe.js')({
        id: node.pid,
        type: 'ws-client',
        node,
        connect,
        disconnect,
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
        disable() {nlog('DISABLING PIPE',pipe.id);enabled = false; sock.close()},
        toggle()  {if (enabled) {disable()} else enable()}
    }
}
