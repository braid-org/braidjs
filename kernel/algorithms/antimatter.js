module.exports = require.antimatter = (node) => ({

    set (args) {
        var {key, patches, version, parents, origin} = args
        var resource = node.resource_at(key)
        if (args.is_new) {
            // Next, we want to remember some information for the purposes of
            // acknowledgments, namely, we'll remember how many people we
            // forward this version along to (we'll actually do the forwarding
            // right after this), and we also remember whether or not we are
            // the originators of this version (if we originated the version,
            // then we'll be responsible for sending the "global" ack when the
            // time is right)..

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
        }
        else if (resource.acks_in_process[version])
            // Q: In what situation is acks_in_process[version] false?
            //
            // A: Good question; the answer is that in some cases we will
            // delete acks_in_process for a version if, say, we receive a
            // global ack for a descendant of this version, or if we
            // receive a fissure.. in such cases, we simply ignore the
            // ack process for that version, and rely on a descendant
            // version getting globally acknowledged.

            // Now if we're not going to add the version, most commonly
            // because we already possess the version, there is another
            // situation that can arise, namely, someone that we forwarded the
            // version to sends it back to us... How could that happen? Well,
            // they may have heard about this version from someone we sent it
            // to, before hearing about it from us (assuming some pretty gross
            // latency)..  anyway, if it happens, we can treat it like an ACK
            // for the version, which is why we decrement "count" for
            // acks_in_process for this version; a similar line of code exists
            // inside "node.ack"

            resource.acks_in_process[version].count--

        // Since we may have messed with the ack count, we check it to see if
        // it has gone to 0, and if it has, take the appropriate action (which
        // is probably to send a global ack)

        check_ack_count(node, key, resource, version)
    },

    ack (args) {
        var {key, valid, seen, version, origin} = args
        var resource = node.resource_at(key)
        if (seen === 'local') {
            if (resource.acks_in_process[version]) {
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

    welcome (args) {
        var {key, versions, fissures, unack_boundary, min_leaves, parents,
             origin, versions_to_add, added_versions} = args

        var resource = node.resource_at(key)

        // Next we process the incoming fissures, and like before, we only
        // want to add new ones, and there's also this gen_fissures variable
        // which is short for "generated_fissures", and records fissures which
        // we created just now as part of a special case where we receive a
        // fissure that we were supposedly involved with, but we don't have a
        // fissure record for (this can happen when someone tries to connect
        // with us, but the connection is broken even before we knew they were
        // trying to connect)

        var new_fissures = []
        var gen_fissures = []
        fissures.forEach(f => {
            var key = f.a + ':' + f.b + ':' + f.conn
            if (!resource.fissures[key]) {

                // So we don't have this fissure.. let's add it..

                new_fissures.push(f)
                resource.fissures[key] = f

                // Now let's check for that special case where we don't have
                // the fissure, but we're one of the ends of the fissure (note
                // that we don't check for f.a == node.pid because that would
                // be a fissure created by us -- we're looking for fissures
                // not created by us, but that we are the other end of).  We
                // just add these fissures to gen_fissures for now, and later
                // in this function we'll iterate over gen_fissures and
                // actually add these fissures to our data structure (as well
                // as tell them to our peers)
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

        // There is this thing called the unack_boundary, which defines a set
        // of nodes (namely everything on the boundary, and any ancestors of
        // anything on the boundary), and these nodes should exhibit the
        // behavior that even if a global acknowledgment is received for them,
        // it should be ignored.
        //
        // Why should we ignore them? well, this welcome message we've received
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

        // This next if statement deals with two cases of the welcome message.
        // in one case, the welcome is sent as a response to a get, in which
        // case unack_boundary is null (and you can see that we just set it to
        // be absolutely all of the versions we currently know about, both in
        // our own version set, and the incoming version set, since we already
        // added the incoming versions to our set). If it isn't null, then we
        // don't need to give it a value here (and this message must be a case
        // of propoagating a welcome around the network)
        //
        // So conceptually, we establish the unack_boundary on the initial
        // welcome (and we can't know it before then, because the person
        // sending us this welcome doesn't know which versions we have), and
        // then once it is established, we hardcode the result into the
        // welcome messages that we send to our peers

        if (!unack_boundary)
            unack_boundary = Object.assign({}, resource.current_version)

        // To understand this next bit of code, first know that these
        // "boundary" variables are really just trying to be more effecient
        // ways of storing sets of versions (which include everything on the
        // boundary, as well as all the ancestors of those versions). If we
        // were using sets, our code would be doing this:
        //
        // resource.unack_set = union(resource.unack_set, unack_set)
        //
        // That is, we want to union our pre-existing unacked stuff with
        // the new incoming unacked stuff. But since our implementation
        // uses boundaries rather than sets, we get the code that follows
        // (you can see that the only modifications being made are to
        // resource.unack_boundary, where we delete some stuff, and add
        // some stuff, so that it represents the new boundary)

        var our_conn_versions = resource.ancestors(resource.unack_boundary)
        var new_conn_versions = resource.ancestors(unack_boundary)

        Object.keys(resource.unack_boundary).forEach(x => {
            if (new_conn_versions[x] && !unack_boundary[x])
                delete resource.unack_boundary[x]
        })
        Object.keys(unack_boundary).forEach(x => {
            if (!our_conn_versions[x]) resource.unack_boundary[x] = true
        })

        // So that was dealing with the unack_boundary stuff... now we want to
        // deal with the globally acknowledged stuff. Basically, anything that
        // is globally acknowledged by both us, and the incoming citizen, will
        // remain globally acknowledged. We'll compute these versions as the
        // intersection of ours and their acknowledged set, and then store
        // just the boundary of the intersection set and call it "min_leaves"
        // (where "min" basically means "intersection" in this case, and used
        // to be paired with "max_leaves", which meant "union", and was used
        // to represent the unack_boundary above)
        //
        // As before, min_leaves will be null on the initial welcome,
        // and we'll compute it, and then subsequent welcomes will have this
        // result included...
        
        if (!min_leaves) {
            if (versions.length === 0 && (!parents || Object.keys(parents).length === 0))
                min_leaves = {...resource.current_version}
            else {
                min_leaves = parents ? {...parents} : {}
                versions.forEach(v => {
                    if (!versions_to_add[v.version]) min_leaves[v.version] = true
                })
                min_leaves = resource.get_leaves(resource.ancestors(min_leaves, true))
            }
        }

        // We are now armed with this "min_leaves" variable,
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

        // This next line of code is pretty drastic.. it says: "If we're
        // connecting to someone new, then all our hard work keeping track of
        // acknowledgments is now useless, since it relies on an algorithm
        // that assumes there will be no patches in the network topology
        // whilst the algorithm is being carried out -- and the network
        // topology just changed, because now there's this new guy"
        //
        // Fortunately, once a new version is globally acknowledged within the
        // new topology, it's acknowledgment will extend to these versions as
        // well, because global acknowledgments apply to all ancestors of a
        // version, and any new versions will include all existing versions as
        // ancestors.
        
        resource.acks_in_process = {}

        // Ok, we're pretty much done. We've made all the patches to our own
        // data structure (except for the gen_fissures, which will happen
        // next), and now we're ready to propogate the information to our
        // peers.

        assert(unack_boundary && min_leaves && fissures && added_versions)

        // In the above, when we added new versions and fissures to ourselves,
        // we marked each such instance in added_versions or new_fissures, and
        // if we got any new versions or fissures, then we want to tell our
        // peers about it (if we didn't, then we don't need to tell anyone,
        // since there's nothing new to hear about)

        if ((added_versions.length > 0
             || new_fissures.length > 0
             || !resource.weve_been_welcomed)) {

            // Now record that we've seen a welcome
            resource.weve_been_welcomed = true

            // And tell everyone about it!
            node.bindings(key).forEach(pipe => {
                if (pipe.send && (pipe.id !== origin.id))
                    pipe.send({method: 'welcome',
                               key, versions: added_versions, unack_boundary,
                               min_leaves, fissures: new_fissures})
            })
        }


        // now we finally add the fissures we decided we need to create in
        // gen_fissures... we add them after forwarding the welcome so that
        // these network messages appear after the welcome (since they may
        // rely on information which is in the welcome for other people to
        // understand them)
        gen_fissures.forEach(f => node.fissure({key, fissure:f}))
    }
})


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

    prune(node, resource)
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
                method: 'ack', key, seen:'local', version
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

function prune (node, resource) {
    var unremovable = {}

    if (!resource.fissures)
        console.error('Bad resource', resource)

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
            if (bottom !== top)
                Object.keys(resource.time_dag[bottom]).forEach(
                    p => mark_bubble(p, top, tag)
                )
        }
    }
    
    // This begins the O(n^2) operation that we wanna shrink to O(n)
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
    // This is the end of an O(n^2) algorithm

    to_bubble = Object.fromEntries(Object.entries(to_bubble).map(
        ([v, bub]) => [v, [bub, bubble_bottoms[bub]]]
    ))
    
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
    if (resource.mergeable.prune)
        resource.mergeable.prune(to_bubble)
}