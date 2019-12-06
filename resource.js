module.exports = function create_resource(conn_funcs) {
    var self = {}
    self.pid = conn_funcs.pid || random_id()

    self.time_dag = {}
    self.current_version = {}
    self.ancestors = function ancestors(versions) {
        var result = {}
        function mark_ancestor (version) {
            if (!result[version]) {
                result[version] = true
                Object.keys(self.time_dag[version]).forEach(mark_ancestor)
            }
        }
        Object.keys(versions).forEach(mark_ancestor)
        return result
    }

    self.subscriptions = {}
    self.fissures = {}
    self.conn_leaves = {}
    self.ack_leaves = {}
    self.phase_one = {}
    self.joiners = {}
    
    self.mergeable = sync9.create(self)

    // conn: {
    //      id: connection id,
    //      pid: (optional) peer id, implies symmetric connection
    // }

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
    
    self.set = (sender, vid, parents, changes, joiner_num) => {
        if (!sender || !self.time_dag[vid] || (joiner_num > self.joiners[vid])) {
            self.mergeable.add_version(vid, parents, changes)
            self.phase_one[vid] = {origin: sender, count: symmetric_subscriptions().length - (sender ? 1 : 0)}
            if (joiner_num) self.joiners[vid] = joiner_num
            Object.values(self.subscriptions).forEach(c => {
                if (!sender || (c.id != sender.id)) conn_funcs.set(c, vid, parents, changes, joiner_num)
            })
        } else if (self.phase_one[vid] && (joiner_num == self.joiners[vid])) {
            self.phase_one[vid].count--
        }
        check_ack_count(vid)
    }

    self.multiset = (sender, versions, fissures, conn_leaves, min_leaves) => {
        var new_versions = []
        
        var v = versions[0]
        if (v && !v.vid) {
            versions.shift()
            if (!Object.keys(self.time_dag).length) {
                new_versions.push(v)
                self.mergeable.add_version(v.vid, v.parents, v.changes)
            }
        }
        
        var versions_T = {}
        versions.forEach(v => versions_T[v.vid] = v.parents)
        versions.forEach(v => {
            if (self.time_dag[v.vid]) {
                function f(v) {
                    if (versions_T[v]) {
                        Object.keys(versions_T[v]).forEach(f)
                        delete versions_T[v]
                    }
                }
                f(v.vid)
            }
        })
        versions.forEach(v => {
            if (versions_T[v.vid]) {
                new_versions.push(v)
                self.mergeable.add_version(v.vid, v.parents, v.changes)
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
                    nodes: f.nodes,
                    parents: {}
                })
            }
        })
        
        if (!conn_leaves) {
            conn_leaves = Object.assign({}, self.current_version)
        }
        var our_conn_nodes = self.ancestors(self.conn_leaves)
        var new_conn_nodes = self.ancestors(conn_leaves)
        Object.keys(self.conn_leaves).forEach(x => {
            if (new_conn_nodes[x] && !conn_leaves[x]) {
                delete self.conn_leaves[x]
            }
        })
        Object.keys(conn_leaves).forEach(x => {
            if (!our_conn_nodes[x]) self.conn_leaves[x] = true
        })
        
        if (!min_leaves) {
            min_leaves = {}
            var min = versions.filter(v => !versions_T[v.vid])
            min.forEach(v => min_leaves[v.vid] = true)
            min.forEach(v => {
                Object.keys(v.parents).forEach(p => {
                    delete min_leaves[p]
                })
            })
        }
        var min_nodes = self.ancestors(min_leaves)
        var ack_nodes = self.ancestors(self.ack_leaves)
        Object.keys(self.ack_leaves).forEach(x => {
            if (!min_nodes[x]) {
                delete self.ack_leaves[x]
            }
        })
        Object.keys(min_leaves).forEach(x => {
            if (ack_nodes[x]) self.ack_leaves[x] = true
        })
        
        self.phase_one = {}
        
        if (new_versions.length > 0 || new_fissures.length > 0) {
            Object.values(self.subscriptions).forEach(c => {
                if (c.id != sender.id) conn_funcs.multiset(c, new_versions, new_fissures, conn_leaves, min_leaves)
            })
        }
        gen_fissures.forEach(f => self.fissure(null, f))
    }
    
    self.ack = (sender, vid, joiner_num) => {
        if (self.phase_one[vid] && (joiner_num == self.joiners[vid])) {
            self.phase_one[vid].count--
            check_ack_count(vid)
        }
    }
    
    self.full_ack = (sender, vid) => {
        if (!self.time_dag[vid]) return
        
        var ancs = self.ancestors(self.conn_leaves)
        if (ancs[vid]) return
        
        var ancs = self.ancestors(self.ack_leaves)
        if (ancs[vid]) return
        
        add_full_ack_leaf(vid)
        symmetric_subscriptions().forEach(c => {
            if (c.id != sender.id) conn_funcs.full_ack(c, vid)
        })
    }
    
    function add_full_ack_leaf(vid) {
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
        f(vid)
        self.ack_leaves[vid] = true
        self.prune()
    }
    
    function check_ack_count(vid) {
        if (self.phase_one[vid] && self.phase_one[vid].count == 0) {
            if (self.phase_one[vid].origin) {
                conn_funcs.ack(self.phase_one[vid].origin, vid, self.joiners[vid])
            } else {
                add_full_ack_leaf(vid)
                symmetric_subscriptions().forEach(c => {
                    conn_funcs.full_ack(c, vid)
                })
            }
        }
    }
    
    self.fissure = (sender, fissure) => {
        if (!fissure) {
            if (!self.subscriptions[sender.id]) return
            if (sender.pid) {
                var nodes = {}
                var ack_nodes = self.ancestors(self.ack_leaves)
                Object.keys(self.time_dag).forEach(v => {
                    if (!ack_nodes[v] || self.ack_leaves[v]) {
                        nodes[v] = true
                    }
                })
                
                var parents = {}
                Object.keys(self.fissures).forEach(x => {
                    parents[x] = true
                })
                
                fissure = {
                    a: self.pid,
                    b: sender.pid,
                    conn: sender.id,
                    nodes,
                    parents
                }
            }
            delete self.subscriptions[sender.id]
        }
    
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
                    nodes: fissure.nodes,
                    parents: {}
                })
            }
        }
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
                
                if (Object.keys(x[1].nodes).every(x => acked[x] || !self.time_dag[x])) {
                    delete self.fissures[x[0]]
                    delete self.fissures[other_key]
                }
            }
        })
        
        var tags = {'null': {tags: {}}}
        var frozen = {}
        Object.keys(self.time_dag).forEach(vid => {
            tags[vid] = {tags: {}}
        })
        function tag(vid, t) {
            if (!tags[vid].tags[t]) {
                tags[vid].tags[t] = true
                Object.keys(self.time_dag[vid]).forEach(vid => tag(vid, t))
                tags[null].tags[t] = true
            }
        }
        Object.entries(self.fissures).forEach(x => {
            Object.keys(x[1].nodes).forEach(v => {
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
        var vid = sjcl.codec.hex.fromBits(
            sjcl.hash.sha256.hash(
                Object.keys(self.current_version).sort().join(':')))
        var joiner_num = Math.random()
        self.set(null, vid, Object.assign({}, self.current_version), [], joiner_num)
    }
    
    return self
}