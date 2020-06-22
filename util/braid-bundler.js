// Bundles up the client javascript file.
files = [
    './util/require.js',
    './util/utilities.js',
    './merge-algos/sync9.js',
    './braid.js',
    './pipe.js',
    './protocol-websocket/websocket-client.js',
    './protocol-http1/http1-client.js',
    './util/diff.js',
]
fs = require('fs')
if (!fs.existsSync('./builds'))
    fs.mkdirSync('./builds')
fs.writeFileSync(
    './builds/braid-bundle.js',
    files.map(f => require('fs').readFileSync(f)).join('\n')
)
