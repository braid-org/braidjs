u = require('./util/utilities.js')

module.exports = require.braid = function create_node(node_data = {}) {
    var node = {}
    node.init = (node_data) => {
        node.pid = node_data.pid || u.random_id()
        node.resources = node_data.resources || {}
        for (var key of Object.keys(node.resources)) {
            node.resources[key] = create_resource(node.resources[key])
        }
        if (node_data.fissure_lifetime !== null)
            node.fissure_lifetime = node_data.fissure_lifetime
        if (node.fissure_lifetime === undefined)
            node.fissure_lifetime = 1000 * 60 * 60 * 8  // Default to 8 hours

        node.max_fissures = node_data.max_fissures

        node.defaults = Object.assign(u.dict(), node.defaults || {})
        node.default_patterns = node.default_patterns || []

        node.ons = []
        node.on_errors = []
    
        node.incoming_subscriptions = u.one_to_many()  // Maps `key' to `pipes' subscribed to our key

        node.antimatter      = require('./antimatter')(node)
        node.protocol_errors = require('./errors'    )(node)
    }
    node.init(node_data)

    node.resource_at = (key) => {
        if (typeof key !== 'string')
            throw (JSON.stringify(key) + ' is not a key!')
        if (!node.resources[key])
            node.resources[key] = create_resource()

        return node.resources[key]
    }

    var default_pipe = {id: 'null-pipe'}

    // Can be called as:
    //  - get(key)
    //  - get(key, cb)
    //  - get({key, origin, ...})
    node.get = (...args) => {
        var key, version, parents, subscribe, origin

        // First rewrite the arguments if called as get(key) or get(key, cb)
        if (typeof args[0] === 'string') {
            key = args[0]
            var cb = args[1]
            origin = (cb
                      ? {id: u.random_id(), send(args) {
                          // We have new data with every 'set' or 'welcome message
                          if ((args.method === 'set' || args.method === 'welcome')
                              && (node.resource_at(key).weve_been_welcomed
                                  // But we only wanna return once we have
                                  // applied any relevant default.  We know
                                  // the default has been applied because
                                  // there will be at least one version.
                                  && !(default_val_for(key)
                                       && !node.current_version(key)))) {

                              // Let's also ensure this doesn't run until
                              // (weve_been_welcomed || zero get handlers are registered)

                              // And if there is a .default out there, then
                              // make sure the state has at least one version
                              // before calling.
                              cb(node.resource_at(key).mergeable.read())}}}
                      : default_pipe)
            if (cb) cb.pipe = origin
        }
        else {
            // Else each parameter is passed explicitly
            ({key, version, parents, subscribe, origin} = args[0])
        }

        // Set defaults
        if (!version)
            // We might default keep_alive to false in a future version
            subscribe = subscribe || {keep_alive: true}

        if (!origin)
            origin = {id: u.random_id()}

        // Define handy variables
        var resource = node.resource_at(key)

        // Handle errors
        try {
            node.protocol_errors.get({...args, key, subscribe, version, parents, origin})
        }
        catch (errors) { return errors }

        node.ons.forEach(on => on('get', {key, version, parents, subscribe, origin}))

        // Now record this subscription to the bus
        node.incoming_subscriptions.add(key, origin.id, origin)
        // ...and bind the origin pipe to future sets
        node.bind(key, origin)

        // If this is the first subscription, fire the .on_get handlers
        if (node.incoming_subscriptions.count(key) === 1) {
            log('node.get:', node.pid, 'firing .on_get for',
                node.bindings(key).length, 'pipes!')
            // This one is getting called afterward
            node.bindings(key).forEach(pipe => {

                var best_t = -Infinity
                var best_parents = null
                Object.values(node.resource_at(key).fissures).forEach(f => {
                    if (f.a == node.pid && f.b == pipe.remote_peer && f.time > best_t) {
                        best_t = f.time
                        best_parents = f.versions
                    }
                })

                pipe.send && pipe.send({
                    method:'get', key, version, parents: best_parents, subscribe
                })
            })
        }

        // G: now if the person connecting with us wants to be a citizen, they'll
        // set "pid", and we'll want to send them a "get" as well so that we
        // can learn about their updates -- of course, when they get that get,
        // we don't want an echo war of gets begetting gets, so when someone sends
        // the initial get, they set "initial" to true, but we respond with a get
        // with initial not set to true

        // if (origin.them && initial)
        //     origin.send({method: 'get', key, initial: false})

        // G: ok, now if we're going to be sending this person updates,
        // we should start by catching them up to our current state,
        // which we'll do by sending a "welcome". "generate_braid" calculates
        // the versions comprising this welcome (we need to calculate them because
        // we store the versions inside a space dag, and we need to pull them out...
        // note that it wouldn't work to just keep the versions around on the side,
        // because we also prune the space dag, meaning that the versions generated
        // here may be different than the version we originally received, though
        // hopefully no versions already known to this incoming peer will have been
        // modified, or if they have been, hopefully those versions are deep enough
        // in the incoming peer's version dag that they are not the direct parents
        // of any new edits made by them... we strive to enforce this fact with
        // the pruning algorithm)

        var welcome_msg = node.create_welcome_message(key, parents)

        // Remember this subscription from origin so that we can fissure if
        // our connection to origin breaks
        if (u.has_keep_alive(origin, key))
            resource.keepalive_peers[origin.id] = {
                id: origin.id,
                connection: origin.connection,
                remote_peer: origin.remote_peer
            }

        // G: ok, here we actually send out the welcome

        origin.send && origin.send(welcome_msg)

        return resource.mergeable.read(version)
    }

    node.create_welcome_message = (key, parents) => {
        var resource = node.resource_at(key)
        if (parents && Object.keys(parents).length) {
            var anc = resource.ancestors(parents, true)
        } else { var anc = {} }
        var versions = resource.mergeable.generate_braid(x => anc[x])
        versions = JSON.parse(JSON.stringify(versions))

        versions.forEach(x => {
            // we want to put some of this stuff in a "hint" field,
            // as per the protocol
            if (x.sort_keys) {
                x.hint = {sort_keys: x.sort_keys}
                delete x.sort_keys
            }
        })

        // G: oh yes, we also send them all of our fissures, so they can know to keep
        // those versions alive

        var fissures = Object.values(resource.fissures)

        // here we are setting "parents" equal to the leaves of "anc"
        parents = resource.get_leaves(anc)

        return {method: 'welcome', key, versions, fissures, parents}
    }
    
    node.error = ({key, type, in_response_to, origin}) => {
        node.on_errors.forEach(f => f(key, origin))
    }

    // Can be called as:
    //  - set(key, val)                     // Set key to val
    //  - set(key, null, '= "foo"')         // Patch with a patch
    //  - set(key, null, ['= "foo"', ...])  // Patch with multiple patches
    //  - set({key, patches, origin, ...})
    node.set = (...args) => {
        var key, patches, version, parents, origin, joiner_num

        // First rewrite the arguments if called as set(key, ...)
        if (typeof args[0] === 'string') {
            key = args[0]
            patches = args[2]
            if (typeof patches === 'string')
                patches = [patches]
            if (!patches)
                patches = ['= ' + JSON.stringify(args[1])]
        }
        else {
            // Else each parameter is passed explicitly
            ({key, patches, version, parents, origin, joiner_num} = args[0])
        }

        var resource = node.resource_at(key)

        // Set defaults
        if (!version) version = u.random_id()
        if (!parents) parents = {...resource.current_version}

        // Catch protocol errors
        try {
            node.protocol_errors.set({...args, key, version, parents, patches, origin, joiner_num})
        }
        catch (errors) { return errors }

        log('set:', {key, version, parents, patches, origin, joiner_num})

        for (p in parents) {
            if (!resource.time_dag[p]) {
                // Todo: make this work with origin == null
                origin && origin.send && origin.send({
                    method: 'error',
                    key,
                    type: 'cannot merge: missing parents',
                    in_response_to: {
                        method: 'set',
                        key, patches, version, parents, joiner_num
                    }
                })
                node.on_errors.forEach(f => f(key, origin))
                return                    
            }
        }

        node.ons.forEach(on => on('set', {key, patches, version, parents, origin, joiner_num}))

        // G: cool, someone is giving us a new version to add to our datastructure.
        // it might seem like we would just go ahead and add it, but instead
        // we only add it under certain conditions, namely one of the following
        // must be true:
        //
        // !origin : in this case there is no origin, meaning the version was
        // created locally, so we definitely want to add it.
        //
        // !resource.time_dag[version] : in this case the version must have come
        // from someone else (or !origin would be true), but we don't have
        // the version ourselves (otherwise it would be inside our time_dag),
        // so we want to add this new version we haven't seen before.
        //
        // (joiner_num > resource.joiners[version]) : even if we already have
        // this version, we might want to, in some sense, add it again,
        // in the very special case where this version is a joiner,
        // and its joiner_num is bigger than the version of this joiner that we
        // already have.. the issue with joiners is that they can be created
        // on multiple peers simultaneously, and they share the same version id,
        // and in that case, it would be unclear who should send the "global"
        // acknowledgment for the joiner, so we use this "joiner_num" to
        // distinguish the otherwise identical looking joiners for the purposes
        // of electing a particular joiner to handle the full acknowledgment.

        var is_new = !origin                                         // Was created locally
                     || !resource.time_dag[version]                  // Or we don't have it yet
                     || (joiner_num > resource.joiners[version])     // Or it's a dominant joiner
        if (is_new) {
            // G: so we're going to go ahead and add this version to our
            // datastructure, step 1 is to call "add_version" on the underlying
            // mergeable..

            resource.mergeable.add_version(version, parents, patches)

            // G: well, I said forwarding the version would be next, but here
            // is this line of code to remember the joiner_num of this
            // version, in case it is a joiner (we store the joiner_num for
            // each version in a auxiliary hashmap called joiners)..

            if (joiner_num) resource.joiners[version] = joiner_num

            // G: and now for the forwarding of the version to all our peers,
            // (unless we received this "set" from one of our peers,
            // in which case we don't want to send it back to them)

            log('set: broadcasting to',
                node.bindings(key)
                   .filter(p => p.send && (!origin || p.id !== origin.id))
                   .map   (p => p.id),
                'pipes from', origin && origin.id)

            node.bindings(key).forEach(pipe => {
                if (pipe.send && (!origin || (pipe.id !== origin.id))) {
                    log('set: sending now from', node.pid, pipe.type)
                    pipe.send({method: 'set',
                               key, patches, version, parents, joiner_num})
                }
            })
        }

        node.antimatter.set({
            ...args,
            key, patches, version, parents, origin, joiner_num, is_new
        })

        return version
    }
    node.set_patch = node.setPatch = (key, patch) => node.set({key, patches: [patch]})

    // Todo:
    //  - Rename min_leaves and unack_boundary to unack_from and unack_to
    node.welcome = (args) => {
        var {key, versions, fissures, unack_boundary, min_leaves, parents, origin} = args

        // Note: `versions` is actually array of set messages. Each one has a version id.

        // Catch protocol errors
        try {
            node.protocol_errors.welcome(args)
        }
        catch (errors) { return errors }

        var resource = node.resource_at(key)

        // let people know about the welcome
        node.ons.forEach(
            on => on('welcome', {key, versions, fissures, unack_boundary, min_leaves, origin})
        )

        // Some of the incoming versions we may already have.  So one might
        // ask, why don't we just filter the versions according to which ones
        // we already have? why this versions_to_add nonsense? The issue is
        // that there may be versions which we don't have, but that we don't
        // want to add either, presumably because we pruned them, and this
        // code seeks to filter out such versions. The basic strategy is that
        // for each incoming version, if we already have that version, not
        // only do we want to not add it, but we don't want to add any
        // incoming ancestors of that version either (because we must already
        // have them, or else we did have them, and pruned them)

        var versions_to_add = {}
        versions.forEach(v => versions_to_add[v.version] = v.parents)
        versions.forEach(v => {
            // For each incoming version...
            // ... if we have this version already:
            if (resource.time_dag[v.version]) {
                // Then remove it and its ancestors from our "stuff to add"
                remove_ancestors(v.version)
                function remove_ancestors (v) {
                    if (versions_to_add[v]) {
                        Object.keys(versions_to_add[v]).forEach(remove_ancestors)
                        delete versions_to_add[v]
                    }
                }
            }
        })

        // Now versions_to_add will only contain truthy values for versions
        // which we really do want to add (they are new to us, and they are
        // not repeats of some version we had in the past, but pruned away)

        var added_versions = []
        for (var v of versions) {
            if (versions_to_add[v.version]) {
                if (!Object.keys(v.parents).every(p => resource.time_dag[p]))
                    return send_error()

                resource.mergeable.add_version(v.version, v.parents, v.changes,
                                               v.hint && v.hint.sort_keys)

                added_versions.push(v)
            }
        }

        function send_error() {
            origin.send && origin.send({
                method: 'error',
                key,
                type: 'cannot merge: missing necessary versions',
                in_response_to: {
                    method: 'welcome',
                    key, versions, fissures, unack_boundary, min_leaves
                }
            })
            node.on_errors.forEach(f => f(key, origin))
        }

        // Let's also check to make sure we have the min_leaves and unack_boundary,
        // if they are specified..
        if (((min_leaves && Object.keys(min_leaves).some(k => !resource.time_dag[k]))
             || (unack_boundary && Object.keys(unack_boundary).some(k => !resource.time_dag[k]))))
            return send_error()
        
        node.antimatter.welcome({...args, versions_to_add, added_versions})
        
        // Now that we processed the welcome, set defaults if we have one
        var default_val = default_val_for(key)
        if (default_val && !node.current_version(key)) {
            node.set({key, patches: [` = ${JSON.stringify(default_val)}`], version: 'default_version', parents: {}})
        }
    }
    
    // Can be called as:
    //  - forget(key, cb), with the same cb passed to get(key, cb)
    //  - forget({key, origin})
    node.forget = (...args) => {
        var key, origin, cb
        if (typeof(args[0]) === 'string') {
            key = args[0]
            cb = args[1]
            origin = cb.pipe
        } else {
            ({key, origin} = args[0])
        }

        log(`forget: ${node.pid}, ${key}->${origin.id}`)

        // Catch protocol errors
        try {
            node.protocol_errors.forget({...args, key, origin})
        }
        catch (errors) { return errors }
        node.ons.forEach(on => on('forget', {key, origin}))

        var resource = node.resource_at(key)
        delete resource.keepalive_peers[origin.id]
        node.unbind(key, origin)
        node.incoming_subscriptions.delete(key, origin.id)

        // todo: what are the correct conditions to send the forget?
        // for now, we just support the hub-spoke model, where only clients
        // send forget.
        // here is what the todo said before:
        // TODO: if this is the last subscription, send forget to all gets_out
        // origin.send({method: 'forget', key})
        if (cb && node.incoming_subscriptions.count(key) == 0) {
            node.bindings(key).forEach(pipe => {
                pipe.send && pipe.send({
                    method:'forget', key, origin
                })
            })
        }
    }

    node.ack = (args) => {
        var {key, valid, seen, version, origin, joiner_num} = args

        try {
            node.protocol_errors.ack(args)
        }
        catch (errors) { return errors }

        node.ons.forEach(on => on('ack', {key, valid, seen, version, origin, joiner_num}))
        log('node.ack: Acking!!!!', {key, seen, version, origin})

        node.antimatter.ack(args)
    }
    
    node.fissure = ({key, fissure, origin}) => {
        try {
            node.protocol_errors.fissure({key, fissure, origin})
        }
        catch (errors) { return errors }

        node.ons.forEach(on => on('fissure', {key, fissure, origin}))

        node.antimatter.fissure({key, fissure, origin})
    }

    node.disconnected = ({key, name, versions, parents, time, origin}) => {
        // Todo:
        //  - rename "name" to "fissure".
        //  - rename "time" to "disconnect_time"
        if (!time) time = Date.now()
        node.ons.forEach(on => on('disconnected', {key, name, versions, parents, time, origin}))

        // unbind them (but only if they are bound)
        if (node.bindings(key).some(p => p.id == origin.id)) node.unbind(key, origin)

        node.antimatter.disconnected({key, name, versions, parents, time, origin})
    }
    
    node.delete = () => {
        // NOT IMPLEMENTED: idea: use "undefined" to represent deletion
        // update: we now have a {type: "deleted"} thing (like {type: "location"}),
        // may be useful for this
    }

    node.prune = node.antimatter.prune

    node.current_version = (key) =>
        Object.keys(node.resource_at(key).current_version).join('-') || null
    node.versions = (key) => Object.keys(node.resource_at(key).time_dag)
    node.fissures = (key) => Object.values(node.resource_at(key).fissures).map(
        fiss => ({ ...fiss,
                   // Reformat `versions` and `parents` as arrays
                   parents:  Object.keys(fiss.parents),
                   versions: Object.keys(fiss.versions) }))
    node.unmatched_fissures = (key) => {
        var result = []
        var fissures = node.resource_at(key).fissures
        outer_loop:
        for (fiss in fissures) {
            for (fiss2 in fissures) {
                if (   fissures[fiss].conn === fissures[fiss2].conn
                    && fissures[fiss].a    === fissures[fiss2].b
                    && fissures[fiss].b    === fissures[fiss2].a)
                    continue outer_loop
            }
            fiss = fissures[fiss]
            result.push({...fiss,
                         // Reformat `versions` and `parents` as arrays
                         parents:  Object.keys(fiss.parents),
                         versions: Object.keys(fiss.versions)})
        }
        return result
    }

    node.create_joiner = (key) => {
        var resource = node.resource_at(key),
            // version = sjcl.codec.hex.fromBits(
            //     sjcl.hash.sha256.hash(
            //         Object.keys(resource.current_version).sort().join(':')))
            version = 'joiner:' + Object.keys(resource.current_version).sort().join(':')
        var joiner_num = Math.random()
        node.set({key, patches: [], version,
                  parents: Object.assign(u.dict(), resource.current_version),
                  joiner_num})
    }        

    node.default = (key, val) => {
        var is_wildcard = key[key.length-1] === '*'
        var v = val
        if (is_wildcard) {
            // Wildcard vals must be functions
            if (typeof val !== 'function')
                v = () => val
            node.default_patterns[key.substr(0,key.length-1)] = v
        }
        else
            node.defaults[key] = val
    }
    function default_val_for (key) {
        if (key in node.defaults) {
            // console.log('Default('+key+') is', node.defaults[key])
            return node.defaults[key]
        }

        for (pattern in node.default_patterns)
            if (pattern === key.substr(0, pattern.length)) {
                // console.log('Default('+key+') is', node.default_patterns[pattern])
                return node.default_patterns[pattern](key)
            }
    }
    node._default_val_for = default_val_for;

    function create_resource(resource = {}) {
        // The version history
        if (!resource.time_dag) resource.time_dag = {}
        if (!resource.current_version) resource.current_version = {}
        if (!resource.version_cache) resource.version_cache = {}
        resource.ancestors = (versions, ignore_nonexistent) => {
            var result = {}
            // console.log('ancestors:', versions)
            function recurse (version) {
                if (result[version]) return
                if (!resource.time_dag[version]) {
                    if (ignore_nonexistent) return
                    assert(false, 'The version '+version+' no existo')
                }
                result[version] = true
                Object.keys(resource.time_dag[version]).forEach(recurse)
            }
            Object.keys(versions).forEach(recurse)
            return result
        }
        resource.get_leaves = (versions) => {
            var leaves = {...versions}
            Object.keys(versions).forEach(v => {
                Object.keys(resource.time_dag[v]).forEach(p => delete leaves[p])
            })
            return leaves
        }

        // A data structure that can merge simultaneous operations
        resource.mergeable = require('./mergeables/sync9.js')(resource)

        // Peers that we have sent a welcome message to
        if (!resource.keepalive_peers) resource.keepalive_peers = {}

        // Have we been welcomed yet?  (Has the data loaded?)
        if (!resource.weve_been_welcomed) resource.weve_been_welcomed = false

        // Disconnections that have occurred in the network without a forget()
        if (!resource.fissures) resource.fissures = {}

        // Acknowledgement data
        if (!resource.acked_boundary) resource.acked_boundary = {}
        if (!resource.unack_boundary) resource.unack_boundary = {}
        if (!resource.acks_in_process) resource.acks_in_process = {}

        // Empty versions sent to collapse outstanding parallel edits
        if (!resource.joiners) resource.joiners = {}
        
        return resource
    }
    node.create_resource = create_resource

    // ===============================================
    //
    //   Bindings:
    //
    //         Attaching pipes to events
    //
    function pattern_matcher () {
        // The pipes attached to each key, maps e.g. 'get /point/3' to '/30'
        var handlers = u.one_to_many()
        var wildcard_handlers = []  // An array of {prefix, funk}

        var matcher = {
            // A set of timers, for keys to send forgets on
            bind (key, pipe, allow_wildcards) {
                allow_wildcards = true // temporarily
                if (allow_wildcards && key[key.length-1] === '*')
                    wildcard_handlers.push({prefix: key, pipe: pipe})
                else
                    handlers.add(key, pipe.id, pipe)

                // Now check if the method is a get and there's a gotton
                // key in this space, and if so call the handler.
            },

            unbind (key, pipe, allow_wildcards) {
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
            },

            bindings (key) {
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
        }
        return matcher
    }

    // Give the node all methods of a pattern matcher, to bind keys and pipes
    Object.assign(node, pattern_matcher())

    node.websocket_client = (args) => require('./protocol-websocket/websocket-client.js')({
        ...args,
        node: node,
        create_websocket: () => new (require('ws'))(args.url)
    })

    return node
}
