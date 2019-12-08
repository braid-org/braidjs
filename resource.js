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
    self.subscriptions = {}

    // Disconnections that have occurred in the network without a forget()
    self.fissures = {}

    // Acknowledgement data
    self.conn_leaves = {}
    self.ack_leaves = {}
    self.phase_one = {}

    // Empty versions sent to collapse outstanding parallel edits
    self.joiners = {}
    
    // Subscriptions take this form:
    // 
    //    subscription: {
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
        self.subscriptions[sender.id] = sender
        if (sender.pid && initial) conn_funcs.get(sender, false)
        var versions = (Object.keys(self.time_dag).length > 0) ? self.mergeable.generate_braid(x => false) : []
        var fissures = Object.values(self.fissures)
        conn_funcs.multiset(sender, versions, fissures)
    }
    
    self.forget = (sender) => {
        delete self.subscriptions[sender.id]
    }
    
    function symmetric_subscriptions() {
        return Object.values(self.subscriptions).filter(c => c.pid)
    }
    
    self.set = (sender, version, parents, changes, joiner_num) => {
        if (!sender
            || !self.time_dag[version]
            || (joiner_num > self.joiners[version])) {

            self.mergeable.add_version(version, parents, changes)
            self.phase_one[version] = {
                origin: sender,
                count: symmetric_subscriptions().length - (sender ? 1 : 0)
            }
            
            if (joiner_num) self.joiners[version] = joiner_num
            Object.values(self.subscriptions).forEach(receiver => {
                if (!sender || (receiver.id != sender.id))
                    conn_funcs.set(receiver, version, parents, changes, joiner_num)
            })
        } else if (self.phase_one[version] && (joiner_num == self.joiners[version])) {
            self.phase_one[version].count--
        }
        check_ack_count(version)
    }

    self.multiset = (sender, versions, fissures, conn_leaves, min_leaves) => {
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
        
        if (!conn_leaves) {
            conn_leaves = Object.assign({}, self.current_version)
        }
        var our_conn_versions = self.ancestors(self.conn_leaves)
        var new_conn_versions = self.ancestors(conn_leaves)
        Object.keys(self.conn_leaves).forEach(x => {
            if (new_conn_versions[x] && !conn_leaves[x]) {
                delete self.conn_leaves[x]
            }
        })
        Object.keys(conn_leaves).forEach(x => {
            if (!our_conn_versions[x]) self.conn_leaves[x] = true
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
        var ack_versions = self.ancestors(self.ack_leaves)
        Object.keys(self.ack_leaves).forEach(x => {
            if (!min_versions[x])
                delete self.ack_leaves[x]
        })
        Object.keys(min_leaves).forEach(x => {
            if (ack_versions[x]) self.ack_leaves[x] = true
        })
        
        self.phase_one = {}
        
        if (new_versions.length > 0 || new_fissures.length > 0) {
            Object.values(self.subscriptions).forEach(c => {
                if (c.id != sender.id) conn_funcs.multiset(c, new_versions, new_fissures, conn_leaves, min_leaves)
            })
        }
        gen_fissures.forEach(f => self.fissure(null, f))
    }
    
    self.ack = (sender, version, joiner_num) => {
        if (self.phase_one[version] && (joiner_num == self.joiners[version])) {
            self.phase_one[version].count--
            check_ack_count(version)
        }
    }
    
    self.full_ack = (sender, version) => {
        if (!self.time_dag[version]) return
        
        var ancs = self.ancestors(self.conn_leaves)
        if (ancs[version]) return
        
        var ancs = self.ancestors(self.ack_leaves)
        if (ancs[version]) return
        
        add_full_ack_leaf(version)
        symmetric_subscriptions().forEach(c => {
            if (c.id != sender.id) conn_funcs.full_ack(c, version)
        })
    }
    
    function add_full_ack_leaf(version) {
        var marks = {}
        function f(v) {
            if (!marks[v]) {
                marks[v] = true
                delete self.conn_leaves[v]
                delete self.ack_leaves[v]
                delete self.phase_one[v]
                delete self.joiners[v]
                Object.keys(self.time_dag[v]).forEach(f)
            }
        }
        f(version)
        self.ack_leaves[version] = true
        self.prune()
    }
    
    function check_ack_count(version) {
        if (self.phase_one[version] && self.phase_one[version].count == 0) {
            if (self.phase_one[version].origin) {
                conn_funcs.ack(self.phase_one[version].origin, version, self.joiners[version])
            } else {
                add_full_ack_leaf(version)
                symmetric_subscriptions().forEach(c => {
                    conn_funcs.full_ack(c, version)
                })
            }
        }
    }

    self.fissure = (sender, fissure) => {
        var key = fissure.a + ':' + fissure.b + ':' + fissure.conn
        if (!self.fissures[key]) {
            self.fissures[key] = fissure
            
            self.phase_one = {}
            
            symmetric_subscriptions().forEach(c => {
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
            console.assert(self.subscriptions[sender.id])
            console.assert(sender.pid)

            var versions = {}
            var ack_versions = self.ancestors(self.ack_leaves)
            Object.keys(self.time_dag).forEach(v => {
                if (!ack_versions[v] || self.ack_leaves[v])
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

            delete self.subscriptions[sender.id]
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
        
        var acked = self.ancestors(self.ack_leaves)
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
        var acked = self.ancestors(self.ack_leaves)
        Object.keys(self.time_dag).forEach(x => {
            if (!acked[x] || self.ack_leaves[x]) {
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
        var ack_leaves = Object.keys(self.ack_leaves)
        var fiss = Object.keys(self.fissures)
        if (leaves.length == 1 && ack_leaves.length == 1 && leaves[0] == ack_leaves[0] && fiss.length == 0) {
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