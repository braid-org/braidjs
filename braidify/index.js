var client = require('./braidify-client'),
    server = require('./braidify-server'),
    http = (http) => client.http(server(http))

module.exports = { fetch: client.fetch, http }
