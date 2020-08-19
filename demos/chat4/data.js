// Data
var chat = [
    {msg: 'hello'},
    {msg: 'oh, hi!'},
    {msg: 'croikie!'}
]
var curr_version = () => chat.length + ''

var braid_data = {
    get (msg) {
        if (msg.parents && msg.parents.length > 0)
            return chat.slice(parseInt(msg.parents[0]))
        else
            return chat
    },

    subscribe (msg) {
        // If no parents specified, send the whole thing
        if (!msg.parents || msg.parents.length === 0)
            send({
                ...msg,
                ...{body: JSON.stringify(this.get(msg))},
                version: curr_version()
            })

        // If parents specified, parse it as a number, and send a patch from
        // that region in the chat to the end of the chat
        else {
            assert(msg.parents && msg.parents.length > 0)
            send({
                ...msg,
                ...{patches: this.get(msg)},
                version: curr_version()
            })
        }
    },
    
    change (msg) {
        msg.parents = msg.parents || [curr_version()]
        chat.push(JSON.parse(msg.patches[0].value))
        msg.version = msg.version || curr_version()

        console.log('server.js: We got an update!',
                    {version: msg.version, parents: msg.parents,
                     patches: msg.patches, body: msg.body})
    },
    
    curr_version,
}

module.exports = braid_data