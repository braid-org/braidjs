require('../greg/random001.js')
require('../greg/sjcl.min.js')

random_id = () => Math.random().toString(36).substr(2)

function main() {
    var num_trials = 300
    var trial_length = 500

    var special_i = -1

    var max_size = 0
    
    for (var i = (special_i >= 0) ? special_i : 0; i < num_trials; i++) {
        if ((special_i < 0) && (i % Math.floor(num_trials/20) == 0)) {
            console.log('TRIAL: ' + i + ` max_size:${max_size}`)
            max_size = 0
        }
        
        check_good = false
        try {
            var size = run_trial('iiiifIIiiiEiiiiiEEff:' + i, trial_length,
                                 special_i >= 0, i)
            if (size > max_size) max_size = size
        } catch (e) {
            console.log(e)
            console.log('TRIAL: ' + i + ' FAILED!')
            break
        }
        if (special_i >= 0) break
    }
    console.log(check_good ? 'Tests passed!' : 'Tests failed... :( :( :(')
}

function run_trial(seed, trial_length, show_debug, trial_num) {
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
            // Make a peer node
            var peer = require('../node.js')()

            peer.pid = 'P' + (i + 1) // Give it an ID
            peer.incoming = []       // Give it an incoming message queue
            peers[peer.pid] = peer   // Add it to the list of peers
            
            // Give it an alphabet
            if (i == 0) {
                peer.letters = 'abcdefghijklmnopqrstuvwxyz'
                for (var ii = 0; ii < 100; ii++) {
                    peer.letters += String.fromCharCode(12032 + ii)
                }
                peer.letters_i = 0
            } else if (i == 1) {
                peer.letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
                for (var ii = 0; ii < 100; ii++) {
                    peer.letters += String.fromCharCode(12032 + 1000 + ii)
                }
                peer.letters_i = 0
            } else {
                peer.letters = ''
                for (var ii = 0; ii < 100; ii++) {
                    peer.letters += String.fromCharCode(12032 + 2000 + ii)
                }
                peer.letters_i = 0
            }

            function direct_connect (i, j) {
                var receiver = peers[j]
                var conn = peer.connect2({
                    name: `peer ${i}->${j}`,
                    get: (key, initial, t)     => receiver.get(key, initial, t),
                    set: (key, patches, t, j)  => {
                        // console.log(`Setting ${i}->${j}`, key, patches)
                        receiver.set(key, patches, t, j)
                    },
                    forget: (key, t)           => receiver.forget(key, t),
                    ack: (key, seen, valid, t) => receiver.ack(key, seen, valid, t),
                    fissure: (name, versions)  => receiver.fissure(name, versions),
                    multiset: (key, versions, fissures,
                               unack_boundary, min_leaves, t) =>
                        receiver.multiset(key, versions, fissures,
                                           unack_boundary, min_leaves, t)
                })
            }
            for (var j = 0; j < n_peers; j++)
                direct_connect(i, j)

            // Define bindings to other peers for all braid methods
            ;[['get', 2], ['set', 2], ['multiset', 5], ['ack', 3], ['disconnected', 4]].forEach(x => {
                var [method, t_index] = x
                peer['on_' + method] = function () {
                    // Now we send a message over 
                    var args = [...arguments].map(
                        x => (x == null) ? null : JSON.parse(JSON.stringify(x)))
                    var t = args[t_index]

                    if ((method != 'get')
                        && !peer.resources.my_key.connections[t.conn.id])
                        throw 'you cannot talk to them!'

                    // Log SENDING network message to console
                    notes.push('SEND: ' + method + ' from:' + peer.pid
                               + ' to:' + t.conn.pid
                               + args.map(x => ' ' + JSON.stringify(x)))
                    if (show_debug) console.log(notes)

                    // Put the message on receiver's incoming queue
                    peers[t.conn.pid].incoming.push([peer.pid, () => {

                        // Log to console
                        notes.push('RECV: ' + method + ' from:' + peer.pid
                                   + ' to:' + t.conn.pid
                                   + args.map(x => ' ' + JSON.stringify(x)))
                        if (show_debug) console.log(notes)

                        // INVOKE message on the peer!
                        var to_pid = t.conn.pid
                        t.conn = {id: t.conn.id, pid: peer.pid}
                        peers[to_pid][method](...args)
                    }])
                }
            })

            // Add a connect() method, which kicks the whole thing off
            peer.connect = (pid) => {
                peer.on_get('my_key', true, {conn: {id: random_id(), pid}})
            }
        })()
    }
    var peers_array = Object.values(peers)
    
    // Connect all the peers together
    for (var p1 = 0; p1 < n_peers; p1++) {
        for (var p2 = p1 + 1; p2 < n_peers; p2++) {
            notes = ['connecting ' + p1 + ':' + peers_array[p1].pid
                     + ' and ' + p2 + ':' + peers_array[p2].pid]
            
            // Choose one to connect to the other
            if (Math.random() < 0.5)
                peers_array[p1].connect(peers_array[p2].pid)
            else
                peers_array[p2].connect(peers_array[p1].pid)
            
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
    
    // Run a trial
    for (var t = 0; t < trial_length; t++) {
        if (show_debug) console.log('t == ' + t)
        
        var i = Math.floor(rand() * n_peers)
        var peer = peers_array[i]
        
        notes = []
        
        // Randomly choose whether to do an action vs. process the network
        if (rand() < 0.1) {
            // Do an action
            if (rand() < 0.9) {
                // Edit text
                if (peer.resources['my_key'] && Object.keys(peer.resources['my_key'].time_dag).length) {
                    if (peer.letters_i >= peer.letters.length) {
                        peer.letters_i = 0
                    }
                    var e = create_random_edit(peer.resources['my_key'], peer.letters[peer.letters_i++])
                    peer.set('my_key', e.changes, {version: e.version, parents: e.parents})
                }
            } else {
                // Disconnect or reconnect
                
                // First, choose a random other peer to connect/disconnect with
                var other_peer = peer
                while (other_peer == peer)
                    other_peer = peers_array[Math.floor(rand() * n_peers)]

                var disconnect = false
                // See if they are connected to us
                Object.values(peer.resources.my_key ? peer.resources.my_key.connections : {}).forEach(s => {
                    if (s.pid == other_peer.pid) {
                        disconnect = true
                        // Disconnect, if so
                        peer.disconnected('my_key', null, null, null, {conn: s})
                    }
                })

                // Do the same for their connection to us
                Object.values(other_peer.resources.my_key ? other_peer.resources.my_key.connections : {} ).forEach(s => {
                    if (s.pid == peer.pid) {
                        disconnect = true
                        other_peer.disconnected('my_key', null, null, null, {conn: s})
                    }
                })

                // If we had a disconnection, let's clear out the queues
                if (disconnect) {
                    notes.push(' disconnect ' + peer.pid + ' and ' + other_peer.pid)
                    peer.incoming = peer.incoming.filter(x => x[0] != other_peer.pid)
                    other_peer.incoming = other_peer.incoming.filter(x => x[0] != peer.pid)

                }

                // Otherwise, let's connect these peers together
                else {
                    notes.push(' connect ' + peer.pid + ' and ' + other_peer.pid)
                    if (Math.random() < 0.5)
                        peer.connect(other_peer.pid)
                    else
                        other_peer.connect(peer.pid)
                }
            }
        } else {
            // Receive incoming network message

            if (show_debug) console.log('process incoming')
            var did_something = false
            if (peer.incoming.length > 0) {
                did_something = true
                
                var possible_peers = {}
                peer.incoming.forEach(x => possible_peers[x[0]] = true)
                possible_peers = Object.keys(possible_peers)
                var chosen_peer = possible_peers[Math.floor(Math.random() * possible_peers.length)]
                
                var msg = peer.incoming.splice(peer.incoming.findIndex(x => x[0] == chosen_peer), 1)[0][1]()
            }
            if (!did_something) {
                if (show_debug) console.log('did nothing')
            }
        }
        
        if (show_debug)
            console.log('peer: ' + peer.pid + ' -> ' + JSON.stringify(peer.resources.my_key && peer.resources['my_key'].mergeable.read()))

        if (debug_frames) debug_frames.push({
            t: t,
            peer_notes: {[peer.pid]: notes},
            peers: peers_array.map(x => JSON.parse(JSON.stringify(x)))
        })
    }

    // After the trial, connect all the peers together
    for (var p1 = 0; p1 < n_peers; p1++) {
        var p1_p = peers_array[p1]
        for (var p2 = p1 + 1; p2 < n_peers; p2++) {
            var p2_p = peers_array[p2]

            if (// If p1 is not connected to p2
                !Object.values(p1_p.resources['my_key']
                               ? p1_p.resources['my_key'].connections
                               : {}
                              ).some(x => x.pid == p2_p.pid)
                // And has no messages incoming from p2
                && !p1_p.incoming.some(x => x[0] == p2_p.pid)
                // And p2 is not connected to p1
                && !Object.values(p2_p.resources['my_key']
                                  ? p2_p.resources['my_key'].connections
                                  : {}
                                 ).some(x => x.pid == p1_p.pid)
                // And has no incoming messages from p1
                && !p2_p.incoming.some(x => x[0] == p1_p.pid)) {

                // Then let's connect them
                notes = ['connecting ' + p1 + ':' + p1_p.pid
                         + ' and ' + p2 + ':' + p2_p.pid]
                
                // Choose a random one to connect
                if (Math.random() < 0.5)
                    peers_array[p1].connect(p2_p.pid)
                else
                    peers_array[p2].connect(p1_p.pid)
                
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

        // Now let all the remaining incoming messages get processed
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
        
        // And what does this do?  Check to make sure that everything looks good?
        if (Object.values(peers).every(x => x.incoming.length == 0)) {
            tt++
            var too_many_fissures = false    
            Object.values(peers).forEach((x, i) => {
                if (x.resources['my_key']
                    && (Object.keys(x.resources['my_key'].fissures).length > 0))
                    too_many_fissures = true
            })
            
            var too_many_versions = false
            Object.values(peers).forEach((peer, i) => {
                if (peer.resources['my_key']
                    && (Object.keys(peer.resources['my_key'].time_dag).length > 1))
                    too_many_versions = true
            })
            
            if (too_many_fissures || too_many_versions) {
                var i = Math.floor(rand() * n_peers)
                var p = peers_array[i]
                
                notes = ['creating joiner']
                p.create_joiner('my_key')
                
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
        if (!x.resources.my_key) {
            console.log('missing my_key for ' + x.pid)
            check_good = false
            throw 'bad'
        }
    })
    
    var check_val = null
    check_good = true
    Object.values(peers).forEach((x, i) => {
        var val = x.resources.my_key.mergeable.read()
        if (i == 0)
            check_val = val
        else if (!deep_equals(val, check_val))
            check_good = false
    })

    var too_many_fissures = false    
    Object.values(peers).forEach((x, i) => {
        if (Object.keys(x.resources.my_key.fissures).length > 0) {
            check_good = false
            too_many_fissures = true
        }
    })
    
    var too_many_versions = false
    Object.values(peers).forEach((x, i) => {
        if (Object.keys(x.resources.my_key.time_dag).length > 2) {
            check_good = false
            too_many_versions = true
        }
    })
        
        
    //console.log('CHECK GOOD: ' + check_good)
    if (!check_good) {
        Object.values(peers).forEach((x, i) => {
            console.log(x)
            var val = x.resources.my_key.mergeable.read()
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
        
        var version = random_id()
        resource.next_version_id = (resource.next_version_id || 0) + 1
        var version = letters[0] + resource.next_version_id
        
        return {
            version,
            parents : Object.assign({}, resource.current_version),
            changes
        }
    }

    if (show_debug) {
        Object.values(peers).forEach(x => {
            console.log('peer: ' + JSON.stringify(x.resources.my_key.mergeable.read()))
        })
    }
    
    return JSON.stringify(peers_array[0].resources.my_key.mergeable.read()).length
}


main()
