var subscriptions = {}
var sub_key = (msg) => JSON.stringify([msg.client, msg.url])

module.exports = (msg, send, next) => {
    var handlers = {
        subscribe (msg, next) {
            subscriptions[sub_key(msg)] = msg.res;
            return next(msg)
        },

        unsubscribe (msg, next) {
            delete subscriptions[sub_key(msg)];
            return next(msg)
        },

        change (msg, next) {
            next(msg)
            for (var k in subscriptions) {
                var [client, url] = JSON.parse(k)
                if (!(client === msg.client && url === msg.url))
                    send({
                        ...msg,
                        res: subscriptions[k]
                    })
            }
        }
    }

    return handlers[msg.method]
           ? handlers[msg.method](msg, next)
           : next(msg)
}
