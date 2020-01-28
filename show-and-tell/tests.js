require('../greg/random001.js')
require('../merge-algorithms/sync9.js')

is_browser = typeof process !== 'object' || typeof global !== 'object'

var tau = Math.PI*2

function main() {
    var rand = Math.create_rand('000_hi_003')

    var n_peers = 4
    var n_steps_per_trial = 1000
    var n_trials = 10

    var debug_frames = is_browser && []
    var show_debug = !is_browser
    var peers = {}

    var vis

    // Create the peers
    for (var i = 0; i < n_peers; i++) {
        // Make a peer node
        var node = require('../node.js')()

        node.pid = 'P' + (i + 1)   // Give it an ID
        node.incoming = []         // Give it an incoming message queue
        peers[node.pid] = node     // Add it to the list of peers

        // Give it an alphabet
        if (i == 0)
            node.letters = 'abcdefghijklmnopqrstuvwxyz'
        else if (i == 1)
            node.letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        else node.letters = ''
        for (var ii = 0; ii < 100; ii++)
            node.letters += String.fromCharCode(12032 + 1000*i + ii)
        node.letters_i = 0
    }
    var peers_array = Object.values(peers)


    // Create pipes that connect peers
    var sim_pipes = {}
    function create_sim_pipe (from, to) {
        var pipe = sim_pipes[from.pid + '-' + to.pid] = require('../pipe.js')({
            node: from,
            id: from.pid + '-' + to.pid,

            // The send function
            send (args) {
                if (!this.connection) {
                    console.log('sim-pipe.send: starting connection cause it was null')
                    this.connected()
                }
                // console.log('>> ', this.id, args)
                assert(from.pid !== to.pid)

                args = JSON.parse(JSON.stringify(args))
                to.incoming.push([from.pid, () => {
                    sim_pipes[to.pid + '-' + from.pid].recv(JSON.parse(JSON.stringify(args)))
                }, 'msg_id:' + rand().toString(36).slice(2), args.method, JSON.parse(JSON.stringify(args))])
            },

            // The connect function
            connect () { this.connected() }
        })

        from.bind('my_key', pipe)
        // from.bind('*', {id: u.random_id(),
        //                 send (args) {
        //                     if (args.method === 'get')
        //                         from.bind(args.key, pipe)
        //                     if (args.method === 'forget')
        //                         from.unbin(args.key, pipe)
        //                     console.log(from.pid, 'Wrapper pipe firing! Now bindings are',
        //                                 from.bindings(args.key).length)
        //                 }})
    }

    // Create pipes for all the peers
    for (var p1 = 0; p1 < n_peers; p1++)
        for (var p2 = p1 + 1; p2 < n_peers; p2++) {
            let peer1 = peers_array[p1],
                peer2 = peers_array[p2]
            // Pipe for A -> B
            create_sim_pipe(peer1, peer2)
            // Pipe for B -> A
            create_sim_pipe(peer2, peer1)
        }

    // Start sending get() messages over the pipes!
    peers_array.forEach(node => node.get({key: 'my_key',
                                          subscribe: {keep_alive: true},
                                          origin: {id: rand().toString(36).slice(2),
                                                   send: (args) => {},
                                                   connect: () => {}
                                                  }}))

    function save_node_copy(node) {
        var x = JSON.parse(JSON.stringify(node))
        x.connected_to = {}
        node.bindings('my_key').forEach(pipe => {
            var [from, to] = pipe.id.split('-')
            if (pipe.connecting || pipe.connection) {
                x.connected_to[to] = true
            }
        })
        return x
    }

    if (true) {
        // There are two modes of operations.  The differentiator is that in
        // one mode, you can prune down to a single version, and in the other,
        // you can only prune down to (in the worst case) the number of
        // versions there are peers that have ever been a part of the system.
        // (But often less than that.)

        // In the first mode, you must dictate that all peers don't add
        // anything unless they've already received a version from someone
        // else, and you then need a special peer that creates the first
        // version.

        // But you can add something to a field of nothing.  There used to be
        // a root node that was always there, but now you're allowed to have a
        // version with parents where the parents is the empty set, and all
        // the algorithms are fine with that.

        // So now when we create a new timedag, a special peer will create the
        // first version and send it to everyone else.  And that's what we do
        // in the tests code right now.  And we do that so that we can prune
        // down to one node, and that tells us that the tests are working, at
        // the end of the tests.  It knows that everything should have exactly
        // one version, that's the same thing, for all peers.

        let p = peers_array[0]
        p.set({key: 'my_key', version: 'root', parents: {}, patches: ['=""']})
        debug_frames && debug_frames.push({
            peers: peers_array.map(x => save_node_copy(x))
        })
    }
    
    var num_edits = 0
    function step(frame_num) {
        var i = Math.floor(rand() * n_peers)
        var peer = peers_array[i]

        // Randomly choose whether to do an action vs. process the network
        if (rand() < 0.1) {
            // Do an action
            if (rand() < 0.9) {
                // Edit text

                // ..but only if we have at least one version already, which
                // is really to make sure we've received "root" already (but
                // we can't check for "root" since it may get pruned away)
                if (peer.resources['my_key'] &&
                    Object.keys(peer.resources['my_key'].time_dag).length) {

                    if (peer.letters_i >= peer.letters.length)
                        peer.letters_i = 0

                    var e = create_random_edit(peer.resources['my_key'],
                                               peer.letters[peer.letters_i++])
                    num_edits++
                    peer.set({key: 'my_key',
                              patches: e.changes, version: e.version, parents: e.parents})
                }
            } else {
                // Disconnect or reconnect
                var sim_pipe_keys = Object.keys(sim_pipes),
                    random_index = Math.floor(rand() * sim_pipe_keys.length),
                    random_pipe = sim_pipes[sim_pipe_keys[random_index]],
                    [pid, other_pid] = sim_pipe_keys[random_index].split('-'),
                    other_pipe = sim_pipes[other_pid + '-' + pid],
                    other_peer = peers[other_pid]

                // Toggle the pipe!
                assert(!!random_pipe.connection === !!other_pipe.connection,
                       random_pipe.connection, other_pipe.connection)
                if (random_pipe.connection) {
                    random_pipe.disconnected()
                    other_pipe.disconnected()

                    peers[pid].incoming = peers[pid].incoming.filter(x => x[0] !== other_pid)
                    other_peer.incoming = other_peer.incoming.filter(x => x[0] !== pid)
                } else {
                    random_pipe.connected()
                    other_pipe.connected()
                }
            }
        } else {
            // Receive incoming network message

            if (peer.incoming.length > 0) {
                var possible_peers = {}
                peer.incoming.forEach(x => possible_peers[x[0]] = true)
                possible_peers = Object.keys(possible_peers)
                var chosen_peer = possible_peers[Math.floor(rand() * possible_peers.length)]

                var msg = peer.incoming.splice(peer.incoming.findIndex(x => x[0] == chosen_peer), 1)[0][1]()
            }
        }
        
        debug_frames && debug_frames.push({
            frame_num,
            peers: peers_array.map(x => save_node_copy(x))
        })
    }

    function create_random_edit(resource, letters) {
        letters = letters || 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
        var str = resource.mergeable.read()
        var start = Math.floor(rand() * (str.length + 1))
        var del = Math.floor(rand() * rand() * (str.length - start + 1))
        var ins = letters[Math.floor(rand() * letters.length)].repeat(Math.floor(rand() * 4) + (del == 0 ? 1 : 0))
        
        var version = rand().toString(36).slice(2)
        resource.next_version_id = (resource.next_version_id || 0) + 1
        var version = letters[0] + resource.next_version_id
        
        var changes = [`[${start}:${start + del}] = ` + JSON.stringify(ins)]
        
        return {
            version,
            parents : Object.assign({}, resource.current_version),
            changes
        }
    }
    
    if (is_browser)
        vis = require('./visualization.js')(debug_frames, peers_array, step)
    
    // var t
    
    function wrapup_trial (trial_num) {
        if (show_debug)
            console.log('Ok!! Now winding things up.')

        // After the trial, connect all the peers together
        for (var pipe in sim_pipes) {
            sim_pipes[pipe].connected()
            notes = ['connecting ' + sim_pipes[pipe]]
            debug_frames && debug_frames.push({
                t: -1,
                peers: peers_array.map(x => JSON.parse(JSON.stringify(x)))
            })
        }
        
        var num_actions = 0
        for (var i = 0; i < 50; i++) {

            // Now let all the remaining incoming messages get processed
            for (var p in peers) {
                p = peers[p]
                while (p.incoming.length > 0) {
                    num_actions++
                    if (show_debug) console.log('t => ' + num_actions)

                    notes = []

                    p.incoming.shift()[1]()
                    
                    if (debug_frames) debug_frames.push({
                        tt: num_actions,
                        peer_notes: {[p.pid]: notes},
                        peers: peers_array.map(x => JSON.parse(JSON.stringify(x)))
                    })
                }
            }
            
            // And what does this do?  Check to make sure that everything looks good?
            if (Object.values(peers).every(x => x.incoming.length == 0)) {
                num_actions++
                var too_many_fissures = false
                Object.values(peers).forEach((x, i) => {
                    if (x.resources['my_key']
                        && (Object.keys(x.resources['my_key'].fissures).length > 0))
                        too_many_fissures = true
                })
                
                var too_many_versions = false
                Object.values(peers).forEach((peer, i) => {
                    if (peer.resources['my_key']
                        && (Object.keys(peer.resources['my_key'].time_dag).length > 1)) {
                        too_many_versions = true
                        if (show_debug)
                            console.log('Multiple versions:',
                                        Object.keys(peer.resources['my_key'].time_dag),
                                        peer.resources.my_key.acks_in_process)
                    }
                })
                
                if (too_many_fissures || too_many_versions) {
                    var i = Math.floor(rand() * n_peers)
                    var p = peers_array[i]
                    
                    if (show_debug)
                        console.log('creating joiner')

                    notes = ['creating joiner']
                    p.create_joiner('my_key')
                    
                    if (debug_frames) debug_frames.push({
                        tt: num_actions,
                        peer_notes: {[p.pid]: notes},
                        peers: peers_array.map(x => JSON.parse(JSON.stringify(x)))
                    })
                } else
                    break
            }
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
            else if (!u.deep_equals(val, check_val))
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
        
        if (show_debug || !check_good)
            console.log('CHECK GOOD: ' + check_good)
        if (!check_good) {
            Object.values(peers).forEach((x, i) => {
                // console.log(x)
                var val = x.resources.my_key.mergeable.read()
                console.log('val: ' + JSON.stringify(val))
            })
            console.log('too_many_fissures: ' + too_many_fissures)
            console.log('too_many_versions: ' + too_many_versions)
            console.log('trial_num: ' + trial_num)
            if (!show_debug) throw 'stop'
        }
    }

    function run_trial (trial_num) {
        for (var t=0; t<n_steps_per_trial; t++) {
            show_debug && console.log('looping', t)
            step(t)
        }
        wrapup_trial(trial_num)
    }
    function run_trials () {
        show_debug = false
        for (var i=0; i<n_trials; i++) {
            console.log('Running trial', i)
            run_trial(i)
        }
    }

    if (is_browser)
        vis.loop()
    else
        run_trials()
}

main()
