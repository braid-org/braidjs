const fs = require('fs');
const path = require('path');

const port = 3009;
const lib_path = "../../";
require('../../braid-bundler.js')(lib_path);


var knownFiles = ['/braid-bundle.js', '/chat.html', '/chat.js', '/chat.css', '/serviceworker.js']
var cb = (req, res) => {
	if (knownFiles.includes(req.url)) {
		res.writeHead(200);
		res.end(fs.readFileSync(path.join(".", req.url)));
	} else {
		res.writeHead(404);
		res.end();
	}
}

var server = (fs.existsSync('certs/private-key') && fs.existsSync('certs/certificate')) ?
    require('https').createServer({
        key: fs.readFileSync('certs/private-key'),
        cert: fs.readFileSync('certs/certificate')
    }, cb) :
    require('http').createServer(cb)
server.listen(port)
var wss = new (require('ws').Server)({server})

var node = require(path.join(lib_path, './node.js'))()
node.fissure_lifetime = 1000*60*60*24 // day
require(path.join(lib_path, './sqlite-store.js'))(node, 'db.sqlite')
node.on_errors.push((key, origin) => node.unbind(key, origin))

var ws = require(path.join(lib_path, './networks/websocket-server.js'))(node, {wss})

console.log('Keys at startup: ' + JSON.stringify(Object.keys(node.resources)))
