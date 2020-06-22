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
file_at = (f) => require('path').join(__dirname, '..', f)
if (!fs.existsSync(file_at('builds')))
    fs.mkdirSync(file_at('builds'))
fs.writeFileSync(
    file_at('builds/braid-bundle.js'),
    files.map(f => require('fs').readFileSync(f)).join('\n')
)
