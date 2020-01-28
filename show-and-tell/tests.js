require('../greg/random001.js')
require('../merge-algorithms/sync9.js')
require('../utilities.js')

var tau = Math.PI*2

var rand = Math.create_rand('000_hi_003')

var n_peers = 4
var n_steps_per_trial = 1000
var n_trials = 10

var peers = {}
var peers_array

var vis

function make_alphabet (node, letters) {
    node.letters = letters
    for (var ii = 0; ii < 100; ii++)
        node.letters += String.fromCharCode(12032 + 1000*i + ii)
    node.letters_i = 0
}

var faux_p2p_network = {
    setup () {
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
        peers_array = Object.values(peers)

        vis = is_browser
            ? require('./visualization.js')(peers_array, step)
            : {add_frame() {}}

        // Create pipes that connect peers
        this.sim_pipes = {}
        var create_sim_pipe = (from, to) => {
            var sim_pipes = this.sim_pipes
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
                    to.incoming.push([from.pid,
                                      () => {
                                          sim_pipes[to.pid + '-' + from.pid].recv(
                                              JSON.parse(JSON.stringify(args)))
                                      },
                                      'msg_id:' + rand().toString(36).slice(2),
                                      args.method, JSON.parse(JSON.stringify(args))])
                },

                // The connect function
                connect () { this.connected() }
            })

            from.bind('my_key', pipe)
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
    },
    wrapup (num_actions) {
        var sent_joiner = false

        // Connect all the pipes together
        for (var pipe in this.sim_pipes) {
            this.sim_pipes[pipe].connected()
            notes = ['connecting ' + this.sim_pipes[pipe]]
            vis.add_frame({
                t: -1,
                peers: peers_array.map(x => JSON.parse(JSON.stringify(x)))
            })
        }

        // Now let all the remaining incoming messages get processed
        do {
            for (var p in peers) {
                p = peers[p]
                while (p.incoming.length > 0) {
                    num_actions++
                    log('t => ' + num_actions)

                    notes = []

                    // Process the message.
                    p.incoming.shift()[1]()
                    // That might have added messages to another peer's queue.

                    vis.add_frame({
                        tt: num_actions,
                        peer_notes: {[p.pid]: notes},
                        peers: peers_array.map(x => JSON.parse(JSON.stringify(x)))
                    })
                }
            }

            var more_messages_exist = peers_array.some(p => p.incoming.length > 0)

            // Once everything's clear, make a joiner
            if (!more_messages_exist && !sent_joiner) {
                var i = Math.floor(rand() * n_peers)
                var p = peers_array[i]
                
                log('creating joiner')
                notes = ['creating joiner']

                // Create it!
                p.create_joiner('my_key')
                sent_joiner = true
                
                vis.add_frame({
                    tt: num_actions,
                    peer_notes: {[p.pid]: notes},
                    peers: peers_array.map(x => JSON.parse(JSON.stringify(x)))
                })

                // That'll make messages exist again
                more_messages_exist = true
            }
        } while (more_messages_exist)

        return num_actions
    },
    toggle_pipe () {
        var sim_pipe_keys = Object.keys(this.sim_pipes),
            random_index = Math.floor(rand() * sim_pipe_keys.length),
            random_pipe = this.sim_pipes[sim_pipe_keys[random_index]],
            [pid, other_pid] = sim_pipe_keys[random_index].split('-'),
            other_pipe = this.sim_pipes[other_pid + '-' + pid],
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
}


var network = faux_p2p_network
function main() {
    peers_array = Object.values(peers)

    network.setup()

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
        vis.add_frame({
            peers: peers_array.map(x => save_node_copy(x))
        })
    }
    
    var num_edits = 0
    function step(frame_num) {
        // Randomly choose whether to do an action vs. process the network
        if (rand() < 0.1) {
            // Do an action
            if (rand() < 0.9) {
                // Edit text

                var i = Math.floor(rand() * n_peers)
                var peer = peers_array[i]

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
                network.toggle_pipe()
            }
        } else {
            // Receive incoming network message

            var i = Math.floor(rand() * n_peers)
            var peer = peers_array[i]

            if (peer.incoming.length > 0) {
                var possible_peers = {}
                peer.incoming.forEach(x => possible_peers[x[0]] = true)
                possible_peers = Object.keys(possible_peers)
                var chosen_peer = possible_peers[Math.floor(rand() * possible_peers.length)]

                var msg = peer.incoming.splice(peer.incoming.findIndex(x => x[0] == chosen_peer), 1)[0][1]()
            }
        }
        
        vis.add_frame({
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
    
    vis = is_browser
        ? require('./visualization.js')(peers_array, step)
        : vis = {add_frame() {}}
    
    function wrapup_trial (trial_num) {
        log('Ok!! Now winding things up.')
        var num_actions = 0

        num_actions = network.wrapup(num_actions)
            
        // Make sure the resource exists on each peer
        peers_array.forEach((x, i) => {
            if (!x.resources.my_key) {
                console.log('missing my_key for ' + x.pid)
                total_success = false
                throw 'bad'
            }
        })
    
        // Do all peers have the same resulting value?
        var first_peer_val = peers_array[0].resources.my_key.mergeable.read()
        var same_values = peers_array.every(
            p => u.deep_equals(p.resources.my_key.mergeable.read(), first_peer_val)
        )

        // Are all time dags pruned down to a single version?
        var multiple_versions = peers_array.some(
            p => Object.keys(p.resources.my_key.time_dag).length > 1
        )

        // Are all fissures cleaned up?
        var fissures_exist = peers_array.some(
            p => Object.keys(p.resources.my_key.fissures).length > 0
        )

        total_success = same_values && !multiple_versions && !fissures_exist
        
        if (show_debug || !total_success) {
            console.log('TOTAL SUCCESS: ' + total_success)
            peers_array.forEach(
                p => console.log('val:', p.resources.my_key.mergeable.read())
            )
            var results = {same_values, multiple_versions, fissures_exist}
            for (k in results)
                console.log(k+':', results[k])
            console.log('trial_num:', trial_num)
            if (!show_debug) throw 'stop'
        }
    }

    function run_trial (trial_num) {
        for (var t=0; t<n_steps_per_trial; t++) {
            log('looping', t)
            step(t)
        }
        wrapup_trial(trial_num)
    }
    function run_trials () {
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
