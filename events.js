// Binding event handlers to a node

module.exports = require.events = function add_control(node) {
    var u = require('./utilities.js')

    // ===============================================
    //
    //   Bindings:
    //
    //         Attaching pipes to events
    //
    
    // The funks attached to each key, maps e.g. 'get /point/3' to '/30'
    var handlers = u.one_to_many()
    var wildcard_handlers = []  // An array of {prefix, funk}

    // A set of timers, for keys to send forgets on
    node.bind = (key, pipe, allow_wildcards) => {
        allow_wildcards = true // temporarily
        if (allow_wildcards && key[key.length-1] === '*')
            wildcard_handlers.push({prefix: key, pipe: pipe})
        else
            handlers.add(key, pipe.id, pipe)

        // Now check if the method is a get and there's a gotton
        // key in this space, and if so call the handler.
    }
    node.unbind = (key, pipe, allow_wildcards) => {
        allow_wildcards = true // temporarily
        if (allow_wildcards && key[key.length-1] === '*')
            // Delete wildcard connection
            for (var i=0; i<wildcard_handlers.length; i++) {
                var handler = wildcard_handlers[i]
                if (handler.prefix === key && handler.pipe.id === pipe.id) {
                    wildcard_handlers.splice(i,1)  // Splice this element out of the array
                    i--                            // And decrement the counter while we're looping
                }
            }
        else
            // Delete direct connection
            handlers.delete(key, pipe.id)
    }

    node.bindings = (key) => {
        // Note:
        //
        // We need the bindings that persist state to the database to come
        // first.  In statebus we added a .priority flag to them, and
        // processed those priority handlers first.  We haven't implemented
        // that yet, and are just relying on setting these handlers first in
        // the array and hash, which makes them come first.  But we need to
        // make this more robust in the future.
        //
        // We might, instead of doing a .priority flag, have separate
        // .on_change and .on_change_sync handlers.  Then the database stuff
        // would go there.

        assert(typeof key === 'string',
               'Error: "' + key + '" is not a string')

        var result = u.dict()

        // First get the exact key matches
        var pipes = handlers.get(key)
        for (var i=0; i < pipes.length; i++)
            result[pipes[i].id] = pipes[i]

        // Now iterate through prefixes
        for (var i=0; i < wildcard_handlers.length; i++) {
            var handler = wildcard_handlers[i]
            var prefix = handler.prefix.slice(0, -1)       // Cut off the *

            if (prefix === key.substr(0,prefix.length))
                // If the prefix matches, add it to the list!
                result[handler.pipe.id] = handler.pipe
        }
        return Object.values(result)
    }

    node.remotes = (key) => node.bindings(key).filter( pipe => pipe.remote )

    node.joined_peers = (key) => node.bindings(key).filter(
        pipe => pipe.remote && pipe.we_welcomed && pipe.we_welcomed[key]
    )
}