
require('../greg/random001.js')
require('../merge-algorithms/sync9.js')

var tau = Math.PI*2

function main() {
    var rand = create_rand('000_hi_003')

    var n_peers = 4
    
    var debug_frames = []

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
            } else if (i == 1) {
                peer.letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
            } else peer.letters = ''
            for (var ii = 0; ii < 100; ii++) {
                peer.letters += String.fromCharCode(12032 + 1000*i + ii)
            }
            peer.letters_i = 0
        })()
    }
    var peers_array = Object.values(peers)

    // New code for connecting peers
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
        if (debug_frames) debug_frames.push({
            peers: peers_array.map(x => save_node_copy(x))
        })
    }
    
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

                    var e = create_random_edit(peer.resources['my_key'], peer.letters[peer.letters_i++])

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
        
        debug_frames.push({
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
    
    function draw_frame(di, percent) {
        if (di == null) di = debug_frames.length - 1
        var d = debug_frames[di]
        
        g.clearRect(0, 0, c.width, c.height)
        
        draw_network(c, g, debug_frames, di, percent, 0, 0, 800, 800, 300)
        peers_array.forEach((p, i) => {
            p = d.peers[i]
            var x = 800
            var y = 20 + 450*i
            var r = 10

            if (p.resources.my_key) {
                draw_fissure_dag(c, g, debug_frames, di, i, x, y, 100, 300, r)
                
                draw_time_dag(c, g, debug_frames, di, i, x + 100, y, 300, 300, r)

                var v = p.resources.my_key.space_dag
                var S = null

                if (v && v.t == 'val') v = space_dag_get(v.S, 0)
                if (v && v.t == 'lit') v = v.S
                if (typeof(v) == 'string') S = create_space_dag_node(null, v)
                if (v && v.t == 'str') S = v.S
                if (S) draw_space_dag(p, g, S, x + 400, y)
            }
        })
        
        draw_text(c, g, 'f# = ' + d.frame_num + ' + ' + percent, 0, 0, 'grey', 'left', 'top')
        
        
        // top_part.innerHTML = ''
        // top_part.style.display = 'grid'
        // top_part.style['grid-template-columns'] = '1fr 1fr 1fr'
        // peers_array.forEach((p, i) => {
        //     p = d.peers[i]
        //     var dd = document.createElement('textarea')
        //     dd.value = '= ' + (p.keys.my_key ? JSON.stringify(sync9_read(p.keys.my_key.s9)) : 'n/a') + '\n\n' + JSON.stringify(p, null, '    ')
        //     top_part.append(dd)
        // })        
    }
    
    var a = document.createElement('div')
    a.style.display = 'grid'
    a.style['grid-template-rows'] = '1fr 20px'
    a.style.width = '100%'
    a.style.height = '100%'
    document.body.append(a)
    
    var c = document.createElement('canvas')
    c.width = 1000 * devicePixelRatio
    c.height = (window.innerHeight - 20) * devicePixelRatio
    c.style.width = (c.width / devicePixelRatio) + 'px'
    c.style.height = (c.height / devicePixelRatio) + 'px'
    var g = c.getContext('2d')
    a.append(c)
    
    // var top_part = document.createElement('div')
    // a.append(top_part)
    
    var slider = document.createElement('input')
    slider.style.width = '50%'
    slider.setAttribute('type', 'range')
    slider.setAttribute('min', '0')
    slider.setAttribute('max', debug_frames.length - 1)
    slider.setAttribute('value', debug_frames.length - 1)
    slider.oninput = () => {
        is_on = false
        draw_frame(1*slider.value, 0)
    }
    a.append(slider)
    
    var loop_count = 0
    var loop_inbetween_count = 0
    
    var is_on = true
    loop()
    function loop() {
        if (is_on) {
            if (loop_inbetween_count == 0) {
                try {
                    step(loop_count)
                } catch (e) {
                    console.log('e:', e)
                    console.log('error on loop_count = ' + loop_count)
                    throw 'stop'
                }
                loop_count++
            }
            if (debug_frames.length > 1) {
                draw_frame(debug_frames.length - 2, loop_inbetween_count / 10)
            }
            if (debug_frames.length > 300) debug_frames = debug_frames.slice(100)
            
            slider.setAttribute('max', debug_frames.length - 2)
            slider.value = debug_frames.length - 2
            
            loop_inbetween_count = (loop_inbetween_count + 1) % 1
        }
        setTimeout(loop, 30)
    }
    
    c.addEventListener('mousedown', () => {
        is_on = !is_on
    })
}

function draw_text(c, g, text, x, y, color, x_align, y_align, font) {
    g.font = font || '15px Arial'
    if (color) g.fillStyle = color
    g.textAlign = x_align || 'left'
    g.textBaseline = y_align || 'middle'
    g.fillText(text, x, y)
}

function draw_network(c, g, frames, fi, percent, x, y, w, h, r) {
    var peers = frames[fi].peers
    
    g.beginPath()
    g.lineWidth = 0.5
    g.strokeStyle = 'red'
    g.rect(x, y, w, h)
    g.stroke()
    g.beginPath()
    g.arc(x + w/2, y + h/2, r, 0, tau)
    g.stroke()
    
    var plank = w/30
    
    for (var i = 0; i < peers.length; i++) {
        for (var ii = i + 1; ii < peers.length; ii++) {
            var a = tau / peers.length * i
            var aa = tau / peers.length * ii
            
            var p = peers[i]
            var other_p = peers[ii]

            var connected = Object.keys(p.connected_to).some(pid => pid == other_p.pid) || Object.keys(other_p.connected_to).some(pid => pid == p.pid)

            if (connected) {
                g.beginPath()
                g.strokeStyle = 'darkgrey'
                g.lineWidth = w/30
                g.moveTo(x + w/2 + Math.cos(a)*r, y + h/2 + Math.sin(a)*r)
                g.lineTo(x + w/2 + Math.cos(aa)*r, y + h/2 + Math.sin(aa)*r)
                g.stroke()
            }
            
            function func(i, ii, m, a, aa) {
                if (m[0] != peers[ii].pid) return
                
                var before_frame = fi
                while ((before_frame >= 0) && frames[before_frame].peers[i].incoming.some(mm => mm[2] == m[2])) before_frame--
                
                var after_frame = fi
                while ((after_frame < frames.length) && frames[after_frame].peers[i].incoming.some(mm => mm[2] == m[2])) after_frame++

                var p1 = [x + w/2 + Math.cos(a)*r, y + h/2 + Math.sin(a)*r]
                var p2 = [x + w/2 + Math.cos(aa)*r, y + h/2 + Math.sin(aa)*r]
                
                var f = lerp(before_frame, 0, after_frame, 1, fi + percent)
                var pos = lerp(0, p1, 1, p2, f)
                
                if (m[3] == 'hello') {
                    g.save()
                    g.translate(pos[0], pos[1])
                    g.rotate(Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) + tau/4)
                    draw_text(c, g, 'H', 0, 0, 'white', 'center', 'middle')
                    g.restore()

                    g.beginPath()
                    var rot_by = tau/2 - (23.5 * tau/360)
                    var forward = norm(sub(p2, pos))
                    var t0 = add(pos, mul(forward, w/30*8/10))
                    var len = (w/30 / 2) / Math.sin(23.5 * tau/360)
                    var t1 = add(t0, mul(rot(forward, rot_by), len))
                    var t2 = add(t0, mul(rot(forward, -rot_by), len))
                    g.moveTo(t1[0], t1[1])
                    g.lineTo(t0[0], t0[1])
                    g.lineTo(t2[0], t2[1])
                    g.lineWidth = 1
                    g.strokeStyle = 'white'
                    g.stroke()
                    
                    g.beginPath()
                    var rot_by = tau/8
                    var t0 = add(pos, mul(forward, -w/30 * 0.45))
                    var len = (w/30 / 2) / Math.sin(tau/8)
                    var t1 = add(t0, mul(rot(forward, rot_by), len))
                    var t2 = add(t0, mul(rot(forward, -rot_by), len))
                    g.moveTo(t1[0], t1[1])
                    g.lineTo(t0[0], t0[1])
                    g.lineTo(t2[0], t2[1])
                    g.lineWidth = 2
                    g.strokeStyle = 'white'
                    g.stroke()                    
                } else if (m[3] == 'get') {
                    g.save()
                    g.translate(pos[0], pos[1])
                    g.rotate(Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) + tau/4)
                    draw_text(c, g, 'G', 0, 0, 'white', 'center', 'middle')
                    g.restore()

                    g.beginPath()
                    var rot_by = tau/2 - (23.5 * tau/360)
                    var forward = norm(sub(p2, pos))
                    var t0 = add(pos, mul(forward, w/30*8/10))
                    var len = (w/30 / 2) / Math.sin(23.5 * tau/360)
                    var t1 = add(t0, mul(rot(forward, rot_by), len))
                    var t2 = add(t0, mul(rot(forward, -rot_by), len))
                    g.moveTo(t1[0], t1[1])
                    g.lineTo(t0[0], t0[1])
                    g.lineTo(t2[0], t2[1])
                    g.lineWidth = 1
                    g.strokeStyle = 'white'
                    g.stroke()
                    
                    g.beginPath()
                    var rot_by = tau/8
                    var t0 = add(pos, mul(forward, -w/30 * 0.45))
                    var len = (w/30 / 2) / Math.sin(tau/8)
                    var t1 = add(t0, mul(rot(forward, rot_by), len))
                    var t2 = add(t0, mul(rot(forward, -rot_by), len))
                    g.moveTo(t1[0], t1[1])
                    g.lineTo(t0[0], t0[1])
                    g.lineTo(t2[0], t2[1])
                    g.lineWidth = 2
                    g.strokeStyle = 'white'
                    g.stroke()
                } else if (m[3] == 'welcome') {
                    var rr = plank*0.5
                    for (var a = 0; a < 5; a++) {
                        g.beginPath()
                        g.arc(pos[0] + Math.cos(tau/5*a)*rr, pos[1] + Math.sin(tau/5*a)*rr, plank * 0.35, 0, tau)
                        g.fillStyle = m[4].unack_boundary ? 'lightblue' : 'white'
                        g.fill()
                        
                        g.beginPath()
                        g.arc(pos[0] + Math.cos(tau/5*a)*rr, pos[1] + Math.sin(tau/5*a)*rr, plank * 0.35, 0, tau)
                        g.lineWidth = 1
                        g.strokeStyle = 'blue'
                        g.stroke()
                    }
                } else if (m[3] == 'set') {
                    g.beginPath()
                    g.arc(pos[0], pos[1], plank * 0.7, 0, tau)
                    g.fillStyle = 'white'
                    g.fill()
                    
                    var my_text = m[4].version
                    draw_text(c, g, my_text, pos[0], pos[1], 'blue', 'center', 'middle')
                    
                    g.beginPath()
                    g.arc(pos[0], pos[1], plank * 0.7, 0, tau)
                    g.lineWidth = 1
                    g.strokeStyle = 'blue'
                    g.stroke()
                } else if (m[3] == 'ack') {
                    g.beginPath()
                    g.arc(pos[0], pos[1], plank * 0.7, 0, tau)
                    g.fillStyle = (m[4].seen == 'local') ? 'lightblue' : 'blue'
                    g.fill()
                    
                    
                    var my_text = m[4].version
                    draw_text(c, g, my_text, pos[0], pos[1], (m[4][2] == 'local') ? 'blue' : 'white', 'center', 'middle')
                    
                    g.beginPath()
                    g.arc(pos[0], pos[1], plank * 0.7, 0, tau)
                    g.lineWidth = 1
                    g.strokeStyle = 'blue'
                    g.stroke()
                } else if (m[3] == 'fissure') {
                    var fis = m[4].fissure
                    
                    var rand = create_rand(fis.conn)
                    var color = '#' + rand().toString(16).slice(2, 8)
                    var rr = 10 * (1 + rand())
                    
                    
                    
                    
                    g.beginPath()
                    g.arc(pos[0], pos[1], plank * 0.7, 0, tau)
                    g.fillStyle = 'black'
                    g.fill()
                    
                    g.beginPath()
                    if (fis.a < fis.b) {
                        g.arc(pos[0], pos[1], rr, tau/4, tau*3/4)
                    } else {
                        g.arc(pos[0], pos[1], rr, tau*3/4, tau/4)
                    }
                    g.strokeStyle = color
                    g.lineWidth = 2
                    g.stroke()
                    
                    
                    
                } else {
                    throw 'unknown message type: ' + m[3]
                }
            }
            
            peers[i].incoming.forEach(m => func(i, ii, m, aa, a))
            peers[ii].incoming.forEach(m => func(ii, i, m, a, aa))
        }
    }
    
    peers.forEach((p, i) => {
        var a = tau / peers.length * i
        g.beginPath()
        g.fillStyle = p.incoming.length > 0 ? 'blue' : 'green'
        var pos = [
            x + w/2 + Math.cos(a)*r,
            y + h/2 + Math.sin(a)*r
        ]
        g.arc(pos[0], pos[1], w/30, 0, tau)
        g.fill()
    })
}

function draw_fissure_dag(c, g, frames, fi, pi, x, y, w, h, r) {
    var peers = frames[fi].peers
    var peer = peers[pi].resources.my_key
    if (!peer) return
    
    var fs = {}
    Object.values(peer.fissures).forEach(f => {
        var ff = fs[f.conn]
        if (!ff) {
            var rand = create_rand(f.conn)
            ff = fs[f.conn] = {
                id: f.conn,
                color: '#' + rand().toString(16).slice(2, 8),
                radius: r * (1 + rand()),
                parents: {}
            }
        }
        if (f.a < f.b) ff.has_side_a = true
        if (f.b < f.a) ff.has_side_b = true
        
        Object.keys(f.parents).forEach(p => {
            
            // work here
            if (!peer.fissures[p]) {
                //debugger
                
                ff.has_issue = true
                
                return
            }
            
            ff.parents[peer.fissures[p].conn] = true
        })
    })
    
    function get_layer(k) {
        if (fs[k].layer) return fs[k].layer
        return fs[k].layer = Object.keys(fs[k].parents).reduce((x, p) => {
            return Math.max(x, get_layer(p) + 1)
        }, 0)
    }
    Object.keys(fs).forEach(get_layer)
    
    var layer_members = {}
    var num_layers = 0
    Object.values(fs).forEach(f => {
        layer_members[f.layer] = layer_members[f.layer] || []
        layer_members[f.layer].push(f.id)
        
        if (f.layer >= num_layers) num_layers = f.layer + 1
    })
    
    Object.values(layer_members).forEach(layer => {
        layer.sort().forEach((k, i) => {
            fs[k].layer_i = i
        })
    })

    function get_node_pos(f) {
        var layer_count = layer_members[f.layer].length
        return [
            lerp(0, x + r, layer_count, x + w - r, f.layer_i + 0.5),
            y + r + (f.layer * r*4)
        ]
    }

    Object.values(fs).forEach(f => {
        var a = get_node_pos(f)
        g.beginPath()
        Object.keys(f.parents).map(x => fs[x]).forEach(p => {
            var b = get_node_pos(p)
            g.moveTo(a[0], a[1])
            g.lineTo(b[0], b[1])
        })
        g.lineWidth = 3
        g.strokeStyle = 'lightblue'
        g.stroke()
    })
    
    Object.values(fs).forEach(f => {
        var node_pos = get_node_pos(f)
        
        var rand = create_rand(f.id)
        var color = '#' + rand().toString(16).slice(2, 8)
        var rr = r * (1 + rand())
        
        g.beginPath()
        g.arc(node_pos[0], node_pos[1], rr, 0, tau)
        g.fillStyle = f.has_issue ? 'red' : 'white'
        g.fill()
        
        g.beginPath()
        if (f.has_side_a) {
            g.arc(node_pos[0], node_pos[1], rr, tau/4, tau*3/4)
        }
        if (f.has_side_b) {
            g.arc(node_pos[0], node_pos[1], rr, tau*3/4, tau/4)
        }
        g.strokeStyle = color
        g.lineWidth = 2
        g.stroke()
    })
}

function draw_time_dag(c, g, frames, fi, pi, x, y, w, h, r) {
    var peers = frames[fi].peers
    var resource = peers[pi].resources.my_key
    if (!resource) return
    var s9 = resource.mergeable
    
    g.lineWidth = 3
    
    var vs = {}
    function get_layer(v) {
        if (!vs[v]) vs[v] = {vid: v}
        if (vs[v].layer) return vs[v].layer
        return vs[v].layer = Object.keys(resource.time_dag[v]).reduce((x, p) => {
            return Math.max(x, get_layer(p) + 1)
        }, 0)
    }
    Object.keys(resource.time_dag).forEach(get_layer)
    
    var layer_members = {}
    var num_layers = 0
    Object.values(vs).forEach(v => {
        layer_members[v.layer] = layer_members[v.layer] || []
        layer_members[v.layer].push(v.vid)
        
        if (v.layer >= num_layers) num_layers = v.layer + 1
    })
    
    Object.values(layer_members).forEach(layer => {
        layer.sort().forEach((v, i) => {
            vs[v].layer_i = i
        })
    })

    function get_node_pos(v) {
        var layer_count = layer_members[v.layer].length
        return [
            lerp(0, x + r, layer_count + 1, x + w - r, v.layer_i + 1),
            y + r + (v.layer * r*3)
        ]
    }

    Object.entries(vs).forEach(e => {
        var a_pos = get_node_pos(e[1])
        g.beginPath()
        Object.keys(resource.time_dag[e[0]]).forEach(p => {
            g.moveTo(a_pos[0], a_pos[1])
            
            var b_pos = get_node_pos(vs[p])
            g.lineTo(b_pos[0], b_pos[1])
        })
        g.strokeStyle = 'lightblue'
        g.stroke()
    })
    
    var fully_acked = {}
    function mark_fully_acked_rec(v) {
        if (!fully_acked[v]) {
            fully_acked[v] = true
            Object.keys(resource.time_dag[v]).forEach(mark_fully_acked_rec)
        }
    }
    Object.keys(resource.acked_boundary).forEach(mark_fully_acked_rec)
    
    Object.entries(vs).forEach(e => {
        var node_pos = get_node_pos(e[1])
        
        g.beginPath()
        g.arc(node_pos[0], node_pos[1], r, 0, tau)
        g.fillStyle = 'white'
        g.fill()
        
        if (resource.acks_in_process[e[0]]) {
            var current_count = Math.max(0, resource.acks_in_process[e[0]].count)
            var max_count = 0
            var search_i = fi
            try {
                let x = null
                while (x = frames[search_i].peers[pi].resources.my_key.acks_in_process[e[0]]) {
                    max_count = x.count
                    search_i--
                }
            } catch (e) {}
            
            var percent_done = (max_count - current_count) / max_count
            if (percent_done > 0) {
                g.beginPath()
                g.arc(node_pos[0], node_pos[1], r, 0, tau/2, true)
                if (percent_done == 1) {
                    g.arc(node_pos[0], node_pos[1], r, tau/2, 0, true)
                } else if (percent_done < 0.5) {
                    var x = lerp(0, r, 0.5, 0, percent_done)
                    var C = (r*r - x*x) / (2*x)
                    var angle = Math.atan2(r, C)
                    g.arc(node_pos[0], node_pos[1] + C, C + x, tau*3/4 - angle, tau*3/4 + angle)
                } else if (percent_done > 0.5) {
                    var x = lerp(0.5, 0, 1, r, percent_done)
                    var C = (r*r - x*x) / (2*x)
                    var angle = Math.atan2(r, C)
                    g.arc(node_pos[0], node_pos[1] - C, C + x, tau/4 - angle, tau/4 + angle)
                } else {
                    g.arc(node_pos[0], node_pos[1] + C, C + x, 0, tau)
                }
                g.fillStyle = 'lightblue'
                g.fill()
            }
        }
        
        g.beginPath()
        g.arc(node_pos[0], node_pos[1], r, 0, tau)
        if (fully_acked[e[0]]) {
            g.fillStyle = 'blue'
            g.fill()
        } else {
            g.strokeStyle = 'blue'
            g.stroke()
        }
        
        draw_text(c, g, e[0].slice(0, 3), node_pos[0] + r, node_pos[1] + r, 'grey', 'left', 'top')
    })
    
    Object.keys(resource.unack_boundary).forEach(v => {
        g.beginPath()
        g.fillStyle = 'white'
        var node_pos = get_node_pos(vs[v])
        g.arc(node_pos[0], node_pos[1], r * 0.5, 0, Math.PI*2)
        g.fill()
    })
    
    Object.values(resource.fissures).forEach(f => {
        Object.keys(f.versions).forEach(v => {
            if (!resource.time_dag[v]) return
            g.beginPath()
            
            var rand = create_rand(f.conn)
            g.strokeStyle = '#' + rand().toString(16).slice(2, 8)
            
            var node_pos = get_node_pos(vs[v])
            //var rr = r * 1.45
            var rr = r * (1 + rand())
            
            g.lineWidth = 2
            if (f.a < f.b) {
                


                // work here
                g.arc(node_pos[0], node_pos[1], rr, tau/4, tau*3/4)
                
                
                
                // g.moveTo(node_pos[0] - rr, node_pos[1] - rr)
                // g.lineTo(node_pos[0] + rr, node_pos[1] - rr)
                // g.lineTo(node_pos[0] + rr, node_pos[1] + rr)
                // g.lineTo(node_pos[0] - rr, node_pos[1] + rr)
            } else {
                
                g.arc(node_pos[0], node_pos[1], rr, tau/4, tau*3/4, true)
                
                
                // var rrr = Math.sqrt(2) * rr
                // g.moveTo(node_pos[0] - rrr, node_pos[1])
                // g.lineTo(node_pos[0], node_pos[1] - rrr)
                // g.lineTo(node_pos[0] + rrr, node_pos[1])
                // g.lineTo(node_pos[0], node_pos[1] + rrr)
                // g.closePath()
            }
            g.stroke()
        })
    })
    
}

function draw_space_dag(c, g, S, x, y) {
    function helper(node, y, px, py) {
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(px, py)
        g.lineWidth = 1
        g.strokeStyle = 'lightblue'
        g.stroke()

        var begin_x
        var end_x
        
        draw_text(c, g, node.vid ? node.vid.slice(0, 3) : '', x, y + 25, 'grey', 'left', 'middle')
        
        var my_text = node.elems + (node.end_cap ? '*' : '')
        
        draw_text(c, g, my_text, x, y, Object.keys(node.deleted_by).length > 0 ? 'red' : 'blue', 'left', 'middle', '20px Arial')
        
        var width = g.measureText(my_text).width
        x += width

        var px = x
        x += 10
        for (var n of node.nexts) helper(n, y + 40, px, y)
        if (node.next) helper(node.next, y, px, y)
    }
    if (typeof(S) == 'string') helper(sync9_create_space_dag_node('lit', S))
    else helper(S, y, x, y)
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

function dict () { return Object.create({}) }

function assert() {
    if (!arguments[0]) {
        console.trace.apply(console, ['-Assert-', ...[...arguments].slice(1)])
        if (this.process)
            process.exit()
        else
            throw 'Bad'
    }
}

function lerp(t0, v0, t1, v1, t) {
    function inner_lerp(t0, v0, t1, v1, t) {
        return (t - t0) * (v1 - v0) / (t1 - t0) + v0
    }
    if (typeof(v0) == 'object') {
        return v0.map((x, i) => inner_lerp(t0, x, t1, v1[i], t))
    } else return inner_lerp(t0, v0, t1, v1, t)
}

function mul(a, s) {
    return a.map(a => a * s)
}

function rot(a, r) {
    return [
        a[0] * Math.cos(r) + a[1] * -Math.sin(r),
        a[0] * Math.sin(r) + a[1] * Math.cos(r)]
}

function sum(a) {
    return a.reduce((a, b) => a + b, 0)
}

function lenSq(a) {
    return sum(a.map(x => x*x))
}

function len(a) {
    return Math.sqrt(lenSq(a))
}

function norm(a) {
    return mul(a, 1 / len(a))
}

function add(a, b) {
    return a.map((a, i) => a + b[i])
}

function sub(a, b) {
    return a.map((a, i) => a - b[i])
}

main()
