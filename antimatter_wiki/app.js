// Example app

var port = 60509,
    domain = 'localhost:60509'

process.on('uncaughtException', console.log)
process.on('unhandledRejection', console.log)

require('@braidjs/antimatter_wiki').serve({port, domain})
