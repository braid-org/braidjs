
var files = [
    './require.js',
    './utilities.js',
    './events.js',
    './merge-algorithms/sync9.js',
    './node.js',
    './pipe.js',
    './resource.js',
    './networks/websocket-client.js',
    './diff.js',
]

var agg = []
files.forEach(f => agg.push(require('fs').readFileSync(f)))
require('fs').writeFileSync('./braid-bundle.js', agg.join('\n'))
