// Bundles up the client javascript file.
var files = [
    'util/require.js',
    'util/utilities.js',
    'sync9/sync9.js',
    'kernel/antimatter.js',
    'kernel/errors.js',
    'kernel/node.js',
    'kernel/pipe.js',
    'util/diff.js',
    'kernel/store.js',
    'kernel/websocket-client.js',
    'kernel/http-client.js',
    'braidify/braidify-client.js',
    'kernel/leadertab-shell.js',
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
