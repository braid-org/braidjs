require('../merge-algos/sync9.js')
require('../util/utilities.js')

//show_debug = true

var n_peers = 3
var n_steps_per_trial = 100
var n_trials = 100
var rand = null
var random_seed_base = '000_hi_010bcdefg'
show_protocol_errors = true

solo_trial = null

if (!is_browser && process.argv.length >= 4 && process.argv[2] === 'solo') {
    solo_trial = parseInt(process.argv[3])
    // show_debug = true
    print_network = true
}


// show_debug = true
// print_network = true


var sim = {
    n_peers,
    n_steps_per_trial,
    n_trials,

    rand,
    step,
    add_peer,

    peers_dict: {},
    peers: []
}
sim.vis = is_browser
    ? require('../demos/visualization.js')(sim)
    : {add_frame() {}}

var vis = sim.vis

function add_peer (node, peer_number) {
    sim.peers.push(node)
    make_alphabet(node, peer_number)
    sim.peers_dict[node.pid] = node
}
function make_alphabet (node, peer_number) {
    var alphabets = [
        'abcdefghijklmnopqrstuvwxyz',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        '⬅︎⬇︎⬆︎',
        ''
    ]
    node.letters = alphabets[peer_number] || ''
    for (var i = 0; i < 26; i++)
        node.letters += String.fromCharCode(12032 + 1000*peer_number + i)
    node.letters_i = 0
    // console.log('Node', peer_number, 'letters:', node.letters)
}


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


var num_edits = 0
function step(frame_num) {
    // Randomly choose whether to do an action vs. process the network
    if (rand() < 0.1) {
        // Do an action
        if (rand() < 0.9) {
            // Edit text

            var i = Math.floor(rand() * n_peers)
            var peer = sim.peers[i]

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
            log('    editing', frame_num, peer.pid, e ? e.changes : '')
        } else {
            // Disconnect or reconnect
            log('    toggling network', frame_num)
            network.toggle_pipe()
        }
    } else {
        // Receive incoming network message
        if (network.receive_message) {
            log('    receiving message', frame_num)
            var i = Math.floor(rand() * n_peers)
            var peer = sim.peers[i]
            network.receive_message(peer)
        }
    }
    
    vis.add_frame({
        frame_num,
        peers: sim.peers.map(x => save_node_copy(x))
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

function setup_test () {
    sim.peers = []
    sim.peers_dict = {}

    network.setup()

    // Start sending get() messages over the pipes!
    sim.peers.forEach(node => node.get({
        key: 'my_key',
        subscribe: {keep_alive: true},
        origin: {id: 'fake' + rand().toString(36).slice(2,6)}
    }))


    // Create initial root version
    {
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
        let p = sim.peers[0]
        p.set({key: 'my_key', version: 'root', parents: {}, patches: ['=""']})
        vis.add_frame({
            peers: sim.peers.map(x => save_node_copy(x))
        })
    }
}

function evaluate_trial (trial_num) {
    log('Ok!! Now winding things up.')

    // Make sure the resource exists on each peer
    sim.peers.forEach((x, i) => {
        if (!x.resources.my_key) {
            console.log('missing my_key for ' + x.pid)
            total_success = false
            throw 'bad'
        }
    })
    
    // Do all peers have the same resulting value?
    var first_peer_val = sim.peers[0].resources.my_key.mergeable.read()
    var same_values = sim.peers.every(
        p => u.deep_equals(p.resources.my_key.mergeable.read(), first_peer_val)
    )

    // Are all time dags pruned down to a single version?
    var multiple_versions = sim.peers.some(
        p => Object.keys(p.resources.my_key.time_dag).length > 1
    )

    // Are all fissures cleaned up?
    var fissures_exist = sim.peers.some(
        p => Object.keys(p.resources.my_key.fissures).length > 0
    )

    // Where there any problems?
    total_success = same_values && !multiple_versions && !fissures_exist

    // If so, print them out
    if (show_debug || !total_success) {
        console.log('TOTAL', total_success ? 'SUCCESS' : 'FAILURE')
        sim.peers.forEach(
            n => console.log(n.pid+':', JSON.stringify(n.resources.my_key.mergeable.read()))
        )
        var results = {same_values, multiple_versions, fissures_exist}
        for (k in results)
            console.log(k+':', results[k])
        console.log('trial_num:', trial_num)
        if (!total_success) throw 'stop'
    }
}


// Synchronous version of the simulator
//  - Fast and deterministic.  For testing the core algorithm.
function run_trials () {
    if (solo_trial)
        run_trial(solo_trial)
    else
        for (var i=0; i < n_trials; i++) {
            console.log('Running trial', network.name, i)
            run_trial(i)
        }
}
function run_trial (trial_num) {
    rand = sim.rand = Math.create_rand(random_seed_base + ':' + trial_num)
    setup_test()

    // Now do all the stuff
    for (var t=0; t < n_steps_per_trial; t++) {
        log('looping', t)
        step(t)
    }
    network.wrapup()
    evaluate_trial(trial_num)
    if (network.die) network.die()
}

// Async version of the simulator
//  - For testing actual network activity
run_trials.async = (cb) => {
    if (solo_trial)
        run_trial.async(solo_trial, cb)
    else {
        var i = -1
        function next_trial () {
            i++
            console.log('Running trial', network.name, i)
            if (i === n_trials)
                setImmediate(cb)
            else
                setImmediate(() => run_trial.async(i, next_trial))
        }
        setTimeout(next_trial, 10)
    }
}
run_trial.async = (trial_num, cb) => {
    rand = sim.rand = Math.create_rand(random_seed_base + ':' + trial_num)
    setup_test()
    var t = -1
    function run_step () {
        t++
        if (t === n_steps_per_trial)
            network.wrapup(() => {
                evaluate_trial(trial_num)
                if (network.die)
                    network.die(() => setImmediate(cb))
                else
                    setImmediate(cb)
            })
        else {
            log('  step', t)
            step(t)
            setTimeout(run_step, 0)
        }
    }
    run_step()
}


var networks = [
    './virtual-p2p.js',
    './websocket-test.js'
]

var network
if (is_browser) {
    network = require('./virtual-p2p.js')(sim)
    setup_test()
    vis.loop()
} else
    networks.forEach( n => {
        network = require(n)(sim)
        console.log('Running', n.substr(2), 'trials!')
        if (network.sync)
            run_trials()
        else
            run_trials.async(() => {
                console.log('Done with all trials!')
                process.exit()
            })
    })
