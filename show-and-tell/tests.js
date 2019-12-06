require('../greg/random001.js')
require('../greg/sjcl.min.js')

random_id = () => Math.random().toString(36).substr(2)

function main() {
    var num_trials = 300

    var special_i = -1

    var max_size = 0
    
    for (var i = (special_i >= 0) ? special_i : 0; i < num_trials; i++) {
        if ((special_i < 0) && (i % Math.floor(num_trials/20) == 0)) {
            console.log('TRIAL: ' + i + ` max_size:${max_size}`)
            max_size = 0
        }
        
        check_good = false
        try {
            var size = run_trial('iiiifIIiiiEiiiiiEEff:' + i, 500, special_i >= 0, i)
            if (size > max_size) max_size = size
        } catch (e) {
            console.log(e)
            console.log('TRIAL: ' + i + ' FAILED!')
            break
        }
        if (special_i >= 0) break
    }
    console.log('check_good: ' + check_good)
}

// XXX Work-in-progress
function node_connection (id, pid, node) {
    this.id = id
    this.pid = node.pid

    // Here I can put some methods:
    this.get = (conn, initial) => node.on_get(key, initial, {conn})
    this.set = (conn, vid, parents, changes, joiner_num) =>
        node.on_set(key, changes, {version: vid, parents: parents, conn}, joiner_num)

    this.multiset = (conn, versions, fissures, conn_leaves, min_leaves) =>
        node.on_multiset(key, versions, fissures.map(x => ({
            name: x.a + ':' + x.b + ':' + x.conn,
            versions: x.nodes,
            parents: x.parents
        })), conn_leaves, min_leaves, {conn})

    this.ack = (conn, vid, joiner_num) =>
        node.on_ack(key, null, 'local', {version: vid, conn}, joiner_num)

    this.full_ack = (conn, vid) =>
        node.on_ack(key, null, 'global', {version: vid, conn})

    this.fissure = (conn, fissure) =>
        node.on_disconnected(key, fissure.a + ':' + fissure.b + ':' + fissure.conn, fissure.nodes, fissure.parents, {conn})
}

function run_trial(seed, N, show_debug, trial_num) {
    function deep_equals(a, b) {
        if (typeof(a) != 'object' || typeof(b) != 'object') return a == b
        if (a == null) return b == null
        if (Array.isArray(a)) {
            if (!Array.isArray(b)) return false
            if (a.length != b.length) return false
            for (var i = 0; i < a.length; i++)
                if (!deep_equals(a[i], b[i])) return false
            return true
        }
        var ak = Object.keys(a).sort()
        var bk = Object.keys(b).sort()
        if (ak.length != bk.length) return false
        for (var k of ak)
            if (!deep_equals(a[k], b[k])) return false
        return true
    }

    Math.randomSeed(seed)
    var rand = () => Math.random()
    
    var debug_frames = show_debug ? [] : null
    var notes = []

    var n_peers = 3
    var peers = {}
    for (var i = 0; i < n_peers; i++) {
        ;(() => {
            var p = create_node()
            ;[['get', 2], ['set', 2], ['multiset', 5], ['ack', 3], ['disconnected', 4]].forEach(x => {
                var [method, t_index] = x
                p['on_' + method] = function () {
                    var args = [...arguments].map(x => (x != null) ? JSON.parse(JSON.stringify(x)) : null)
                    var t = args[t_index]
                    if ((method != 'get') && !p.keys.my_key.subscriptions[t.conn.id]) throw 'you cannot talk to them!'
                    notes.push('SEND: ' + method + ' from:' + p.pid + ' to:' + t.conn.pid + args.map(x => ' ' + JSON.stringify(x)))
                    if (show_debug) console.log(notes)
                    peers[t.conn.pid].incoming.push([p.pid, () => {
                        notes.push('RECV: ' + method + ' from:' + p.pid + ' to:' + t.conn.pid + args.map(x => ' ' + JSON.stringify(x)))
                        if (show_debug) console.log(notes)
                        var to_pid = t.conn.pid
                        t.conn = {id: t.conn.id, pid: p.pid}
                        peers[to_pid][method](...args)
                    }])
                }
            })
            
            // work here
            p.pid = 'P' + (i + 1)
            
            p.incoming = []
            peers[p.pid] = p
            
            p.connect = (pid, alpha) => {
                if (alpha) {
                    p.on_get('my_key', true, {conn: {id: random_id(), pid}})
                }
            }
            
            if (i == 0) {
                p.letters = 'abcdefghijklmnopqrstuvwxyz'
                for (var ii = 0; ii < 100; ii++) {
                    p.letters += String.fromCharCode(12032 + ii)
                }
                p.letters_i = 0
            } else if (i == 1) {
                p.letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
                for (var ii = 0; ii < 100; ii++) {
                    p.letters += String.fromCharCode(12032 + 1000 + ii)
                }
                p.letters_i = 0
            } else {
                p.letters = ''
                for (var ii = 0; ii < 100; ii++) {
                    p.letters += String.fromCharCode(12032 + 2000 + ii)
                }
                p.letters_i = 0
            }
        })()
    }
    var peers_array = Object.values(peers)
    

    for (var p1 = 0; p1 < n_peers; p1++) {
        for (var p2 = p1 + 1; p2 < n_peers; p2++) {
            notes = ['connecting ' + p1 + ':' + peers_array[p1].pid + ' and ' + p2 + ':' + peers_array[p2].pid]
            
            var alpha = Math.random() < 0.5
            peers_array[p1].connect(peers_array[p2].pid, alpha)
            peers_array[p2].connect(peers_array[p1].pid, !alpha)
            
            if (debug_frames) debug_frames.push({
                t: -1,
                peer_notes: {
                    [peers_array[p1].pid]: notes,
                    [peers_array[p2].pid]: notes
                },
                peers: peers_array.map(x => JSON.parse(JSON.stringify(x)))
            })
        }
    }
    
    if (true) {
        notes = ['initial edit']
        let p = peers_array[0]
        p.set('my_key', [], {version: 'root', parents: {}})
        if (debug_frames) debug_frames.push({
            t: -1,
            peer_notes: {[p.pid]: notes},
            peers: peers_array.map(x => JSON.parse(JSON.stringify(x)))
        })
    }
    
    try {
    
    for (var t = 0; t < N; t++) {
        if (show_debug) console.log('t == ' + t)
        
        
        
        var i = Math.floor(rand() * n_peers)
        var p = peers_array[i]
        
        notes = []
        
        if (rand() < 0.1) {
            if (rand() < 0.9) {
                if (p.keys['my_key'] && Object.keys(p.keys['my_key'].time_dag).length) {
                    if (p.letters_i >= p.letters.length) {
                        p.letters_i = 0
                    }
                    var e = create_random_edit(p.keys['my_key'], p.letters[p.letters_i++])
                    p.set('my_key', e.changes, {version: e.vid, parents: e.parents})
                }
            } else {
                var other_p = p
                while (other_p == p) {
                    other_p = peers_array[Math.floor(rand() * n_peers)]
                }
                var disconnect = false
                Object.values(p.keys.my_key ? p.keys.my_key.subscriptions : []).forEach(c => {
                    if (c.pid == other_p.pid) {
                        disconnect = true
                        p.disconnected('my_key', null, null, null, {conn: c})
                    }
                })
                Object.values(other_p.keys.my_key ? other_p.keys.my_key.subscriptions : []).forEach(c => {
                    if (c.pid == p.pid) {
                        disconnect = true
                        other_p.disconnected('my_key', null, null, null, {conn: c})
                    }
                })
                if (disconnect) {
                    notes.push(' disconnect ' + p.pid + ' and ' + other_p.pid)
                    p.incoming = p.incoming.filter(x => x[0] != other_p.pid)
                    other_p.incoming = other_p.incoming.filter(x => x[0] != p.pid)
                } else {
                    notes.push(' connect ' + p.pid + ' and ' + other_p.pid)
                    var alpha = Math.random() < 0.5
                    p.connect(other_p.pid, alpha)
                    other_p.connect(p.pid, !alpha)
                }
            }
        } else {
            if (show_debug) console.log('process incoming')
            var did_something = false
            if (p.incoming.length > 0) {
                did_something = true
                
                var possible_peers = {}
                p.incoming.forEach(x => possible_peers[x[0]] = true)
                possible_peers = Object.keys(possible_peers)
                var chosen_peer = possible_peers[Math.floor(Math.random() * possible_peers.length)]
                
                var msg = p.incoming.splice(p.incoming.findIndex(x => x[0] == chosen_peer), 1)[0][1]()
            }
            if (!did_something) {
                if (show_debug) console.log('did nothing')
            }
        }
        
        if (show_debug)
            console.log('peer: ' + p.pid + ' -> ' + JSON.stringify(p.keys.my_key && p.keys['my_key'].mergeable.read()))
            
        if (debug_frames) debug_frames.push({
            t: t,
            peer_notes: {[p.pid]: notes},
            peers: peers_array.map(x => JSON.parse(JSON.stringify(x)))
        })
    }

    for (var p1 = 0; p1 < n_peers; p1++) {
        var p1_p = peers_array[p1]
        for (var p2 = p1 + 1; p2 < n_peers; p2++) {
            var p2_p = peers_array[p2]
            if (!Object.values(p1_p.keys['my_key']
                               ? p1_p.keys['my_key'].subscriptions
                               : []
                              ).some(x => x.pid == p2_p.pid)
                && !p1_p.incoming.some(x => x[0] == p2_p.pid)
                && !Object.values(p2_p.keys['my_key']
                                  ? p2_p.keys['my_key'].subscriptions
                                  : []
                                 ).some(x => x.pid == p1_p.pid)
                && !p2_p.incoming.some(x => x[0] == p1_p.pid)) {

                notes = ['connecting ' + p1 + ':' + p1_p.pid + ' and ' + p2 + ':' + p2_p.pid]
                
                var alpha = Math.random() < 0.5
                peers_array[p1].connect(p2_p.pid, alpha)
                peers_array[p2].connect(p1_p.pid, !alpha)
                
                if (debug_frames) debug_frames.push({
                    t: -1,
                    peer_notes: {
                        [p1_p.pid]: notes,
                        [p2_p.pid]: notes
                    },
                    peers: peers_array.map(x => JSON.parse(JSON.stringify(x)))
                })
            }
        }
    }
    
    var tt = 0
    for (var t = 0; t < 50; t++) {
        Object.values(peers).forEach(p => {
            while (p.incoming.length > 0) {
                tt++
                if (show_debug) console.log('t => ' + tt)
                
                notes = []

                p.incoming.shift()[1]()
                
                if (debug_frames) debug_frames.push({
                    tt: tt,
                    peer_notes: {[p.pid]: notes},
                    peers: peers_array.map(x => JSON.parse(JSON.stringify(x)))
                })
            }
        })
        
        if (Object.values(peers).every(x => x.incoming.length == 0)) {
            tt++
            var too_many_fissures = false    
            Object.values(peers).forEach((x, i) => {
                if (x.keys['my_key'] && (Object.keys(x.keys['my_key'].fissures).length > 0)) {
                    too_many_fissures = true
                }
            })
            
            var too_many_versions = false
            Object.values(peers).forEach((x, i) => {
                if (x.keys['my_key'] && (Object.keys(x.keys['my_key'].time_dag).length > 1)) {
                    too_many_versions = true
                }
            })
            
            if (too_many_fissures || too_many_versions) {
                var i = Math.floor(rand() * n_peers)
                var p = peers_array[i]
                
                notes = ['creating joiner']
                p.keys['my_key'].create_joiner()
                
                if (debug_frames) debug_frames.push({
                    tt: tt,
                    peer_notes: {[p.pid]: notes},
                    peers: peers_array.map(x => JSON.parse(JSON.stringify(x)))
                })
            } else {
                break
            }
        }
    }
    
    } catch (e) {
        console.log('ERROR')
        console.log(e)
        if (!show_debug) throw 'stop'
    }

    Object.values(peers).forEach((x, i) => {
        if (!x.keys.my_key) {
            console.log('missing my_key for ' + x.pid)
            check_good = false
            throw 'bad'
        }
    })
    
    var check_val = null
    check_good = true
    Object.values(peers).forEach((x, i) => {
        var val = x.keys.my_key.mergeable.read()
        if (i == 0)
            check_val = val
        else if (!deep_equals(val, check_val))
            check_good = false
    })

    var too_many_fissures = false    
    Object.values(peers).forEach((x, i) => {
        if (Object.keys(x.keys.my_key.fissures).length > 0) {
            check_good = false
            too_many_fissures = true
        }
    })
    
    var too_many_versions = false
    Object.values(peers).forEach((x, i) => {
        if (Object.keys(x.keys.my_key.time_dag).length > 2) {
            check_good = false
            too_many_versions = true
        }
    })
        
        
    //console.log('CHECK GOOD: ' + check_good)
    if (!check_good) {
        Object.values(peers).forEach((x, i) => {
            console.log(x)
            var val = x.keys.my_key.mergeable.read()
            console.log('val: ' + JSON.stringify(val))
        })
        console.log('too_many_fissures: ' + too_many_fissures)
        console.log('too_many_versions: ' + too_many_versions)
        console.log('trial_num: ' + trial_num)
        if (!show_debug) throw 'stop'
    }

    function rand() { return Math.random() }

    function create_random_edit(resource, letters) {
        letters = letters || 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
        var o = resource.mergeable.read()
        
        function create_random_thing_to_insert() {
            if (Math.random() < 0.25) {
                return {}
            } else if (Math.random() < 0.33) {
                return []
            } else if (Math.random() < 0.5) {
                return Math.floor(Math.random() * 100)
            } else {
                return letters[Math.floor(rand() * letters.length)].repeat(Math.floor(rand() * 4))
            }
        }
        
        var include_vals = (o == null) || (Math.random() < 0.2)
        
        var paths = {}
        function get_paths(x, path) {
            if (include_vals || (x != null && typeof(x) == 'object'))
                paths[path] = x
            if (x == null) {
            } else if (Array.isArray(x)) {
                for (var i = 0; i < x.length; i++) {
                    get_paths(x[i], path + `[${i}]`)
                }
            } else if (typeof(x) == 'object') {
                Object.entries(x).forEach(x => {
                    get_paths(x[1], path + `[${JSON.stringify(x[0])}]`)
                })
            }
        }
        get_paths(o, '')
        
        var changes = []
        var ents = Object.entries(paths)
        if (ents.length > 0) {
            var ent = ents[Math.floor(Math.random() * ents.length)]
            if (typeof(ent[1]) == 'string') {
                var x = ent[1]
                var start = Math.floor(rand() * (x.length + 1))
                var del = Math.floor(rand() * rand() * (x.length - start + 1))
                var ins = letters[Math.floor(rand() * letters.length)].repeat(Math.floor(rand() * 4) + (del == 0 ? 1 : 0))
                changes.push(ent[0] + `[${start}:${start + del}] = ` + JSON.stringify(ins))
            } else if (Array.isArray(ent[1])) {
                var x = ent[1]
                var start = Math.floor(rand() * (x.length + 1))
                var del = Math.floor(rand() * rand() * (x.length - start + 1))
                var ins = []
                var ins_len = Math.floor(rand() * 3)
                for (var i = 0; i < ins_len; i++) {
                    ins.push(create_random_thing_to_insert())
                }
                changes.push(ent[0] + `[${start}:${start + del}] = ` + JSON.stringify(ins))
            } else if (ent[1] != null && typeof(ent[1]) == 'object') {
                var i = Math.floor(Math.random() * 3)
                var key = 'abc'.slice(i, i + 1)
                changes.push(ent[0] + `[${JSON.stringify(key)}] = ${JSON.stringify(create_random_thing_to_insert())}`)
            } else {
                changes.push(ent[0] + ' = ' + JSON.stringify(create_random_thing_to_insert()))
            }
        }
        
        // work here
        var vid = random_id()
        resource.next_version_id = (resource.next_version_id || 0) + 1
        var vid = letters[0] + resource.next_version_id
        
        return {
            vid,
            parents : Object.assign({}, resource.current_version),
            changes
        }
    }

    if (show_debug) {
        Object.values(peers).forEach(x => {
            console.log('peer: ' + JSON.stringify(x.keys.my_key.mergeable.read()))
        })
    }
    
    return JSON.stringify(peers_array[0].keys.my_key.mergeable.read()).length
}



function create_node() {
    var node = {}
    node.pid = random_id()
    node.keys = {}
    
    function get_key(key) {
        if (!node.keys[key]) node.keys[key] = require('../resource.js')({
            pid: node.pid,
            get: (conn, initial) => {
                node.on_get(key, initial, {conn})
            },
            set: (conn, vid, parents, changes, joiner_num) => {
                node.on_set(key, changes, {version: vid, parents: parents, conn}, joiner_num)
            },
            multiset: (conn, versions, fissures, conn_leaves, min_leaves) => {
                node.on_multiset(key, versions, fissures.map(x => ({
                    name: x.a + ':' + x.b + ':' + x.conn,
                    versions: x.nodes,
                    parents: x.parents
                })), conn_leaves, min_leaves, {conn})
            },
            ack: (conn, vid, joiner_num) => {
                node.on_ack(key, null, 'local', {version: vid, conn}, joiner_num)
            },
            full_ack: (conn, vid) => {
                node.on_ack(key, null, 'global', {version: vid, conn})
            },
            fissure: (conn, fissure) => {
                node.on_disconnected(key, fissure.a + ':' + fissure.b + ':' + fissure.conn, fissure.nodes, fissure.parents, {conn})
            }
        })
        return node.keys[key]
    }

    node.get = (key, initial, t) => {
        get_key(key).get(t.conn, initial)
    }
    
    node.set = (key, patches, t, joiner_num) => {
        get_key(key).set(t.conn, t.version, t.parents, patches, joiner_num)
    }
    
    node.multiset = (key, versions, fissures, conn_leaves, min_leaves, t) => {
        get_key(key).multiset(t.conn, versions, fissures.map(x => {
            var [a, b, conn] = x.name.split(/:/)
            return {a, b, conn, nodes: x.versions, parents: x.parents}
        }), conn_leaves, min_leaves)
    }
    
    node.forget = (key, t) => {
        get_key(key).forget(t.conn)
    }
    
    node.ack = (key, valid, seen, t, joiner_num) => {
        if (seen == 'local') {
            get_key(key).ack(t.conn, t.version, joiner_num)
        } else if (seen == 'global') {
            get_key(key).full_ack(t.conn, t.version)
        }
    }
    
    node.disconnected = (key, name, versions, parents, t) => {
        var f = null
        if (name) {
            var [a, b, conn] = name.split(/:/)
            f = {
                a, b, conn,
                nodes: versions,
                parents: parents
            }            
        }
        get_key(key).fissure(t.conn, f)
    }
    
    node.delete = () => {
        // work here: idea: use "undefined" to represent deletion
    }
    
    return node
}



main()
