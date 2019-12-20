// Example implementation of a `subscribable resource` in Javascript.  This is
// a resource implementing the abstract Braid protocol, with:
//
//  - subscriptions
//  - acknowledgements
//  - connections and disconnections
//  - pruning
//  - and a merge-type.
//
// Right now it only works with the sync9 merge-type, which is implemented in
// the mergeables/ directory


module.exports = function create_resource(conn_funcs) {
    var self = {}
    self.pid = conn_funcs.pid || random_id()

    // The version history
    self.time_dag = {}
    self.current_version = {}
    self.ancestors = function ancestors(versions) {
        var result = {}
        function recurse (version) {
            if (result[version]) return
            result[version] = true
            Object.keys(self.time_dag[version]).forEach(recurse)
        }
        Object.keys(versions).forEach(recurse)
        return result
    }

    // A data structure that can merge simultaneous operations
    self.mergeable = require('./merge-algorithms/sync9.js').create(self)

    // The peers we are connected to, and whether they can send us edits
    self.connections = {}

    // Disconnections that have occurred in the network without a forget()
    self.fissures = {}

    // Acknowledgement data
    self.acked_boundary = {}
    self.unack_boundary = {}
    self.acks_in_process = {}

    // Empty versions sent to collapse outstanding parallel edits
    self.joiners = {}
    
    // Connections take this form:
    // 
    //    connection: {
    //         id:  <string>          // ID of the connection
    //         pid: <optional string> // ID of peer
    //    }
    //
    //    If pid is set, it implies that peer has also subscribed to us.  We
    //    call this a `symmetric` connection.
    //
    // Fissures take this form:
    //
    // ...


    // Methods
    self.get = (sender, initial) => {
        self.connections[sender.id] = sender
        if (sender.pid && initial) conn_funcs.get(sender, false)
        var versions = (Object.keys(self.time_dag).length > 0) ? self.mergeable.generate_braid(x => false) : []
        var fissures = Object.values(self.fissures)
        conn_funcs.multiset(sender, versions, fissures)
    }
    
    self.forget = (sender) => {
        delete self.connections[sender.id]
    }
    
    function connected_citizens() {
        return Object.values(self.connections).filter(c => c.pid)
    }
    
    self.set = (sender, version, parents, changes, joiner_num) => {
        if (!sender
            || !self.time_dag[version]
            || (joiner_num > self.joiners[version])) {

            self.mergeable.add_version(version, parents, changes)
            self.acks_in_process[version] = {
                origin: sender,
                count: connected_citizens().length - (sender ? 1 : 0)
            }
            
            if (joiner_num) self.joiners[version] = joiner_num
            Object.values(self.connections).forEach(receiver => {
                if (!sender || (receiver.id != sender.id))
                    conn_funcs.set(receiver, version, parents, changes, joiner_num)
            })
        } else if (self.acks_in_process[version]
                   // Greg: In what situation is acks_in_process[version] false?
                   && (joiner_num == self.joiners[version]))
            self.acks_in_process[version].count--

        check_ack_count(version)
    }

    self.multiset = (sender, versions, fissures, unack_boundary, min_leaves) => {
        // `versions` is actually array of set messages. Each one has a version.

        var new_versions = []
        
        var v = versions[0]
        if (v && !v.version) {
            versions.shift()
            if (!Object.keys(self.time_dag).length) {
                new_versions.push(v)
                self.mergeable.add_version(v.version, v.parents, v.changes)
            }
        }
        
        var versions_T = {}
        versions.forEach(v => versions_T[v.version] = v.parents)
        versions.forEach(v => {
            if (self.time_dag[v.version]) {
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
                self.mergeable.add_version(v.version, v.parents, v.changes)
            }
        })
        
        var new_fissures = []
        var gen_fissures = []
        fissures.forEach(f => {
            var key = f.a + ':' + f.b + ':' + f.conn
            if (!self.fissures[key]) {
                new_fissures.push(f)
                self.fissures[key] = f
                if (f.b == self.pid) gen_fissures.push({
                    a: self.pid,
                    b: f.a,
                    conn: f.conn,
                    versions: f.versions,
                    parents: {}
                })
            }
        })
        
        if (!unack_boundary) {
            unack_boundary = Object.assign({}, self.current_version)
        }
        var our_conn_versions = self.ancestors(self.unack_boundary)
        var new_conn_versions = self.ancestors(unack_boundary)
        Object.keys(self.unack_boundary).forEach(x => {
            if (new_conn_versions[x] && !unack_boundary[x]) {
                delete self.unack_boundary[x]
            }
        })
        Object.keys(unack_boundary).forEach(x => {
            if (!our_conn_versions[x]) self.unack_boundary[x] = true
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
        var min_versions = self.ancestors(min_leaves)
        var ack_versions = self.ancestors(self.acked_boundary)
        Object.keys(self.acked_boundary).forEach(x => {
            if (!min_versions[x])
                delete self.acked_boundary[x]
        })
        Object.keys(min_leaves).forEach(x => {
            if (ack_versions[x]) self.acked_boundary[x] = true
        })
        
        self.acks_in_process = {}
        
        if (new_versions.length > 0 || new_fissures.length > 0) {
            Object.values(self.connections).forEach(c => {
                if (c.id != sender.id) conn_funcs.multiset(c, new_versions, new_fissures, unack_boundary, min_leaves)
            })
        }
        gen_fissures.forEach(f => self.fissure(null, f))
    }
    
    self.ack = (sender, version, joiner_num) => {
        if (self.acks_in_process[version] && (joiner_num == self.joiners[version])) {
            self.acks_in_process[version].count--
            check_ack_count(version)
        }
    }
    
    self.full_ack = (sender, version) => {
        if (!self.time_dag[version]) return
        
        var ancs = self.ancestors(self.unack_boundary)
        if (ancs[version]) return
        
        var ancs = self.ancestors(self.acked_boundary)
        if (ancs[version]) return
        
        add_full_ack_leaf(version)
        connected_citizens().forEach(c => {
            if (c.id != sender.id) conn_funcs.full_ack(c, version)
        })
    }
    
    function add_full_ack_leaf(version) {
        var marks = {}
        function f(v) {
            if (!marks[v]) {
                marks[v] = true
                delete self.unack_boundary[v]
                delete self.acked_boundary[v]
                delete self.acks_in_process[v]
                delete self.joiners[v]
                Object.keys(self.time_dag[v]).forEach(f)
            }
        }
        f(version)
        self.acked_boundary[version] = true
        self.prune()
    }
    
    function check_ack_count(version) {
        if (self.acks_in_process[version] && self.acks_in_process[version].count == 0) {
            if (self.acks_in_process[version].origin)
                conn_funcs.ack(self.acks_in_process[version].origin,
                               version,
                               self.joiners[version])
            else {
                add_full_ack_leaf(version)
                connected_citizens().forEach(c => conn_funcs.full_ack(c, version))
            }
        }
    }

    self.fissure = (sender, fissure) => {
        var key = fissure.a + ':' + fissure.b + ':' + fissure.conn
        if (!self.fissures[key]) {
            self.fissures[key] = fissure
            
            self.acks_in_process = {}
            
            connected_citizens().forEach(c => {
                if (!sender || (c.id != sender.id)) conn_funcs.fissure(c, fissure)
            })
            
            if (fissure.b == self.pid) {
                self.fissure(null, {
                    a: self.pid,
                    b: fissure.a,
                    conn: fissure.conn,
                    versions: fissure.versions,
                    parents: {}
                })
            }
        }
    }
    
    self.disconnected = (sender, name, versions, parents) => {
        // To do: make this work for read-only connections
        var fissure

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
            console.assert(self.connections[sender.id])
            console.assert(sender.pid)

            var versions = {}
            var ack_versions = self.ancestors(self.acked_boundary)
            Object.keys(self.time_dag).forEach(v => {
                if (!ack_versions[v] || self.acked_boundary[v])
                    versions[v] = true
            })
            
            var parents = {}
            Object.keys(self.fissures).forEach(x => parents[x] = true )
            
            fissure = {
                a: self.pid,
                b: sender.pid,
                conn: sender.id,
                versions,
                parents
            }

            delete self.connections[sender.id]
        }

        self.fissure(sender, fissure)
    }

    self.prune = () => {
        var unremovable = {}
        Object.entries(self.fissures).forEach(x => {
            if (!self.fissures[x[1].b + ':' + x[1].a + ':' + x[1].conn]) {
                function f(y) {
                    if (!unremovable[y.a + ':' + y.b + ':' + y.conn]) {
                        unremovable[y.a + ':' + y.b + ':' + y.conn] = true
                        unremovable[y.b + ':' + y.a + ':' + y.conn] = true
                        Object.keys(y.parents).forEach(p => {
                            if (self.fissures[p]) f(self.fissures[p])
                        })
                    }
                }
                f(x[1])
            }
        })
        
        var acked = self.ancestors(self.acked_boundary)
        var done = {}
        Object.entries(self.fissures).forEach(x => {
            var other_key = x[1].b + ':' + x[1].a + ':' + x[1].conn
            var other = self.fissures[other_key]
            if (other && !done[x[0]] && !unremovable[x[0]]) {
                done[x[0]] = true
                done[other_key] = true
                
                if (Object.keys(x[1].versions).every(x => acked[x] || !self.time_dag[x])) {
                    delete self.fissures[x[0]]
                    delete self.fissures[other_key]
                }
            }
        })
        
        var tags = {'null': {tags: {}}}
        var frozen = {}
        Object.keys(self.time_dag).forEach(version => {
            tags[version] = {tags: {}}
        })
        function tag(version, t) {
            if (!tags[version].tags[t]) {
                tags[version].tags[t] = true
                Object.keys(self.time_dag[version]).forEach(version => tag(version, t))
                tags[null].tags[t] = true
            }
        }
        Object.entries(self.fissures).forEach(x => {
            Object.keys(x[1].versions).forEach(v => {
                if (!self.time_dag[v]) return
                tag(v, v)
                frozen[v] = true
                Object.keys(self.time_dag[v]).forEach(v => {
                    tag(v, v)
                    frozen[v] = true
                })
            })
        })
        var acked = self.ancestors(self.acked_boundary)
        Object.keys(self.time_dag).forEach(x => {
            if (!acked[x] || self.acked_boundary[x]) {
                tag(x, x)
                frozen[x] = true
                Object.keys(self.time_dag[x]).forEach(v => {
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
        self.mergeable.prune(q, q)

        var leaves = Object.keys(self.current_version)
        var acked_boundary = Object.keys(self.acked_boundary)
        var fiss = Object.keys(self.fissures)
        if (leaves.length == 1 && acked_boundary.length == 1 && leaves[0] == acked_boundary[0] && fiss.length == 0) {
            self.time_dag = {
                [leaves[0]]: {}
            }
            var val = self.mergeable.read()
            self.space_dag = (val && typeof(val) == 'object') ? {t: 'lit', S: val} : val
        }
    }
    
    self.create_joiner = () => {
        var version = sjcl.codec.hex.fromBits(
            sjcl.hash.sha256.hash(
                Object.keys(self.current_version).sort().join(':')))
        var joiner_num = Math.random()
        self.set(null, version, Object.assign({}, self.current_version),
                 [], joiner_num)
    }
    
    return self
}