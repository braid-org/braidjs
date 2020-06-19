const files = [
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
const fs = require('fs');
const path = require('path');

module.exports = function(relativePath) {
	var agg = []
	files.forEach(f => {
		let newPath = path.join(relativePath, f);
		agg.push(require('fs').readFileSync(newPath))
	})
	fs.writeFileSync('./braid-bundle.js', agg.join('\n'))
}
