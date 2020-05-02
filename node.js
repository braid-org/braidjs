u = require('./utilities.js')

module.exports = require.node = function create_node(node_data = {}) {
    var node = {}
    node.init = (node_data) => {
        node.pid = node_data.pid || u.random_id()
        node.resources = node_data.resources || {}
        for (var key of Object.keys(node.resources)) {
            node.resources[key] = require('./resource.js')(node.resources[key])
        }
        if (node_data.fissure_lifetime != null) node.fissure_lifetime = node_data.fissure_lifetime

        node.defaults = Object.assign(u.dict(), node.defaults || {})
        node.default_patterns = node.default_patterns || []

        node.ons = []
        node.on_errors = []
    
        node.gets_in      = u.one_to_many()  // Maps `key' to `pipes' subscribed to our key
        // var gets_out     = u.one_to_many()  // Maps `key' to `pipes' we get()ed `key' over
        // var pending_gets = u.one_to_many()  // Maps `key' to `pipes' that haven't responded    
    }
    node.init(node_data)

    node.resource_at = (key) => {
        if (typeof key !== 'string')
            throw (JSON.stringify(key) + ' is not a key!')
        if (!node.resources[key])
            node.resources[key] = require('./resource.js')()

        return node.resources[key]
    }

    function add_full_ack_leaf(resource, version) {

        // G: someone is telling us that "version" is fully (globally) acknowledged,
        // and this fact implies that every ancestor of version is also fully
        // acknowledged, which means that we don't need to keep certain information
        // about them, like "acks_in_process".. this next section simply
        // iterates over all the ancestors (including this version itself) and deletes
        // information we don't need anymore for each one..

        var marks = {}
        function f(v) {
            if (!marks[v]) {
                marks[v] = true
                delete resource.unack_boundary[v]
                delete resource.acked_boundary[v]
                delete resource.acks_in_process[v]
                delete resource.joiners[v]
                Object.keys(resource.time_dag[v]).forEach(f)
            }
        }
        f(version)

        // G: now that old information is gone, we need to add one bit of new
        // information, namely that this version is fully acknowledged,
        // which we express by putting it in the "acked_boundary" (and we hope
        // that nobody calls this function on a version which is already fully
        // acknowledged; you can check the two places where this function is called
        // to verify that they guard against calling this function on a version
        // which is already fully acknowledged.. note that one does so by noting
        // that "acks_in_process" will always be null for versions which are fully
        // acknowledged, because "acks_in_process" is deleted in section above
        // for all such versions)

        resource.acked_boundary[version] = true

        // G: next we're going to prune.. really we could call prune whenever we want,
        // this is just a somewhat reasonable time, since there is some chance
        // that with this new full acknowledgment, that we might be able to prune
        // more stuff than we could prune before (but we could also let the user
        // call "prune" explicitly at their leisure)

        node.prune(resource)
    }
    
    function check_ack_count(key, resource, version) {
        // TODO: could this only take key, instead of key and resource?  Or
        // perhaps a resource should know its key?
        assert(!resource.acks_in_process[version]
               || resource.acks_in_process[version].count >= 0,
               'Acks have gone below zero!',
               {key, version,
                acks_in_process: resource.acks_in_process[version]})

        // G: this function gets called from a couple of places, basically whenever
        // someone suspects that the "count" within "acks_in_process" may have changed,
        // since it might have gone all the way to zero, in which case we will act...
        // of course, in some such instances, acks_in_process may have been removed
        // entirely for a version, so we guard against that here, too..

        if (resource.acks_in_process[version]
            && resource.acks_in_process[version].count == 0) {

            // G: sweet, the count has gone to zero, that means all the acks we were
            // waiting for have arrived, now there are a couple possibilities..

            if (resource.acks_in_process[version].origin) {

                // G: in this case, we have an "origin", which means we didn't create
                // this version ourselves, and "origin" tells us who we first heard
                // about it from, and so now, as per the ack-algorithm, we're going
                // to send an ack back to that person (because the algorithm tells us
                // to only send an ack after we have received acks from everyone
                // we forwarded the information to)

                let p = resource.acks_in_process[version].origin
                p.send && p.send({
                    method: 'ack', key, seen:'local', version,
                    joiner_num: resource.joiners[version]
                })

            } else {

                // G: in this case, we have no "origin", which means we created
                // this version ourselves, and now the fact that all our peers
                // have acknowledged it means that all of their peers have also
                // acknowledged. In fact, everyone in the network must have
                // acknowledged it (or else we would have received a fissure
                // before receiving this acknowledgment, and that fissure would
                // have wiped away "acks_in_process" for this version), so that
                // means this version is "fully (globally) acknowledged",
                // so we'll call add_full_ack_leaf for this version..

                add_full_ack_leaf(resource, version)

                // G: but "add_full_ack_leaf" just modifies our own datastructure,
                // and we must also give the good news to everyone else, so
                // we send a "global" ack to all our peers (and they'll forward it
                // to their peers)

                node.bindings(key).forEach( pipe => {
                    pipe.send && pipe.send({method: 'ack', key, seen:'global', version})
                })
            }
        }
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
                                  && !(default_val_for(key) && !node.current_version(key)))) {
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

        node.ons.forEach(on => on('get', {key, version, parents, subscribe, origin}))
      
        // Set defaults
        if (!version)
            // We might default keep_alive to false in a future version
            subscribe = subscribe || {keep_alive: true}

        if (!origin)
            origin = {id: u.random_id()}

        log('get:', node.pid, key)
        assert(key)
        var resource = node.resource_at(key)

        // Now record this subscription to the bus
        node.gets_in.add(key, origin.id)
        // ...and bind the origin pipe to future sets
        node.bind(key, origin)

        // If this is the first subscription, fire the .on_get handlers
        if (node.gets_in.count(key) === 1) {
            log('node.get:', node.pid, 'firing .on_get for',
                node.bindings(key).length, 'pipes!')
            // This one is getting called afterward
            node.bindings(key).forEach(pipe => {
                pipe.send && pipe.send({
                    method:'get', key, version, parents, subscribe, origin
                })
            })
        }

        // // G: now if the person connecting with us wants to be a citizen, they'll
        // // set "pid", and we'll want to send them a "get" as well so that we
        // // can learn about their updates -- of course, when they get that get,
        // // we don't want an echo war of gets begetting gets, so when someone sends
        // // the initial get, they set "initial" to true, but we respond with a get
        // // with initial not set to true

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

        var versions = resource.mergeable.generate_braid(x => false)

        // G: oh yes, we also send them all of our fissures, so they can know to keep
        // those versions alive

        var fissures = Object.values(resource.fissures)

        // G: ok, here we actually send out the welcome

        if (origin.remote) resource.we_welcomed[origin.id] = {id: origin.id, connection: origin.connection, them: origin.them, remote: origin.remote}
        origin.send && origin.send({method: 'welcome', key, versions, fissures})

        return resource.mergeable.read()
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

        assert(key && patches)
        var resource = node.resource_at(key)

        if (!version) version = u.random_id()
        if (!parents) parents = {...resource.current_version}
        log('set:', {key, version, parents, patches, origin, joiner_num})

        for (p in parents) {
            if (!resource.time_dag[p]) {
                origin.send && origin.send({
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

        if (!origin                                         // Was created locally
            || !resource.time_dag[version]                  // We don't have it yet
            || (joiner_num > resource.joiners[version])) {  // It's a dominant joiner

            // console.log('Branch •A• happened')

            // G: so we're going to go ahead and add this version to our
            // datastructure, step 1 is to call "add_version" on the underlying
            // mergeable..

            // console.log('Adding version', {version, parents, patches},
            //             'to', Object.keys(resource.time_dag))
            resource.mergeable.add_version(version, parents, patches)

            // G: next, we want to remember some information for the purposes
            // of acknowledgments, namely, we'll remember how many people
            // we forward this version along to (we'll actually do the forwarding
            // right after this), and we also remember whether or not
            // we are the originators of this version (if we originated the version,
            // then we'll be responsible for sending the "global" ack when
            // the time is right)..

            resource.acks_in_process[version] = {
                origin: origin,
                count: node.welcomed_peers(key).length - (origin ? 1 : 0)
            }

            // log('node.set:', node.pid, 'Initializing ACKs for', version, 'to',
            //     `${node.joined_peers(key).length}-${(origin ? 1 : 0)}=${resource.acks_in_process[version].count}`)

            // log('node.set: we will want',
            //             node.citizens(key).length - (origin ? 1 : 0),
            //             'acks, because we have citizens', node.citizens(key))

            assert(resource.acks_in_process[version].count >= 0,
                   node.pid, 'Acks have below zero! Proof:',
                   {origin, key, version,
                    acks_in_process: resource.acks_in_process[version]})

            // console.log('Initialized acks to', resource.acks_in_process[version])
            
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
            // console.log('Now gonna send a set on', node.bindings(key))
            node.bindings(key).forEach(pipe => {
                if (pipe.send && (!origin || (pipe.id !== origin.id))) {
                    log('set: sending now from', node.pid, pipe.type)
                    pipe.send({method: 'set',
                               key, patches, version, parents, joiner_num})
                }
            })
            
        } else if (resource.acks_in_process[version]
                   // Greg: In what situation is acks_in_process[version] false?

                   // G: good question; the answer is that in some cases
                   // we will delete acks_in_process for a version if,
                   // say, we receive a global ack for a descendant of this version,
                   // or if we receive a fissure.. in such cases, we simply
                   // ignore the ack process for that version, and rely
                   // on a descendant version getting globally acknowledged.

                   && joiner_num == resource.joiners[version])

            // G: now if we're not going to add the version, most commonly because
            // we already possess the version, there is another situation that
            // can arise, namely, someone that we forwarded the version to
            // sends it back to us... How could that happen? Well, they may have
            // heard about this version from someone we sent it to, before
            // hearing about it from us (assuming some pretty gross latency)..
            // anyway, if it happens, we can treat it like an ACK for the version,
            // which is why we decrement "count" for acks_in_process for this version;
            // a similar line of code exists inside "node.ack"

            // console.log('Branch •B• happened',
            //             joiner_num,
            //             resource.joiners[version],
            //             resource.acks_in_process[version].count)

            resource.acks_in_process[version].count--

        // G: since we may have messed with the ack count, we check it
        // to see if it has gone to 0, and if it has, take the appropriate action
        // (which is probably to send a global ack)


        check_ack_count(key, resource, version)

        return version
    }
    
    node.welcome = ({key, versions, fissures, unack_boundary, min_leaves, origin}) => {
        node.ons.forEach(on => on('welcome', {key, versions, fissures, unack_boundary, min_leaves, origin}))

        assert(key && versions && fissures,
               'Missing some variables:',
               {key, versions, fissures})
        // console.log('welcome:', key, 'versions:', versions.length,
        //             'unacking:', Object.keys(unack_boundary))
        var resource = node.resource_at(key)
        
        // `versions` is actually array of set messages. Each one has a version.
        var new_versions = []
        
        // G: this next section deals with the special case of information
        // that is so acknowledged by everyone, and so pruned, that it
        // has no version -- it sort of exists as a background version.
        // we can identify such a version because it will have no version id,
        // and if it exists, it will always be the first version in the list;
        // however, even if it does exist, we may not want to actually apply
        // it to our datastructure -- we only apply it to our datastructure
        // if we have absolutely nothing else in it (if we already have some
        // "background" version, then we just ignore this new "background" version,
        // in the hopes that it doesn't tell us anything new, which it shouldn't
        // if our protocol is working correctly)

        var v = versions[0]
        if (v && !v.version) {
            // G: so we get rid of this "background" version..

            var null_version = versions.shift()

            // G: ..but we only add it to our datastructure if we don't
            // already have a "background" version (namely any version information at all)

            if (!Object.keys(resource.time_dag).length) {
                new_versions.push(v)
                resource.mergeable.add_version(v.version, v.parents, v.changes)
            }
        }
        
        // G: now that the "background" version is out of the way,
        // the rest of the version are real.. but that doesn't mean we
        // want to add them all. Some of them we may already have.
        // So one might ask, why don't we just filter the versions
        // according to which ones we already have? why this versions_T
        // nonsense? The issue is that there may be versions which
        // we don't have, but that we don't want to add either,
        // presumably because we pruned them, and this code seeks
        // to filter out such versions. The basic strategy is that
        // for each incoming version, if we already have that version,
        // not only do we want to not add it, but we don't want
        // to add any incoming ancestors of that version either (because
        // we must already have them, or else we did have them,
        // and pruned them)

        var versions_T = {}
        versions.forEach(v => versions_T[v.version] = v.parents)
        versions.forEach(v => {
            if (resource.time_dag[v.version]) {
                function f(v) {
                    if (versions_T[v]) {
                        Object.keys(versions_T[v]).forEach(f)
                        delete versions_T[v]
                    }
                }
                f(v.version)
            }
        })

        // G: now versions_T will only contain truthy values for versions
        // which we really do want to add (they are new to us, and they
        // are not repeats of some version we had in the past, but pruned away)

        for (var v of versions) {
            if (versions_T[v.version]) {
                new_versions.push(v)

                var bad = false
                if (Object.keys(v.parents).length == 0) {
                    bad = new_versions[0].version
                } else for (p in v.parents) {
                    bad = !resource.time_dag[p]
                    if (bad) break
                }
                if (bad) return send_error()

                resource.mergeable.add_version(v.version, v.parents, v.changes)
            }
        }

        function send_error() {
            versions.unshift(null_version)
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

        // let's also check to make sure we have the min_leaves and unack_boundary,
        // if they are specified..
        if ((min_leaves && Object.keys(min_leaves).some(k => !resource.time_dag[k])) || (unack_boundary && Object.keys(unack_boundary).some(k => !resource.time_dag[k]))) return send_error()
        
        // G: next we process the incoming fissures, and like before,
        // we only want to add new ones, and there's also this gen_fissures
        // variable which is short of "generated_fissures", and records
        // fissures which we created just now as part of a special case
        // where we receive a fissure that we were supposedly involved with,
        // but we don't have a fissure record for (this can happen when someone
        // tries to connect with us, but the connection is broken even before
        // we knew they were trying to connect)

        var new_fissures = []
        var gen_fissures = []
        fissures.forEach(f => {
            var key = f.a + ':' + f.b + ':' + f.conn
            if (!resource.fissures[key]) {

                // G: so we don't have this fissure.. let's add it..

                new_fissures.push(f)
                resource.fissures[key] = f

                // G: now let's check for that special case where we don't
                // have the fissure, but we're one of the ends of the fissure
                // (note that we don't check for f.a == node.pid because that
                // would be a fissure created by us -- we're looking for
                // fissures not created by us, but that we are the other end
                // of).  We just add these fissures to gen_fissures for now,
                // and later in this function we'll iterate over gen_fissures
                // and actually add these fissures to our data structure (as
                // well as tell them to our peers)
                //
                // If we don't do this, then this fissure will never get pruned,
                // because it will never find its "other half"

                if (f.b == node.pid) gen_fissures.push({
                    a:        node.pid,
                    b:        f.a,
                    conn:     f.conn,
                    versions: f.versions,
                    parents:  {},
                    time:     f.time
                })
            }
        })

        // G: there is this thing called the unack_boundary, which defines
        // a set of nodes (namely everything on the boundary, and any ancestors
        // of anything on the boundary), and these nodes should exhibit the
        // behavior that even if a global acknowledgment is received for them,
        // it should be ignored.
        //
        // why should we ignore them? well, this welcome message we've received
        // is kindof like an anti-fissure -- it is a new citizen in the network,
        // and the whole idea of a "global ack" is that all citizens connected
        // directly or transitively to ourselves have seen this version,
        // but imagine that there is a "global ack" sitting the our message queue,
        // but it was created before this new connection, meaning that it's
        // claim has been violated (in particular, this new citizen may not
        // have seen the version, and this new citizen may bring in transitive
        // access to even more citizens, which also may not have seen the version),
        // so rather than trying to figure out who has seen what when a new
        // connection is established, we sortof blacklist global acknowledgments
        // for all versions in both our, and the new citizens current versions,
        // and we wait for a version created after this connection event
        // to get globally acknowledged (note that this involves un-globally
        // acknowledging things that we had thought were globally acknowledged,
        // but not everything -- if a version is globally acknowledged by us,
        // and also by the incoming citizen, then we keep that version as
        // globally acknowledged)

        // G: this next if statement deals with two cases of the welcome message.
        // in one case, the welcome is sent as a response to a get,
        // in which case unack_boundary is null (and you can see that we just
        // set it to be absolutely all of the versions we currently know about,
        // both in our own version set, and the incoming version set, since
        // we already added the incoming versions to our set). If it isn't null,
        // then we don't need to give it a value here (and this message must be
        // a case of propoagating a welcome around the network)
        //
        // So conceptually, we establish the unack_boundary on the initial
        // welcome (and we can't know it before then, because the person
        // sending us this welcome doesn't know which versions we have),
        // and then once it is established, we hardcode the result into
        // the welcome messages that we send to our peers

        if (!unack_boundary)
            unack_boundary = Object.assign({}, resource.current_version)

        // G: to understand this next bit of code,
        // first know that these "boundary" variables are really just
        // trying to be more effecient ways of storing sets of versions (which
        // include everything on the boundary, as well as all the ancestors
        // of those versions). If we were using sets, our code would
        // be doing this:
        //
        // resource.unack_set = union(resource.unack_set, unack_set)
        //
        // that is, we want to union our pre-existing unacked stuff with
        // the new incoming unacked stuff. But since our implementation
        // uses boundaries rather than sets, we get the code that follows
        // (you can see that the only modifications being made are to
        // resource.unack_boundary, where we delete some stuff, and add
        // some stuff, so that it represents the new boundary)

        // console.log('processing1:', resource.unack_boundary)
        var our_conn_versions = resource.ancestors(resource.unack_boundary)
        // console.log('processing2:', unack_boundary)

        var new_conn_versions = resource.ancestors(unack_boundary)

        Object.keys(resource.unack_boundary).forEach(x => {
            if (new_conn_versions[x] && !unack_boundary[x]) {
                delete resource.unack_boundary[x]
            }
        })
        Object.keys(unack_boundary).forEach(x => {
            if (!our_conn_versions[x]) resource.unack_boundary[x] = true
        })

        // G: so that was dealing with the unack_boundary stuff... now
        // we want to deal with the globally acknowledged stuff. Basically,
        // anything that is globally acknowledged by both us, and the incoming
        // citizen, will remain globally acknowledged. We'll compute these
        // versions as the intersection of ours and their acknowledged set,
        // and then store just the boundary of the intersection set
        // and call it "min_leaves" (where "min" basically means "intersection"
        // in this case, and used to be paired with "max_leaves", which
        // meant "union", and was used to represent the unack_boundary above)
        //
        // As before, min_leaves will be null on the initial welcome,
        // and we'll compute it, and then subsequent welcomes will have this
        // result included...
        
        if (!min_leaves) {
            min_leaves = {}

            // G: this next line of code computes the intersection of
            // our versions, and the incoming versions. It does this by
            // starting with "versions" (which is the incoming versions),
            // and filtering away anything in versions_T, which happens
            // to contain only versions which are new to us,
            // leaving us with all the versions in the incoming versions
            // that we already know about (which is the intersection we seek)

            var min = versions.filter(v => !versions_T[v.version])

            // G: now "min" is correct, but we really want "min_leaves",
            // which is the so-called "boundary" of the "min" set,
            // so we start by adding everything to it,
            // and then removing anything in it which is really
            // an ancestor of something else in the set

            min.forEach(v => min_leaves[v.version] = true)
            min.forEach(v =>
                        Object.keys(v.parents).forEach(p => {
                            delete min_leaves[p]
                        })
                       )
        }

        // G: we are now armed with this "min_leaves" variable,
        // either because we computed it, or it was given to us...
        // what do we do with it? well, we want to roll-back our
        // boundary of globally acknowledged stuff so that it only
        // includes stuff within "min_leaves" (that is, we only want
        // to keep stuff as globally acknowledged if it was already
        // globally acknowledged, and also it is already known to this
        // incoming citizen)
        //
        // As before, we're really doing a set intersection (in this case
        // an intersection between min_leaves and our own acked_boundary),
        // but the code looks wonkier because all our variables store
        // the boundaries of sets, rather than the sets themselves

        var min_versions = resource.ancestors(min_leaves)
        var ack_versions = resource.ancestors(resource.acked_boundary)
        Object.keys(resource.acked_boundary).forEach(x => {
            if (!min_versions[x])
                delete resource.acked_boundary[x]
        })
        Object.keys(min_leaves).forEach(x => {
            if (ack_versions[x]) resource.acked_boundary[x] = true
        })

        // G: this next line of code is pretty drastic.. it says: "If we're
        // connecting to someone new, then all our hard work keeping track
        // of acknowledgments is now useless, since it relies on an algorithm
        // that assumes there will be no changes in the network topology
        // whilst the algorithm is being carried out -- and the network topology
        // just changed, because now there's this new guy"
        //
        // Fortunately, once a new version is globally acknowledged within the new
        // topology, it's acknowledgment will extend to these versions as well,
        // because global acknowledgments apply to all ancestors of a version,
        // and any new versions will include all existing versions as ancestors.
        
        resource.acks_in_process = {}

        // G: ok, we're pretty much done. We've made all the changes to our
        // own data structure (except for the gen_fissures, which will happen next),
        // and now we're ready to propogate the information to our peers.
        //
        // So, up above, when we added new versions and fissures to ourselves,
        // we marked each such instance in new_versions or new_fissures,
        // and if we got any new versions or fissures, then we want to
        // tell our peers about it (if we didn't, then we don't need to tell anyone,
        // since there's nothing new to hear about)
        
        assert(unack_boundary && min_leaves && fissures && new_versions)
        if (new_versions.length > 0 || new_fissures.length > 0 || !resource.weve_been_welcomed) {
            // Now record that we've seen a welcome
            resource.weve_been_welcomed = true

            // And tell everyone about it!
            node.bindings(key).forEach(pipe => {
                if (pipe.send && (pipe.id !== origin.id))
                    pipe.send({method: 'welcome',
                               key, versions: new_versions, unack_boundary, min_leaves,
                               fissures: new_fissures})
            })
        }

        // G: now we finally add the fissures we decided we need to create
        // in gen_fissures... we add them now, after the code above,
        // so that these network messages appear after the welcome (since
        // they may rely on information which is in the welcome for other
        // people to understand them)

        gen_fissures.forEach(f => node.fissure({key, fissure:f}))

        // Now that we processed the welcome, set defaults if we have one
        if (default_val_for(key) && !node.current_version(key))
            node.set(key, default_val_for(key))
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

        node.ons.forEach(on => on('forget', {key, origin}))

        assert(key)

        var resource = node.resource_at(key)
        delete resource.we_welcomed[origin.id]
        node.unbind(key, origin)
        node.gets_in.delete(key, origin.id)

        // todo: what are the correct conditions to send the forget?
        // for now, we just support the hub-spoke model, where only clients
        // send forget.
        // here is what the todo said before:
        // TODO: if this is the last subscription, send forget to all gets_out
        // origin.send({method: 'forget', key})        
        if (cb) {
            node.bindings(key).forEach(pipe => {
                pipe.send && pipe.send({
                    method:'forget', key, origin
                })
            })
        }
    }

    node.ack = ({key, valid, seen, version, origin, joiner_num}) => {
        node.ons.forEach(on => on('ack', {key, valid, seen, version, origin, joiner_num}))

        log('node.ack: Acking!!!!', {key, seen, version, origin})
        assert(key && version && origin)
        var resource = node.resource_at(key)

        if (seen == 'local') {
            if (resource.acks_in_process[version]
                && (joiner_num == resource.joiners[version])) {
                log('node.ack: Got a local ack! Decrement count to',
                    resource.acks_in_process[version].count - 1)
                resource.acks_in_process[version].count--
                check_ack_count(key, resource, version)
            }
        } else if (seen == 'global') {
            if (!resource.time_dag[version]) return
            
            var ancs = resource.ancestors(resource.unack_boundary)
            if (ancs[version]) return
            
            ancs = resource.ancestors(resource.acked_boundary)
            if (ancs[version]) return
            
            add_full_ack_leaf(resource, version)
            node.bindings(key).forEach(pipe => {
                if (pipe.send && (pipe.id != origin.id))
                    pipe.send({method: 'ack', key, version, seen: 'global'})
            })
        }
    }
    
    node.fissure = ({key, fissure, origin}) => {
        node.ons.forEach(on => on('fissure', {key, fissure, origin}))

        assert(key && fissure,
               'Missing some variables',
               {key, fissure})
        var resource = node.resource_at(key)

        var fkey = fissure.a + ':' + fissure.b + ':' + fissure.conn
        if (!resource.fissures[fkey]) {
            resource.fissures[fkey] = fissure
            
            resource.acks_in_process = {}
            
            // First forward this fissure along
            node.bindings(key).forEach(pipe => {
                if (pipe.send && (!origin || (pipe.id != origin.id)))
                    pipe.send({method: 'fissure',
                               key,
                               fissure})
            })
            
            // And if this fissure matches us, then send the anti-fissure for
            // it
            if (fissure.b == node.pid)
                node.fissure({key,
                              fissure: {
                                  a:        node.pid,
                                  b:        fissure.a,
                                  conn:     fissure.conn,
                                  versions: fissure.versions,
                                  parents:  {},
                                  time:     fissure.time
                              }
                             })
        }
    }

    node.disconnected = ({key, name, versions, parents, time, origin}) => {
        if (time == null) time = Date.now()
        node.ons.forEach(on => on('disconnected', {key, name, versions, parents, time, origin}))

        // unbind them (but only if they are bound)
        if (node.bindings(key).some(p => p.id == origin.id)) node.unbind(key, origin)

        // if we haven't sent them a welcome (or they are not remote), then no need to create a fissure
        if (!origin.remote || !node.resource_at(key).we_welcomed[origin.id]) return

        // now since we're disconnecting, we reset the we_welcomed flag
        delete node.resource_at(key).we_welcomed[origin.id]

        assert(key && origin)
        // To do:
        //  - make this work for read-only connections
        //  - make this work for multiple keys (a disconnection should
        //    affect all of its keys)
        var resource = node.resource_at(key),
            fissure

        assert(!(name || versions || parents), 'Surprise!')

        // Generate the fissure
        if (name) {
            // Create fissure from name
            var [a, b, conn] = name.split(/:/)
            fissure = {
                a, b, conn,
                versions,
                parents,
                time
            }
        } else {
            // Create fissure from scratch

            // assert(resource.subscriptions[origin.id],
            //        `This pipe ${origin.id} is not on the resource for ${node.pid}'s ${key}`,
            //        resource.subscriptions)
            
            assert(origin.id,   'Need id on the origin', origin)
            assert(origin.them, 'Need a peer on origin', origin)

            var versions = {}
            var ack_versions = resource.ancestors(resource.acked_boundary)
            Object.keys(resource.time_dag).forEach(v => {
                if (!ack_versions[v] || resource.acked_boundary[v])
                    versions[v] = true
            })
            
            var parents = {}
            Object.keys(resource.fissures).forEach(x => parents[x] = true )
            
            fissure = {
                a: node.pid,
                b: origin.them,
                conn: origin.connection,
                versions,
                parents,
                time
            }

            // delete resource.subscriptions[origin.id]
        }

        node.fissure({key, origin, fissure})
    }
    
    node.delete = () => {
        // work here: idea: use "undefined" to represent deletion
    }

    node.prune = (resource) => {
        var unremovable = {}
        Object.entries(resource.fissures).forEach(x => {
            if (!resource.fissures[x[1].b + ':' + x[1].a + ':' + x[1].conn]) {
                function f(y) {
                    if (!unremovable[y.a + ':' + y.b + ':' + y.conn]) {
                        unremovable[y.a + ':' + y.b + ':' + y.conn] = true
                        unremovable[y.b + ':' + y.a + ':' + y.conn] = true
                        Object.keys(y.parents).forEach(p => {
                            if (resource.fissures[p]) f(resource.fissures[p])
                        })
                    }
                }
                f(x[1])
            }
        })
        
        var acked = resource.ancestors(resource.acked_boundary)
        var done = {}
        Object.entries(resource.fissures).forEach(x => {
            var other_key = x[1].b + ':' + x[1].a + ':' + x[1].conn
            var other = resource.fissures[other_key]
            if (other && !done[x[0]] && !unremovable[x[0]]) {
                done[x[0]] = true
                done[other_key] = true
                
                if (Object.keys(x[1].versions).every(x => acked[x] || !resource.time_dag[x])) {
                    delete resource.fissures[x[0]]
                    delete resource.fissures[other_key]
                }
            }
        })

        if (node.fissure_lifetime != null) {
            var now = Date.now()
            Object.entries(resource.fissures).forEach(([k, f]) => {
                if (f.time == null) f.time = now
                if (f.time <= now - node.fissure_lifetime) {
                    delete resource.fissures[k]
                }
            })
        }
        
        var tags = {null: {tags: {}}}
        var maintain = {}
        Object.keys(resource.time_dag).forEach(version => {
            tags[version] = {tags: {}}
        })
        function tag(version, t) {
            if (!tags[version].tags[t]) {
                tags[version].tags[t] = true
                Object.keys(resource.time_dag[version]).forEach(version => tag(version, t))
                tags[null].tags[t] = true
            }
        }
        Object.values(resource.fissures).forEach(f => {
            Object.keys(f.versions).forEach(v => {
                if (!resource.time_dag[v]) return
                tag(v, v)
                maintain[v] = true
            })
        })
        var acked = resource.ancestors(resource.acked_boundary)
        Object.keys(resource.time_dag).forEach(x => {
            if (!acked[x] || resource.acked_boundary[x]) {
                tag(x, x)
                maintain[x] = true
            }
        })
        Object.values(tags).forEach(x => {
            x.tag = Object.keys(x.tags).sort().join(',')
        })
        var q = (a, b) => {
            // This code assumes there is a God (a single first version adder)
            if (!a) a = 'null'
            return a && b && (tags[a].tag == tags[b].tag)
        }
        var seen_annotations = {}
        resource.mergeable.prune(q, q, seen_annotations)

        // here we change the name of all the versions which are not frozen,
        // meaning they might have changed,
        // so we want to give them different names to avoid the confusion of
        // thinking that they possess the same information as before
        var name_changes = {}
        Object.keys(resource.time_dag).forEach(v => {
            if (!maintain[v]) {
                var m = v.match(/^([^\-]+)\-/)
                if (m) {
                    name_changes[v] = m[1] + '-' + Math.random().toString(36).slice(2)
                } else {
                    name_changes[v] = v + '-' + Math.random().toString(36).slice(2)
                }
            }
        })
        resource.mergeable.change_names(name_changes)

        // todo: this code can maybe be moved into the resource.mergeable.prune function
        //       (this code also assumes there is a God (a single first version adder))
        var leaves = Object.keys(resource.current_version)
        var acked_boundary = Object.keys(resource.acked_boundary)
        var fiss = Object.keys(resource.fissures)
        if (leaves.length == 1 && acked_boundary.length == 1 && leaves[0] == acked_boundary[0] && fiss.length == 0 && !Object.keys(seen_annotations).length) {
            resource.time_dag = {
                [leaves[0]]: {}
            }
            var val = resource.mergeable.read_raw()
            resource.space_dag = (val && typeof(val) == 'object') ? {t: 'lit', S: val} : val
        }
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

    node.current_version = (key) =>
        Object.keys(node.resource_at(key).current_version).join('-') || null

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

    // Install handlers and bindings
    require('./events.js')(node)

    return node
}
