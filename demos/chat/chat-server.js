const fs = require('fs');
const path = require('path');
const ws = require('ws');
// When we have the npm version, this can be improved
const lib_path = "../../";

// Bundler doesn't actually return anything, but calling it with require 
//   generates the braid-bundle.js
const bundler = require(path.join(lib_path, './util/braid-bundler.js'));
const sqlite = require(path.join(lib_path, './util/sqlite-store.js'));
const braid = require(path.join(lib_path, './braid.js'));
const braidWebsocketServer = require(path.join(lib_path, './protocol-websocket/websocket-server.js'));
const braidHttpServer = require(path.join(lib_path, './protocol-http1/http1-server.js'));

const port = 3009;
global.g_show_protocol_errors = true;
global.print_network = true
//global.show_debug = true;

// Static files we want to serve over http
//  and where to find them on disk, and their mime types
const knownFiles = {
	'/braid-bundle.js': {
		path: path.join(lib_path, `/builds/braid-bundle.js`),
		mime: 'text/javascript'},
	'/braidchat': {
		path: path.join('.', '/chat.html'),
		mime: 'text/html'},
	'/chat.js': {
		path: path.join('.', '/chat.js'),
		mime: 'text/javascript'},
	'/chat.css': {
		path: path.join('.', '/chat.css'),
		mime: 'text/css'}
};
// Keys that braid knows about, and their default values.
const knownKeys = {
	'/usr': {},
	'/chat': []
};
// Let's cache all of the known files. 
// The chat, js, and css are each less than 10 KB
// The bundle is about 150KB, so maybe we should add minification and sourcemap.
Object.values(knownFiles).forEach(file => {
	file.data = fs.readFileSync(file.path);
})
// A simple method to serve one of the known files
function serveFile(req, res) {
	if (knownKeys.hasOwnProperty(req.url))
		return braidCallback(req, res);
	const reqPath = new URL(req.url, `http://${req.headers.host}`);
	const f = knownFiles[reqPath.pathname];
	if (f) {
		res.writeHead(200, headers = {'content-type': f.mime});
		res.end(f.data);
	} else {
		res.writeHead(404);
		res.end();
	}
}
// Create either an http or https server, depending on the existence of ssl certs
var server = (fs.existsSync('certs/private-key') && fs.existsSync('certs/certificate')) ?
    require('https').createServer({
        key: fs.readFileSync('certs/private-key'),
        cert: fs.readFileSync('certs/certificate')
    }, serveFile) :
    require('http').createServer(serveFile);

// Initialize a braid
var node = braid();
node.fissure_lifetime = 1000 * 60 * 60 * 8;
// Setup the braid sqlite store at a local db
sqlite(node, 'db.sqlite');
// Unsubscribe on error
// Maybe not needed
node.on_errors.push((key, origin) => node.unbind(key, origin))

// For any of the default keys, if we have no versions for them, set an initial version.
Object.keys(knownKeys)
	.filter(k => Object.keys(node.resource_at(k).current_version).length == 0)
	.forEach(k => node.set(k, knownKeys[k]));

var braidCallback = braidHttpServer(node);
var wss = new ws.Server({server})
braidWebsocketServer(node, {port, wss})

console.log('Keys at startup: ' + JSON.stringify(Object.keys(node.resources)))
server.listen(port);