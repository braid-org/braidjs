const port = 3007;

require('../../util/braid-bundler.js')
var fs = require('fs')
var bundle = fs.readFileSync('../../builds/braid-bundle.js')
var wiki_client = fs.readFileSync('wiki-client.html')
var cb = (req, res) => {
    res.writeHead(200)
    res.end(req.url == '/braid-bundle.js' ? bundle : wiki_client)
}

var server = (fs.existsSync('certs/private-key') && fs.existsSync('certs/certificate')) ?
    require('https').createServer({
        key: fs.readFileSync('certs/private-key'),
        cert: fs.readFileSync('certs/certificate')
    }, cb) :
    require('http').createServer(cb)
server.listen(port)
var wss = new (require('ws').Server)({server})

var node = require('../../braid.js')()
node.fissure_lifetime = 1000*60*60*24*7 // week
require('../../util/sqlite-store.js')(node, 'db.sqlite')
node.on_errors.push((key, origin) => node.unbind(key, origin))

var ws = require('../../protocol-websocket//websocket-server.js')(node, {wss})

console.log('keys at startup: ' + JSON.stringify(Object.keys(node.resources)))

