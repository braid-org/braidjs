function add_full_ack_leaf(node, resource, version) {

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
function check_ack_count(node, key, resource, version) {
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

            add_full_ack_leaf(node, resource, version)

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

module.exports = require.antimatter = (node) => ({
    get (args) {
        var {key, subscribe, version, parents, origin} = args
    },


    set (args) {
        var {key, patches, version, parents, origin, joiner_num} = args
        var resource = node.resource_at(key)
        if (args.is_new) {
            // G: next, we want to remember some information for the purposes
            // of acknowledgments, namely, we'll remember how many people
            // we forward this version along to (we'll actually do the forwarding
            // right after this), and we also remember whether or not
            // we are the originators of this version (if we originated the version,
            // then we'll be responsible for sending the "global" ack when
            // the time is right)..

            var origin_is_keepalive = origin && resource.keepalive_peers[origin.id]
            resource.acks_in_process[version] = {
                origin: origin_is_keepalive && origin,
                count: Object.keys(resource.keepalive_peers).length
            }
            if (origin_is_keepalive)
                // If the origin is a keepalive_peer, then since we've already
                // seen it from them, we can decrement count
                resource.acks_in_process[version].count--

            assert(resource.acks_in_process[version].count >= 0,
                   node.pid, 'Acks have below zero! Proof:',
                   {origin, key, version,
                    acks_in_process: resource.acks_in_process[version]})

            // console.log('Initialized acks to', resource.acks_in_process[version])
        }
        else if (resource.acks_in_process[version]
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


        check_ack_count(node, key, resource, version)
    },

    ack (args) {
        var {key, valid, seen, version, origin, joiner_num} = args
        var resource = node.resource_at(key)
        if (seen === 'local') {
            if (resource.acks_in_process[version]
                && (joiner_num === resource.joiners[version])) {
                log('node.ack: Got a local ack! Decrement count to',
                    resource.acks_in_process[version].count - 1)
                resource.acks_in_process[version].count--
                check_ack_count(node, key, resource, version)
            }
        } else if (seen === 'global') {
            if (!resource.time_dag[version]) return
            
            var ancs = resource.ancestors(resource.unack_boundary)
            if (ancs[version]) return
            
            ancs = resource.ancestors(resource.acked_boundary)
            if (ancs[version]) return
            
            add_full_ack_leaf(node, resource, version)
            node.bindings(key).forEach(pipe => {
                if (pipe.send && (pipe.id !== origin.id))
                    pipe.send({method: 'ack', key, version, seen: 'global'})
            })
        }
    },

    fissure ({key, fissure, origin}) {
        var resource = node.resource_at(key)
        var fkey = fissure.a + ':' + fissure.b + ':' + fissure.conn
        if (!resource.fissures[fkey]) {
            resource.fissures[fkey] = fissure
            
            resource.acks_in_process = {}
            
            // First forward this fissure along
            node.bindings(key).forEach(pipe => {
                if (pipe.send && (!origin || (pipe.id !== origin.id)))
                    pipe.send({
                        method: 'fissure',
                        key,
                        fissure
                    })
            })
            
            // And if this fissure matches us, then send the anti-fissure for
            // it
            if (fissure.b == node.pid)
                node.fissure({
                    key,
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
    },

    disconnected ({key, name, versions, parents, time, origin}) {
        // Todo:
        //  - rename "name" to "fissure".
        //  - rename "time" to "disconnect_time"

        // if we haven't sent them a welcome (or they are not remote), then no
        // need to create a fissure
        if (!origin.remote_peer|| !node.resource_at(key).keepalive_peers[origin.id]) return
        
        // now since we're disconnecting, we reset the keepalive_peers flag
        delete node.resource_at(key).keepalive_peers[origin.id]

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
            
            assert(origin.id,          'Need id on the origin', origin)
            assert(origin.remote_peer, 'Need a peer on origin', origin)

            var versions = {}
            var ack_versions = resource.ancestors(resource.acked_boundary)
            Object.keys(resource.time_dag).forEach(v => {
                if (!ack_versions[v] || resource.acked_boundary[v])
                    versions[v] = true
            })
            
            // Now collect the parents.  We start with all fissures...
            var parents = {...resource.fissures}
            // ... and then filter down to just be the leaves of the fissure DAG
            Object.values(resource.fissures).forEach(f => {
                Object.keys(f.parents).forEach(p => delete parents[p])
            })
            Object.keys(parents).forEach(p => parents[p] = true)

            fissure = {
                a: node.pid,
                b: origin.remote_peer,
                conn: origin.connection,
                versions,
                parents,
                time
            }

        }

        node.fissure({key, origin, fissure})
    },

    prune (resource) {
        var unremovable = {}

        // First, let's prune old fissures

        // Calculate which fissures we have to keep due to parenting
        // rule... which we will be removing soon.
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
        
        // Now remove the fissures
        Object.entries(resource.fissures).forEach(x => {
            var other_key = x[1].b + ':' + x[1].a + ':' + x[1].conn
            var other = resource.fissures[other_key]
            if (other) {
                if (unremovable[x[0]]) {
                    resource.fissures[x[0]].versions = {}
                    resource.fissures[other_key].versions = {}
                } else {
                    delete resource.fissures[x[0]]
                    delete resource.fissures[other_key]
                }
            }
        })

        // Remove fissures that have expired due to time
        if (node.fissure_lifetime != null) {
            var now = Date.now()
            Object.entries(resource.fissures).forEach(([k, f]) => {
                if (f.time == null) f.time = now
                if (f.time <= now - node.fissure_lifetime) {
                    delete resource.fissures[k]
                }
            })
        }

        // Remove fissures that are beyond our max_fissures limit
        if (node.max_fissures != null) {
            let count = Object.keys(resource.fissures).length
            if (count > node.max_fissures) {
                Object.entries(resource.fissures).sort((a, b) => {
                    if (a[1].time == null) a[1].time = now
                    if (b[1].time == null) b[1].time = now
                    return a[1].time - b[1].time
                }).slice(0, count - node.max_fissures).forEach(e => {
                    delete resource.fissures[e[0]]
                })
            }
        }

        // Now figure out which versions we want to keep,
        var keep_us = {}

        // incluing versions in fissures..
        Object.values(resource.fissures).forEach(f => {
            Object.keys(f.versions).forEach(v => keep_us[v] = true)
        })

        // and versions which are not fully acknowledged, or on the boundary
        var acked = resource.ancestors(resource.acked_boundary)
        Object.keys(resource.time_dag).forEach(x => {
            if (!acked[x] || resource.acked_boundary[x]) keep_us[x] = true
        })

        // ok, now we want to find "bubbles" in the dag,
        // with a "bottom" and "top" version,
        // where any path down from the top will hit the bottom,
        // and any path up from the bottom will hit the top,
        // and also, the bubble should not contain any versions we want to keep
        // (unless it's the bottom)

        // to help us calculate bubbles,
        // let's calculate children for our time dag
        // (whereas the time dag just gives us parents)
        var children = {}
        Object.entries(resource.time_dag).forEach(([v, parents]) => {
            Object.keys(parents).forEach(parent => {
                if (!children[parent]) children[parent] = {}
                children[parent][v] = true
            })
        })

        // now we'll actually compute the bubbles
        var to_bubble = {}
        var bubble_tops = {}
        var bubble_bottoms = {}
        
        function mark_bubble(bottom, top, tag) {
            if (!to_bubble[bottom]) {
                to_bubble[bottom] = tag
                if (bottom != top) Object.keys(resource.time_dag[bottom]).forEach(p => mark_bubble(p, top, tag))
            }
        }
        
        var done = {}
        function f(cur) {
            if (!resource.time_dag[cur]) return
            if (done[cur]) return
            done[cur] = true
            
            if (!to_bubble[cur] || bubble_tops[cur]) {
                var bubble_top = find_one_bubble(cur)
                if (bubble_top) {
                    delete to_bubble[cur]
                    mark_bubble(cur, bubble_top, bubble_tops[cur] || cur)
                    bubble_tops[bubble_top] = bubble_tops[cur] || cur
                    bubble_bottoms[bubble_tops[cur] || cur] = bubble_top
                }
            }
    
            Object.keys(resource.time_dag[cur]).forEach(f)
        }
        Object.keys(resource.current_version).forEach(f)
    
        to_bubble = Object.fromEntries(Object.entries(to_bubble).map(([v, bub]) => [v, [bub, bubble_bottoms[bub]]]))
        
        function find_one_bubble(cur) {
            var seen = {[cur]: true}
            var q = Object.keys(resource.time_dag[cur])
            var expecting = Object.fromEntries(q.map(x => [x, true]))
            while (q.length) {
                cur = q.pop()
                if (!resource.time_dag[cur]) return null
                if (keep_us[cur]) return null
                if (Object.keys(children[cur]).every(c => seen[c])) {
                    seen[cur] = true
                    delete expecting[cur]
                    if (!Object.keys(expecting).length) return cur
                    
                    Object.keys(resource.time_dag[cur]).forEach(p => {
                        q.push(p)
                        expecting[p] = true
                    })
                }
            }
            return null
        }

        // now hand these bubbles to the mergeable's prune function..
        var seen_annotations = {}
        resource.mergeable.prune(to_bubble, seen_annotations)

        // Now we check to see if we can collapse the spacedag down to a literal.
        //
        // Todo: Move this code to the resource.mergeable.prune function.
        //       (this code also assumes there is a God (a single first version adder))
        var leaves = Object.keys(resource.current_version)
        var acked_boundary = Object.keys(resource.acked_boundary)
        var fiss = Object.keys(resource.fissures)
        if (leaves.length == 1 && acked_boundary.length == 1
            && leaves[0] == acked_boundary[0] && fiss.length == 0
            && !Object.keys(seen_annotations).length) {

            resource.time_dag = { [leaves[0]]: {} }
            var val = resource.mergeable.read_raw()
            resource.space_dag = (val && typeof(val) == 'object') ? {t: 'lit', S: val} : val
        }
    }
})