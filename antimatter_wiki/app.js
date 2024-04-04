// Example app

var port = 60509,
    host = 'localhost'

process.on('uncaughtException', console.log)
process.on('unhandledRejection', console.log)

require('@braidjs/antimatter_wiki').serve({port, host})
