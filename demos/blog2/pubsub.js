var subscriptions = {}
var sub_key = (msg) => JSON.stringify([msg.client, msg.url])

module.exports = {
    subscribe (msg) {
        subscriptions[sub_key(msg)] = msg.res
    },
    unsubscribe (msg) {
        delete subscriptions[sub_key(msg)]
    },
    change (msg) {
        for (var k in subscriptions) {
            var [client, url] = JSON.parse(k)
            if (!(client === msg.client && url === msg.url))
                braid.send({...msg, res: subscriptions[k]})
        }
    }
}
