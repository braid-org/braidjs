var braidify = require('../braid-http-server.js')
var sendfile = (f, req, res) => res.end(require('fs').readFileSync(require('path').join(__dirname, f)))
require('http').createServer(
    (req, res) => {

        // Braidifies our server
        braidify(req, res)

        console.log('Request:', req.url, req.method,
                    req.subscribe ? ('Subscribe: ' + req.subscribe)
                    : 'no subscription')

        // We'll serve Braid at the /json route!
        if (req.url === '/json' && req.method === 'GET') {
            res.setHeader('content-type', 'application/json')
            // res.setHeader('accept-subscribe', 'true')

            // If the client requested a subscription, let's honor it!
            if (req.subscribe)
                res.startSubscription()

            // Send the current version
            res.sendUpdate({
                version: ['test'],
                parents: ['oldie'],
                body: JSON.stringify({this: 'stuff'})
            })

            if (req.subscribe) {
                // Send a patch
                res.sendUpdate({
                    VersiOn: ['test1'],             // Upper/lowercase is ignored
                    ParEnts: ['oldie', 'goodie'],
                    patch: {unit: 'json', range: '[1]', content: '1'},
                    hash: '42',
                    ':status': '115'
                })

                // Send a patch as array
                res.sendUpdate({
                    Version: ['test2'],
                    patch: {unit: 'json', range: '[2]', content: '2'}
                })

                // Send two patches as array
                res.sendUpdate({
                    version: ['test3'],
                    patches: [{unit: 'json', range: '[3]', content: '3', hash: '43'},
                              {unit: 'json', range: '[4]', content: '4'}]
                })

                // Simulate an update after the fact
                setTimeout(() => res.sendUpdate({version: ['another!'], body: '"!"'}), 200)
            }

            // End the response, if this isn't a subscription
            if (!req.subscribe) {
                res.statusCode = 200
                res.end()
            }
        }


        // We'll accept Braid at the /json PUTs!
        if (req.url === '/json' && req.method === 'PUT') {
            req.parseUpdate().then(update => {
                console.log('We got PUT', req.version, 'update', update)
                res.statusCode = 200
                res.end()
            })
        }

        // Static HTML routes here:
        else if (req.url === '/')
            sendfile('client.html', req, res)
        else if (req.url === '/braid-http-client.js')
            sendfile('../braid-http-client.js', req, res)
        else if (req.url === '/test-responses.txt')
            sendfile('test-responses.txt', req, res)
    }

).listen(9000, () => console.log("Listening on http://localhost:9000..."))
