// This is the root file for require('braid-http').
//
// It combines the client and server files into one file.

var client = require('./braid-http-client'),
    server = require('./braid-http-server')

module.exports = {
    fetch: client.fetch,
    http_client: client.http,
    http_server: server
}
