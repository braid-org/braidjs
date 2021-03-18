// This is the root file for require('braidify').
//
// It combines the client and server files into one file.

var client = require('./braidify-client'),
    server = require('./braidify-server')

module.exports = {
    fetch: client.fetch,
    http: client.http,
    http_server: server
}
