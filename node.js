module.exports = function create_node() {
    var node = {}
    node.pid = random_id()
    node.resources = {}
    node.connections = {}

    function resource_at(key) {
        if (!node.resources[key])
            node.resources[key] = require('./resource.js')(node.pid)//(conn_funcs)

        return node.resources[key]
    }

    function tell_connections(method, args) {
        for (var conn in node.connections)
            conn[method] && conn[method].apply(null, args)
    }

    function connected_citizens(resource) {
        return Object.values(resource.connections).filter(c => c.pid)
    }

    function add_full_ack_leaf(resource, version) {
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
        resource.acked_boundary[version] = true
        node.prune(resource)
    }
    
    function check_ack_count(key, resource, version) {
        // Todo: This only takes a key so that it can send node.on_ack(key,
        // ...) but if we can get rid of the need for a key there, we can get
        // rid of the need for a key here, and stop sending a key to this.
        if (resource.acks_in_process[version] && resource.acks_in_process[version].count == 0) {
            if (resource.acks_in_process[version].origin)
                node.on_ack(key, null, 'local', {version,
                                                 conn: resource.acks_in_process[version].origin},
                            resource.joiners[version])
            else {
                add_full_ack_leaf(resource, version)
                connected_citizens(resource).forEach(
                    c => node.on_ack(key, null, 'global', {version, conn: c})
                )
            }
        }
    }

    node.get = (key, initial, t) => {
        var r = resource_at(key),
            sender = t.conn

        r.connections[sender.id] = sender
        if (sender.pid && initial)
            node.on_get(key, false, {conn: sender})//sender.get(false)
        var versions = (Object.keys(r.time_dag).length > 0) ? r.mergeable.generate_braid(x => false) : []
        var fissures = Object.values(r.fissures)
        node.on_multiset(key, versions, fissures.map(x => ({
            name: x.a + ':' + x.b + ':' + x.conn,
            versions: x.versions,
            parents: x.parents
        })), false, false, {conn: sender})
    }
    
    node.set = (key, patches, t, joiner_num) => {
        var resource = resource_at(key),
            sender = t.conn,
            version = t.version,
            parents = t.parents
        if (!sender
            || !resource.time_dag[version]
            || (joiner_num > resource.joiners[version])) {

            resource.mergeable.add_version(version, parents, patches)
            resource.acks_in_process[version] = {
                origin: sender,
                count: connected_citizens(resource).length - (sender ? 1 : 0)
            }
            
            if (joiner_num) resource.joiners[version] = joiner_num
            Object.values(resource.connections).forEach(receiver => {
                if (!sender || (receiver.id != sender.id)) {
                    node.on_set(key, patches, {version: version, parents: parents, conn: receiver}, joiner_num)
                }
            })
        } else if (resource.acks_in_process[version]
                   // Greg: In what situation is acks_in_process[version] false?
                   && (joiner_num == resource.joiners[version]))
            resource.acks_in_process[version].count--

        check_ack_count(key, resource, version)
    }
    
    node.multiset = (key, versions, fissures, unack_boundary, min_leaves, t) => {
        var resource = resource_at(key),
            sender = t.conn,
            fissures = fissures.map(fiss => {
                if (!fiss.name) console.log('fiss', fiss)
                var [a, b, conn] = fiss.name.split(/:/)
                return {a, b, conn, versions: fiss.versions, parents: fiss.parents}
            })

        // `versions` is actually array of set messages. Each one has a version.
        var new_versions = []
        
        var v = versions[0]
        if (v && !v.version) {
            versions.shift()
            if (!Object.keys(resource.time_dag).length) {
                new_versions.push(v)
                resource.mergeable.add_version(v.version, v.parents, v.changes)
            }
        }
        
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
        versions.forEach(v => {
            if (versions_T[v.version]) {
                new_versions.push(v)
                resource.mergeable.add_version(v.version, v.parents, v.changes)
            }
        })
        
        var new_fissures = []
        var gen_fissures = []
        fissures.forEach(f => {
            var key = f.a + ':' + f.b + ':' + f.conn
            if (!resource.fissures[key]) {
                new_fissures.push(f)
                resource.fissures[key] = f
                if (f.b == resource.pid) gen_fissures.push({
                    a: resource.pid,
                    b: f.a,
                    conn: f.conn,
                    versions: f.versions,
                    parents: {}
                })
            }
        })
        
        if (!unack_boundary) {
            unack_boundary = Object.assign({}, resource.current_version)
        }
        var our_conn_versions = resource.ancestors(resource.unack_boundary)
        var new_conn_versions = resource.ancestors(unack_boundary)
        Object.keys(resource.unack_boundary).forEach(x => {
            if (new_conn_versions[x] && !unack_boundary[x]) {
                delete resource.unack_boundary[x]
            }
        })
        Object.keys(unack_boundary).forEach(x => {
            if (!our_conn_versions[x]) resource.unack_boundary[x] = true
        })
        
        if (!min_leaves) {
            min_leaves = {}
            var min = versions.filter(v => !versions_T[v.version])
            min.forEach(v => min_leaves[v.version] = true)
            min.forEach(v =>
                        Object.keys(v.parents).forEach(p => {
                            delete min_leaves[p]
                        })
                       )
        }
        var min_versions = resource.ancestors(min_leaves)
        var ack_versions = resource.ancestors(resource.acked_boundary)
        Object.keys(resource.acked_boundary).forEach(x => {
            if (!min_versions[x])
                delete resource.acked_boundary[x]
        })
        Object.keys(min_leaves).forEach(x => {
            if (ack_versions[x]) resource.acked_boundary[x] = true
        })
        
        resource.acks_in_process = {}
        
        if (new_versions.length > 0 || new_fissures.length > 0) {
            Object.values(resource.connections).forEach(conn => {
                if (conn.id != sender.id)
                    node.on_multiset(key, new_versions, new_fissures.map(x => ({
                        name: x.a + ':' + x.b + ':' + x.conn,
                        versions: x.versions,
                        parents: x.parents
                    })), unack_boundary, min_leaves, {conn})
            })
        }
        gen_fissures.forEach(f => node.fissure(key, null, f))
    }
    
    node.forget = (key, t) => {
        delete resource_at(key).connections[t.conn.id]
    }
    
    node.ack = (key, valid, seen, t, joiner_num) => {
        var resource = resource_at(key)
        if (seen == 'local') {
            // resource.ack(t.conn, t.version, joiner_num)
            if (resource.acks_in_process[t.version]
                && (joiner_num == resource.joiners[t.version])) {
                resource.acks_in_process[t.version].count--
                check_ack_count(key, resource, t.version)
            }
        } else if (seen == 'global') {
            // resource.full_ack(t.conn, t.version)

            if (!resource.time_dag[t.version]) return
            
            var ancs = resource.ancestors(resource.unack_boundary)
            if (ancs[t.version]) return
            
            ancs = resource.ancestors(resource.acked_boundary)
            if (ancs[t.version]) return
            
            add_full_ack_leaf(resource, t.version)
            connected_citizens(resource).forEach(c => {
                if (c.id != t.conn.id)
                    node.on_ack(key, null, 'global',
                                {version: t.version, conn: t.conn})
            })
        }
    }
    
    node.fissure = (key, sender, fissure) => {
        var resource = resource_at(key)
        var fkey = fissure.a + ':' + fissure.b + ':' + fissure.conn
        if (!resource.fissures[fkey]) {
            resource.fissures[fkey] = fissure
            
            resource.acks_in_process = {}
            
            connected_citizens(resource).forEach(c => {
                if (!sender || (c.id != sender.id))
                    node.on_disconnected(key, fissure.a + ':' + fissure.b + ':' + fissure.conn, fissure.versions, fissure.parents, {conn: c})
            })
            
            if (fissure.b == resource.pid) {
                node.fissure(key, null, {
                    a: resource.pid,
                    b: fissure.a,
                    conn: fissure.conn,
                    versions: fissure.versions,
                    parents: {}
                })
            }
        }
    }

    node.disconnected = (key, name, versions, parents, t) => {
        // To do: make this work for read-only connections
        var resource = resource_at(key),
            sender = t.conn,
            fissure

        // Generate the fissure
        if (name) {
            // Create fissure from name
            var [a, b, conn] = name.split(/:/)
            fissure = {
                a, b, conn,
                versions: versions,
                parents: parents
            }
        } else {
            // Create fissure from scratch
            console.assert(resource.connections[sender.id])
            console.assert(sender.pid)

            var versions = {}
            var ack_versions = resource.ancestors(resource.acked_boundary)
            Object.keys(resource.time_dag).forEach(v => {
                if (!ack_versions[v] || resource.acked_boundary[v])
                    versions[v] = true
            })
            
            var parents = {}
            Object.keys(resource.fissures).forEach(x => parents[x] = true )
            
            fissure = {
                a: resource.pid,
                b: sender.pid,
                conn: sender.id,
                versions,
                parents
            }

            delete resource.connections[sender.id]
        }

        node.fissure(key, sender, fissure)
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
        
        var tags = {'null': {tags: {}}}
        var frozen = {}
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
        Object.entries(resource.fissures).forEach(x => {
            Object.keys(x[1].versions).forEach(v => {
                if (!resource.time_dag[v]) return
                tag(v, v)
                frozen[v] = true
                Object.keys(resource.time_dag[v]).forEach(v => {
                    tag(v, v)
                    frozen[v] = true
                })
            })
        })
        var acked = resource.ancestors(resource.acked_boundary)
        Object.keys(resource.time_dag).forEach(x => {
            if (!acked[x] || resource.acked_boundary[x]) {
                tag(x, x)
                frozen[x] = true
                Object.keys(resource.time_dag[x]).forEach(v => {
                    tag(v, v)
                    frozen[v] = true
                })
            }
        })
        Object.entries(tags).forEach(x => {
            var keys = Object.keys(x[1].tags)
            if (keys.length == 0) {
                frozen[x[0]] = true
            } else if (!frozen[x[0]]) {
                x[1].tag = keys.sort().join(',')
            }
        })
        var q = (a, b) => {
            if (!a) a = 'null'
            return a && b && !frozen[a] && !frozen[b] && (tags[a].tag == tags[b].tag)
        }
        resource.mergeable.prune(q, q)

        var leaves = Object.keys(resource.current_version)
        var acked_boundary = Object.keys(resource.acked_boundary)
        var fiss = Object.keys(resource.fissures)
        if (leaves.length == 1 && acked_boundary.length == 1 && leaves[0] == acked_boundary[0] && fiss.length == 0) {
            resource.time_dag = {
                [leaves[0]]: {}
            }
            var val = resource.mergeable.read()
            resource.space_dag = (val && typeof(val) == 'object') ? {t: 'lit', S: val} : val
        }
    }

    node.connect = (connection) => {
        console.log('Time to connect!', arguments)
        connection.id = connection.id || random_id()
        node.connections[connection.id] = connection
    }
    node.create_joiner = (key) => {
        var resource = resource_at(key),
            version = sjcl.codec.hex.fromBits(
                sjcl.hash.sha256.hash(
                    Object.keys(resource.current_version).sort().join(':')))
        var joiner_num = Math.random()
        node.set(key, [], {version: version, parents: Object.assign({}, resource.current_version)}, joiner_num)
    }        
    return node
}
