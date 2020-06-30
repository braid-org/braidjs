// Example braid-peer as a web browser client

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
            msg = msg.data
            var data = JSON.parse(msg)
            var method = data.method.toUpperCase()
            if (method !== "PING" && method !== "PONG") {
                nlog('WS:',
                     node.pid.slice(0,3).padEnd(3),
                     'recvs',
                     method.padEnd(7),
                     ((pipe.remote_peer || data.my_name_is)+'').slice(0,4).padEnd(4),
                     msg.substr(0, terminal_width() - 27))
            }
            pipe.recv(data)
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
            let method = msg.method.toUpperCase();
            if (method != "PING" && method != "PONG") {
                nlog('ws:',
                     node.pid.slice(0,3).padEnd(3),
                     'sends',
                     method.padEnd(7),
                     ((pipe.remote_peer || '?')+'').slice(0,4).padEnd(4),
                     JSON.stringify(msg).substr(0, terminal_width() - 27))
            }
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
