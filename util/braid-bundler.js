// Bundles up the client javascript file.
var files = [
    'util/require.js',
    'util/utilities.js',
    'merge-algos/sync9.js',
    'braid.js',
    'pipe.js',
    'protocol-websocket/websocket-client.js',
    'protocol-http1/http1-client.js',
    'util/diff.js',
]

var fs = require('fs')

// Translate relative directories
var file_at = (f) => require('path').join(__dirname, '..', f)

// Create builds/ directory if it doesn't exist
if (!fs.existsSync(file_at('builds')))
    fs.mkdirSync(file_at('builds'))

// Write the bundle file
fs.writeFileSync(
    file_at('builds/braid-bundle.js'),
    files.map(f => fs.readFileSync(file_at(f))).join('\n')
)
