const files = [
    './util/require.js',
    './util/utilities.js',
    './merge-algos/sync9.js',
    './braid.js',
    './pipe.js',
    './protocol-websocket/websocket-client.js',
    './util/diff.js',
]
const fs = require('fs');
const path = require('path');

module.exports = function(relativePath) {
	var agg = []
	files.forEach(f => {
		let newPath = path.join(relativePath, f);
		agg.push(require('fs').readFileSync(newPath))
	})
	fs.writeFileSync('./builds/braid-bundle.js', agg.join('\n'))
}
