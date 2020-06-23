const fs = require('fs');
const path = require('path');

const port = 3009;
const lib_path = "../../";
require('../../util/braid-bundler.js');

const knownFiles = {
	'/braid-bundle.js': {path: path.join(lib_path, `/builds/braid-bundle.js`),
						 mime: 'text/javascript'},
	'/chat.html': {path: path.join('.', '/chat.html'),
				   mime: 'text/html'},
	'/chat.js': {path: path.join('.', '/chat.js'),
				 mime: 'text/javascript'},
	'/chat.css': {path: path.join('.', '/chat.css'),
				  mime: 'text/css'}
}
const knownKeys = {
	'/usr': {},
	'/chat': []
}
var cb = (req, res) => {
	const f = knownFiles[req.url];
	if (f) {
		res.writeHead(200, headers={'content-type': f.mime});
		res.end(fs.readFileSync(f.path));
	} else {
		res.writeHead(404);
		res.end();
	}
}

var server = (fs.existsSync('certs/private-key') && fs.existsSync('certs/certificate')) ?
    require('https').createServer({
        key: fs.readFileSync('certs/private-key'),
        cert: fs.readFileSync('certs/certificate')
    }) :
    require('http').createServer();

var node = require(path.join(lib_path, './braid.js'))()
Object.keys(knownKeys).forEach(k => node.default(k, knownKeys[k]))
node.fissure_lifetime = 1000*60*60 // hour
require(path.join(lib_path, './util/sqlite-store.js'))(node, 'db.sqlite')
node.on_errors.push((key, origin) => node.unbind(key, origin))

require(path.join(lib_path, './protocol-http1/http1-server.js'))(node, server, cb)

console.log('Keys at startup: ' + JSON.stringify(Object.keys(node.resources)))
server.listen(port);
