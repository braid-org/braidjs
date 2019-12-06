require('./greg/random001.js')
require('./greg/sjcl.min.js')

function each (o, cb) {
    if (o instanceof Array) {
        for (var i = 0; i < o.length; i++)
            if (cb(o[i], i, o) == false)
                return false
    } else
        for (var k in o)
            if (o.hasOwnProperty(k))
                if (cb(o[k], k, o) == false)
                    return false
    return true
}
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

function run_trial(seed, N, show_debug, trial_num) {
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
                var [key, t_index] = x
                p['on_' + key] = function () {
                    var args = [...arguments].map(x => (x != null) ? JSON.parse(JSON.stringify(x)) : null)
                    var t = args[t_index]
                    if ((key != 'get') && !p.keys.my_key.conns[t.conn.id]) throw 'you cannot talk to them!'
                    notes.push('SEND: ' + key + ' from:' + p.pid + ' to:' + t.conn.pid + args.map(x => ' ' + JSON.stringify(x)))
                    if (show_debug) console.log(notes)
                    peers[t.conn.pid].incoming.push([p.pid, () => {
                        notes.push('RECV: ' + key + ' from:' + p.pid + ' to:' + t.conn.pid + args.map(x => ' ' + JSON.stringify(x)))
                        if (show_debug) console.log(notes)
                        var to_pid = t.conn.pid
                        t.conn = {id: t.conn.id, pid: p.pid}
                        peers[to_pid][key](...args)
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
                Object.values(p.keys.my_key ? p.keys.my_key.conns : []).forEach(c => {
                    if (c.pid == other_p.pid) {
                        disconnect = true
                        p.disconnected('my_key', null, null, null, {conn: c})
                    }
                })
                Object.values(other_p.keys.my_key ? other_p.keys.my_key.conns : []).forEach(c => {
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
            if (!Object.values(p1_p.keys['my_key'] ? p1_p.keys['my_key'].conns : []).some(x => x.pid == p2_p.pid) && !p1_p.incoming.some(x => x[0] == p2_p.pid) && !Object.values(p2_p.keys['my_key'] ? p2_p.keys['my_key'].conns : []).some(x => x.pid == p1_p.pid) && !p2_p.incoming.some(x => x[0] == p1_p.pid)) {
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
            var val = sync9_read(x.keys.my_key.s9)
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
            console.log('peer: ' + JSON.stringify(sync9_read(x.keys.my_key.s9)))
        })
    }
    
    if (debug_frames) {
        var a = document.createElement('div')
        a.style.display = 'grid'
        a.style['grid-template-rows'] = '300px 1fr 20px'
        a.style.width = '100%'
        a.style.height = '100%'
        document.body.append(a)
        
        var c = document.createElement('canvas')
        c.width = window.innerWidth * devicePixelRatio
        c.height = 300 * devicePixelRatio
        c.style.width = (c.width / devicePixelRatio) + 'px'
        c.style.height = (c.height / devicePixelRatio) + 'px'
        var g = c.getContext('2d')
        a.append(c)
        
        var top_part = document.createElement('div')
        a.append(top_part)
        
        var slider = document.createElement('input')
        slider.style.width = '100%'
        slider.setAttribute('type', 'range')
        slider.setAttribute('min', '0')
        slider.setAttribute('max', debug_frames.length - 1)
        slider.setAttribute('value', debug_frames.length - 1)
        slider.oninput = () => {
            var d = debug_frames[1*slider.value]
            
            top_part.innerHTML = ''
            top_part.style.display = 'grid'
            top_part.style['grid-template-columns'] = '1fr 1fr 1fr'
            top_part.style['grid-template-rows'] = '1fr 2fr'
            
            peers_array.forEach((p, i) => {
                var notes = d.peer_notes[p.pid]
                if (notes && typeof(notes) == 'object') notes = notes.join('\n\n')
                if (!notes) notes = 'N/A'
                var dd = document.createElement('textarea')
                dd.value = notes
                top_part.append(dd)
            })
            
            peers_array.forEach((p, i) => {
                p = d.peers[i]
                var dd = document.createElement('textarea')
                dd.value = '= ' + (p.keys.my_key ? JSON.stringify(sync9_read(p.keys.my_key.s9)) : 'n/a') + '\n\n' + JSON.stringify(p, null, '    ')
                top_part.append(dd)
            })

            
            g.clearRect(0, 0, c.width, c.height)
            
            peers_array.forEach((p, i) => {
                p = d.peers[i]
                if (p.keys.my_key) {
                    draw_time_dag(c, g, p.keys.my_key, p.keys.my_key.s9, lerp(0, 0, 6, c.width, i*2), 35*devicePixelRatio, 300, 300, 7)
                }
            })
            
            g.font = '20px Ariel'
            g.fillStyle = 'black'
            g.textBaseline = 'top'
            if (d.tt) g.fillText('tt: ' + d.tt, 0, 0)
            else g.fillText('t: ' + d.t, 0, 0)
            
            g.lineWidth = 1
            
            var peer_locs = [
                [lerp(0, 0, 1, c.width, 0.2), 10 * devicePixelRatio],
                [lerp(0, 0, 1, c.width, 0.5), 30 * devicePixelRatio],
                [lerp(0, 0, 1, c.width, 0.8), 10 * devicePixelRatio]
            ]
            
            ;[[0, 1], [1, 0], [1, 2], [2, 1], [2, 0], [0, 2]].forEach(([a, b]) => {
                g.beginPath()
                g.lineWidth = 3
                g.strokeStyle = Object.values(d.peers[a].keys.my_key ? d.peers[a].keys.my_key.conns : {}).some(x => x.pid == d.peers[b].pid) ? 'green' : (d.peers[b].incoming.some(x => x[0] == d.peers[a].pid) || d.peers[a].incoming.some(x => x[0] == d.peers[b].pid)) ? 'orange' : 'red'
                g.moveTo(peer_locs[a][0], peer_locs[a][1])
                g.lineTo(
                    lerp(0, peer_locs[a][0], 1, peer_locs[b][0], 0.5),
                    lerp(0, peer_locs[a][1], 1, peer_locs[b][1], 0.5))
                g.stroke()
            })
        }
        a.append(slider)
        slider.oninput()
    }
    
    return JSON.stringify(peers_array[0].keys.my_key.mergeable.read()).length
}



function create_node() {
    var node = {}
    node.pid = random_id()
    node.keys = {}
    
    function get_key(key) {
        if (!node.keys[key]) node.keys[key] = sync9_create_peer({
            pid: node.pid,
            get: (conn, initial) => {
                node.on_get(key, initial, {conn})
            },
            set: (conn, vid, parents, changes, joiner_num) => {
                node.on_set(key, changes, {version: vid, parents: parents, conn}, joiner_num)
            },
            set_multi: (conn, vs, fs, conn_leaves, min_leaves) => {
                node.on_multiset(key, vs, fs.map(x => ({
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
    
    node.multiset = (key, vs, fs, conn_leaves, min_leaves, t) => {
        get_key(key).set_multi(t.conn, vs, fs.map(x => {
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



function sync9_create_peer(conn_funcs) {
    var self = {}
    self.pid = conn_funcs.pid || random_id()
    // self.s9 = sync9_create()
    self.time_dag = {}
    self.current_version = {}
    self.space_dag = null

    self.conns = {}
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
    self.get = (conn, initial) => {
        self.conns[conn.id] = conn
        if (conn.pid && initial) conn_funcs.get(conn, false)
        var vs = (Object.keys(self.time_dag).length > 0) ? self.mergeable.generate_patches(x => false) : []
        var fs = Object.values(self.fissures)
        conn_funcs.set_multi(conn, vs, fs)
    }
    
    self.forget = (conn) => {
        delete self.conns[conn.id]
    }
    
    function get_symmetric_conns() {
        return Object.values(self.conns).filter(c => c.pid)
    }
    
    self.set = (conn, vid, parents, changes, joiner_num) => {
        if (!conn || !self.time_dag[vid] || (joiner_num > self.joiners[vid])) {
            self.mergeable.add_version(vid, parents, changes)
            self.phase_one[vid] = {origin: conn, count: get_symmetric_conns().length - (conn ? 1 : 0)}
            if (joiner_num) self.joiners[vid] = joiner_num
            Object.values(self.conns).forEach(c => {
                if (!conn || (c.id != conn.id)) conn_funcs.set(c, vid, parents, changes, joiner_num)
            })
        } else if (self.phase_one[vid] && (joiner_num == self.joiners[vid])) {
            self.phase_one[vid].count--
        }
        check_ack_count(vid)
    }

    self.set_multi = (conn, vs, fs, conn_leaves, min_leaves) => {
        var new_vs = []
        
        var v = vs[0]
        if (v && !v.vid) {
            vs.shift()
            if (!Object.keys(self.time_dag).length) {
                new_vs.push(v)
                self.mergeable.add_version(v.vid, v.parents, v.changes)
            }
        }
        
        var vs_T = {}
        vs.forEach(v => vs_T[v.vid] = v.parents)
        vs.forEach(v => {
            if (self.time_dag[v.vid]) {
                function f(v) {
                    if (vs_T[v]) {
                        Object.keys(vs_T[v]).forEach(f)
                        delete vs_T[v]
                    }
                }
                f(v.vid)
            }
        })
        vs.forEach(v => {
            if (vs_T[v.vid]) {
                new_vs.push(v)
                // sync9_add_version(self.s9, v.vid, v.parents, v.changes)
                self.mergeable.add_version(v.vid, v.parents, v.changes)
            }
        })
        
        var new_fs = []
        var gen_fs = []
        fs.forEach(f => {
            var key = f.a + ':' + f.b + ':' + f.conn
            if (!self.fissures[key]) {
                new_fs.push(f)
                self.fissures[key] = f
                if (f.b == self.pid) gen_fs.push({
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
        var our_conn_nodes = sync9.get_ancestors(self, self.conn_leaves)
        var new_conn_nodes = sync9.get_ancestors(self, conn_leaves)
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
            var min = vs.filter(v => !vs_T[v.vid])
            min.forEach(v => min_leaves[v.vid] = true)
            min.forEach(v => {
                Object.keys(v.parents).forEach(p => {
                    delete min_leaves[p]
                })
            })
        }
        var min_nodes = sync9.get_ancestors(self, min_leaves)
        var ack_nodes = sync9.get_ancestors(self, self.ack_leaves)
        Object.keys(self.ack_leaves).forEach(x => {
            if (!min_nodes[x]) {
                delete self.ack_leaves[x]
            }
        })
        Object.keys(min_leaves).forEach(x => {
            if (ack_nodes[x]) self.ack_leaves[x] = true
        })
        
        self.phase_one = {}
        
        if (new_vs.length > 0 || new_fs.length > 0) {
            Object.values(self.conns).forEach(c => {
                if (c.id != conn.id) conn_funcs.set_multi(c, new_vs, new_fs, conn_leaves, min_leaves)
            })
        }
        gen_fs.forEach(f => self.fissure(null, f))
    }
    
    self.ack = (conn, vid, joiner_num) => {
        if (self.phase_one[vid] && (joiner_num == self.joiners[vid])) {
            self.phase_one[vid].count--
            check_ack_count(vid)
        }
    }
    
    self.full_ack = (conn, vid) => {
        if (!self.time_dag[vid]) return
        
        var ancs = sync9.get_ancestors(self, self.conn_leaves)
        if (ancs[vid]) return
        
        var ancs = sync9.get_ancestors(self, self.ack_leaves)
        if (ancs[vid]) return
        
        add_full_ack_leaf(vid)
        get_symmetric_conns().forEach(c => {
            if (c.id != conn.id) conn_funcs.full_ack(c, vid)
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
                get_symmetric_conns().forEach(c => {
                    conn_funcs.full_ack(c, vid)
                })
            }
        }
    }
    
    self.fissure = (conn, fissure) => {
        if (!fissure) {
            if (!self.conns[conn.id]) return
            if (conn.pid) {
                var nodes = {}
                var ack_nodes = sync9.get_ancestors(self, self.ack_leaves)
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
                    b: conn.pid,
                    conn: conn.id,
                    nodes,
                    parents
                }
            }
            delete self.conns[conn.id]
        }
    
        var key = fissure.a + ':' + fissure.b + ':' + fissure.conn
        if (!self.fissures[key]) {
            self.fissures[key] = fissure
            
            self.phase_one = {}
            
            get_symmetric_conns().forEach(c => {
                if (!conn || (c.id != conn.id)) conn_funcs.fissure(c, fissure)
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
        
        var acked = sync9.get_ancestors(self, self.ack_leaves)
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
        var acked = sync9.get_ancestors(self, self.ack_leaves)
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
        self.mergeable.prune2(q, q)

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


sync9 = require('./merge-algorithms/sync9.js')
console.log('sync9 is', sync9)

main()
