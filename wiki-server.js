// Better debugging log info
['log','warn','error',].forEach((methodName) => {
  const originalMethod = console[methodName];
  console[methodName] = (...args) => {
    try {
      throw new Error();
    } catch (error) {
      originalMethod.apply(
        console,
        [
          (
            error
            .stack // Grabs the stack trace
            .split('\n')[2] // Grabs third line
            .trim() // Removes spaces
            .substring(3) // Removes three first characters ("at ")
            .replace(__dirname, '') // Removes script folder path
            .replace(/\s\(./, ' at ') // Removes first parentheses and replaces it with " at "
            .replace(/\)/, '') // Removes last parentheses
          ),
          '\n',
          ...args
        ]
      );
    }
  };
});

const port = 3009;
require('./braid-bundler.js')
var fs = require('fs')
var bundle = fs.readFileSync('braid-bundle.js')
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

var node = require('./node.js')()
node.fissure_lifetime = 1000*60*60*24*7 // week
require('./sqlite-store.js')(node, 'db.sqlite')
node.on_errors.push((key, origin) => node.unbind(key, origin))

var ws = require('./networks/websocket-server.js')(node, {wss})

console.log('keys at startup: ' + JSON.stringify(Object.keys(node.resources)))

ws.on('connection', function(conn, req) {
    const ip = req.socket.remoteAddress;
    conn.on('message', (msg) => {
        let data = JSON.parse(msg);
        if (data.method != "ping" && data.method != "pong") {
            console.log(`Client at ${ip} sent:`);
            console.group();
            console.dir(data, {depth: 4});
            console.groupEnd();
        }
    })
})
