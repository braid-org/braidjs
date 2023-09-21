var braidify = require('../braid-http-server.js')
var sendfile = (f, req, res) => res.end(require('fs').readFileSync(require('path').join(__dirname, f)))
require('http').createServer(
    (req, res) => {

        // Braidifies our server
        braidify(req, res)

        // We'll serve Braid at the /json route!
        if (req.url === '/json' && req.method === 'GET') {

            // If the client requested a subscription, let's honor it!
            if (req.subscribe)
                res.startSubscription()

            // Send the current version
            res.sendVersion({
                version: 'test',
                parents: ['oldie'],
                body: JSON.stringify({this: 'stuff'})
            })

            // Send a patch
            res.sendVersion({
                version: 'test1',
                parents: ['oldie', 'goodie'],
                patches: {unit: 'json', range: '[1]', content: '1'}
            })

            // Send a patch as array
            res.sendVersion({
                version: 'test2',
                patches: [{unit: 'json', range: '[2]', content: '2'}]
            })

            // Send two patches as array
            res.sendVersion({
                version: 'test3',
                patches: [{unit: 'json', range: '[3]', content: '3'},
                          {unit: 'json', range: '[4]', content: '4'}]
            })

            // If this is a subscription, let's simulate an update
            if (req.subscribe)
                setTimeout(() => res.sendVersion({version: 'another!', body: '!'}), 200)

            // End the response, if this isn't a subscription
            if (!req.subscribe) {
                res.statusCode = 200
                res.end()
            }
        }        

        // We'll accept Braid at the /json PUTs!
        if (req.url === '/json' && req.method === 'PUT') {
            req.patches().then(patches => {
                console.log('We got PUT', req.version, 'patches', patches)
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
