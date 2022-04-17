const port = 3007;

const fs = require('fs')
const path = require('path')

var bundle = require('../../packages/util/braid-bundler.js')

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

var node = require('../../packages/kernel/node.js')()
var store = require('../../packages/kernel/sqlite-store.js')('db.sqlite')
var store = require('../../packages/kernel/store.js')(node, store).then(node => {
    node.fissure_lifetime = 1000*60*60*8 // 8 hours

    node.on_errors.push((key, origin) => node.unbind(key, origin))

    var ws =require('../../packages/kernel/websocket-server.js')(node, {wss})

    console.log('keys at startup: ' + JSON.stringify(Object.keys(node.resources)))
    console.log('serving on port: ' + port)
})