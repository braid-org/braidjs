// This is the root file for require('braidify').
//
// It combines the client and server files into one file.

var client = require('./braidify-client'),
    server = require('./braidify-server'),
    http = (http) => client.http(server(http))

module.exports = { fetch: client.fetch, http }
