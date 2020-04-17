
var node = require('./sqlite-store.js')(require('./node.js')(), 'db.sqlite')
node.on_errors.push((key, origin) => node.unbind(key, origin))
node.fissure_lifetime = 1 // 4
node.compress()

var wss = require('./networks/websocket-server.js')(node)

show_debug = true
print_network = true
