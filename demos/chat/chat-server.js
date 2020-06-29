const fs = require('fs');
const path = require('path');
const { assert } = require('console');
// When we have the npm version, this can be improved
const lib_path = "../../";

// Bundler doesn't actually return anything, but calling it with require 
//   generates the braid-bundle.js
const bundler = require(path.join(lib_path, './util/braid-bundler.js'));
const sqlite = require(path.join(lib_path, './util/sqlite-store.js'));
const braid = require(path.join(lib_path, './braid.js'));
const braidHttpServer = require(path.join(lib_path, './protocol-http1/http1-server.js'));

const port = 3009;
global.g_show_protocol_errors = true;
global.show_debug = true;

// Static files we want to serve over http
//  and where to find them on disk, and their mime types
const knownFiles = {
	'/braid-bundle.js': {
		path: path.join(lib_path, `/builds/braid-bundle.js`),
		mime: 'text/javascript'},
	'/chat.html': {
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
Object.entries(knownFiles).forEach(k => {
	let key = k[0], value = k[1];
	assert(fs.existsSync(value.path));
	knownFiles[key].data = fs.readFileSync(value.path);
})
// A simple method to serve one of the known files
function serveFile(req, res) {
	const f = knownFiles[req.url];
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
    }) :
    require('http').createServer();

// Initialize a braid
var node = braid();
node.ons.push((type, vals) => {
	if (type == "fissure")
		console.log("Fissured!")
})
// Unsubscribe on error
// Maybe not needed
node.on_errors.push((key, origin) => node.unbind(key, origin))
// Setup the braid sqlite store at a local db
sqlite(node, 'db.sqlite');

// For any of the default keys, if we have no versions for them, set an initial version.
Object.keys(knownKeys)
	.filter(k => Object.keys(node.resource_at(k).current_version).length == 0)
	.forEach(k => node.set(k, knownKeys[k]));

// Bind the http server to the braid
// Tell the binding that we want to use serveFile to respond to GET requests that braid doesn't recognize.
braidHttpServer(node, server, serveFile);
server.listen(port);

console.log('Keys at startup: ', Object.keys(node.resources));