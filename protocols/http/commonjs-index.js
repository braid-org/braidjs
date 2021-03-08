var client = require('./http-client'),
    server = require('./http-server')

module.exports = { fetch: client.fetch,
                   http: client.http,
                   http_server: server }