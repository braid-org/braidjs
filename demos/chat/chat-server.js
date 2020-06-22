const fs = require('fs');
const path = require('path');

const port = 3009;
const lib_path = "../../";
require('../../builds/braid-bundler.js')(lib_path);

var knownFiles = ['/braid-bundle.js', '/chat.html', '/chat.js', '/chat.css']
var cb = (req, res) => {
	if (knownFiles.includes(req.url)) {
		res.writeHead(200);
		res.end(fs.readFileSync(path.join(".", req.url)));
	} else {
		res.writeHead(404);
		res.end();
	}
	res._headerSent = false;
}

var server = (fs.existsSync('certs/private-key') && fs.existsSync('certs/certificate')) ?
    require('https').createServer({
        key: fs.readFileSync('certs/private-key'),
        cert: fs.readFileSync('certs/certificate')
    }, cb) :
    require('http').createServer(cb)

var node = require(path.join(lib_path, './braid.js'))()
node.fissure_lifetime = 1000*60*60*24 // day
require(path.join(lib_path, './util/sqlite-store.js'))(node, 'db.sqlite')
node.on_errors.push((key, origin) => node.unbind(key, origin))

require(path.join(lib_path, './protocol-http1/http1-server.js'))(node, server, cb)

console.log('Keys at startup: ' + JSON.stringify(Object.keys(node.resources)))
server.listen(port);
