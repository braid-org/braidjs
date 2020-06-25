const fs = require('fs');
const path = require('path');

const port = 3009;
const lib_path = "../../";
require(path.join(lib_path, './util/braid-bundler.js'));
const sqlite = require(path.join(lib_path, './util/sqlite-store.js'))
const braid = require(path.join(lib_path, './braid.js'));

global.g_show_protocol_errors = true;
global.show_debug = true;

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

var node = braid();
node.fissure_lifetime = 1000 * 60 // Fissures can only last 1 minute...
sqlite(node, 'db.sqlite');
node.on_errors.push((key, origin) => node.unbind(key, origin))

// For any of the default keys, if we have no versions for them, set an initial version.
Object.keys(knownKeys).filter(k => Object.keys(node.resource_at(k).current_version).length == 0).forEach(k => node.set(k, knownKeys[k]))

require(path.join(lib_path, './protocol-http1/http1-server.js'))(node, server, cb)

console.log('Keys at startup: ' + JSON.stringify(Object.keys(node.resources)))
server.listen(port);