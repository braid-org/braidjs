
var port = 3007

require('./braid-bundler.js')
var fs = require('fs')
var bundle = fs.readFileSync('braid-bundle.js')
var wiki_client = fs.readFileSync('wiki-client.html')
var cb = (req, res) => {
    res.writeHead(200)
    res.end(req.url == '/braid-bundle.js' ? bundle : wiki_client)
}

var server = (fs.existsSync('privkey.pem') && fs.existsSync('fullchain.pem')) ?
    require('https').createServer({
        key: fs.readFileSync('privkey.pem'),
        cert: fs.readFileSync('fullchain.pem')
    }, cb) :
    require('http').createServer(cb)
server.listen(port)
var wss = new (require('ws').Server)({server})

var node = require('./sqlite-store.js')(require('./node.js')(), 'db.sqlite')
node.on_errors.push((key, origin) => node.unbind(key, origin))
node.fissure_lifetime = 1000*60*60*24*7 // week
node.compress()

var ws = require('./networks/websocket-server.js')(node, {wss})

console.log('keys at startup: ' + JSON.stringify(Object.keys(node.resources)))

ws.on('connection', function(conn) {
    conn.on('message', (msg) => {
        console.log('GOT: ' + msg)
    })
})
