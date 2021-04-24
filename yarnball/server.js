
// require('child_process').execSync('cp ./log-old.txt ./log.txt', {stdio: 'inherit'})
// require('child_process').execSync('rm ./log.txt', {stdio: 'inherit'})
// require('child_process').execSync('ls', {stdio: 'inherit'})
// throw 'stop'

var port = 60003

var looms = {}
var get_loom = key => looms[key] || (looms[key] = create_loom_server({id: 'server'}))

var spawns = {}

var logfile = './yarnball.txt'
var wal_stream = require('fs').createWriteStream(logfile, {flags: 'a'})
var wal_append = (key, msg) => wal_stream.write(JSON.stringify({key, msg}) + '\n')
// if (require('fs').existsSync(logfile)) {
//     let lines = ('' + require('fs').readFileSync(logfile)).match(/.+/g)

//     console.log({lines})

//     if (lines) {
//         looms = JSON.parse(lines.shift())
//         for (let L of Object.values(looms)) create_loom(L, () => {})

//         for (let line of lines) {
//             if (!line) continue
//             let x = JSON.parse(line)
//             let L = looms[x.key] || (looms[x.key] = create_loom({id: 'server'}, () => {}))

//             if (x.msg.cmd == 'disconnect') L.disconnect(x.msg.peer)
//             else L.receive(x.msg)
//         }
//         for (let L of Object.values(looms)) {
//             for (let peer of Object.keys(L.peers)) L.disconnect(peer)
//         }

//         for (let L of Object.values(looms)) create_loom_server(L)
//     }
// }

wal_compactor()
async function wal_compactor() {
    process.stdout.write(`<`)

    var filename = `./log_${Math.random().toString(36)}`
    await require('fs/promises').writeFile(filename, JSON.stringify(looms) + '\n')

    wal_stream.end()
    require('fs').renameSync(filename, logfile)

    wal_stream = require('fs').createWriteStream(logfile, {flags: 'a'})    

    process.stdout.write(`>`)

    setTimeout(wal_compactor, 1000 * 60)
}

var server = require('https').createServer({
    key: require('fs').readFileSync('./privkey.pem'),
    cert: require('fs').readFileSync('./fullchain.pem')
}, async function (req, res) {

    console.log({method: req.method, url: req.url})

    res.statusCode = 200
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.setHeader('Access-Control-Allow-Methods', '*')
    res.end('ok')
})

var wss = new (require('ws').Server)({server})
wss.on('connection', function connection(ws, req) {

    console.log(`new connection! ${req.url}`)

    var key = req.url.slice(1)
    get_loom(key).on_conn(ws, key)
})

server.listen(port)
console.log(`listening on port ${port}`)

function create_loom_server(L) {
    var conns = {}

    var L = create_loom(L, (to, x) => {

        console.log(JSON.stringify({sending: to, data: x}, null, '    '))

        conns[to].send(JSON.stringify(x))
    })

    L.on_conn = (ws, key) => {
        ws.on('message', x => {

            console.log(`RECV: ${x}`)

            x = JSON.parse(x)
            wal_append(key, x)
            if (x.cmd == 'get' && !L.peers[x.peer]) {
                ws.my_peer = x.peer
                ws.my_conn = x.conn
                conns[ws.my_peer] = ws
            }
            try {
                L.receive(x)
            } catch (e) {
                ws.send(JSON.stringify({cmd: 'error'}))
            }
        })
        ws.on('close', () => {
            if (ws.my_peer) {
                wal_append(key, {cmd: 'disconnect', peer: ws.my_peer})
                delete conns[ws.my_peer]
                L.disconnect(ws.my_peer)
            }
        })
    }

    return L
}

function create_loom(L, send) {
    L = L ?? {}

    if (!L.id) L.id = Math.random().toString(36).slice(2)
    if (!L.next_seq) L.next_seq = 0

    L.S = L.S ?? null
    L.T = L.T ?? {}
    L.current_version = L.current_version ?? {}

    L.peers = L.peers ?? {}
    L.version_cache = L.version_cache ?? {}
    L.fissures = L.fissures ?? {}
    L.acked_boundary = L.acked_boundary ?? {}
    L.unack_boundary = L.unack_boundary ?? {}
    L.acks_in_process = L.acks_in_process ?? {}

    var orig_send = send
    send = (to, msg) => {
        orig_send(to, {peer: L.id, conn: L.peers[to], ...msg})
    }

    L.get = peer => {
        send(peer, {cmd: 'get', conn: Math.random().toString(36).slice(2)})
    }

    L.forget = peer => {
        send(peer, {cmd: 'forget'})
    }

    L.disconnect = peer => {
        if (!L.peers[peer]) return
        var conn = L.peers[peer]
        delete L.peers[peer]

        var versions = {}
        var ack_versions = ancestors(L.acked_boundary)
        Object.keys(L.T).forEach(v => {
            if (!ack_versions[v] || L.acked_boundary[v]) versions[v] = true
        })

        L.receive({cmd: 'fissure', fissure: {a: L.id, b: peer, conn, versions, time: Date.now()}})
    }

    L.set = (...patches) => {
        L.receive({cmd: 'set', version: `${L.next_seq++}@${L.id}`, parents: {...L.current_version}, patches})
    }

    L.read = (is_anc) => {
        if (!is_anc) is_anc = () => true
        else if (typeof(is_anc) == 'string') {
            var ancs = x.ancestors({[is_anc]: true})
            is_anc = v => ancs[v]
        } else if (typeof(is_anc) == 'object') {
            var ancs = x.ancestors(is_anc)
            is_anc = v => ancs[v]
        }

        return rec_read(L.S)
        function rec_read(x) {
            if (x && typeof(x) == 'object') {
                if (x.t == 'lit') return JSON.parse(JSON.stringify(x.S))
                if (x.t == 'val') return rec_read(space_dag_get(x.S, 0, is_anc))
                if (x.t == 'obj') {
                    var o = {}
                    Object.entries(x.S).forEach(([k, v]) => {
                        var x = rec_read(v)
                        if (x != null) o[k] = x
                    })
                    return o
                }
                if (x.t == 'arr') {
                    var a = []
                    traverse_space_dag(x.S, is_anc, (node, _, __, ___, ____, deleted) => {
                        if (!deleted) node.elems.forEach((e) => a.push(rec_read(e)))
                    }, true)
                    return a
                }
                if (x.t == 'str') {
                    var s = []
                    traverse_space_dag(x.S, is_anc, (node, _, __, ___, ____, deleted) => {
                        if (!deleted) s.push(node.elems)
                    }, true)
                    return s.join('')
                }
                throw 'bad'
            } return x
        }
    }

    L.receive = ({cmd, version, parents, patches, fissure, versions, fissures, unack_boundary, min_leaves, peer, conn}) => {
        if (cmd == 'get' || cmd == 'get_back') {
            if (L.peers[peer]) throw 'bad'
            L.peers[peer] = conn

            if (cmd == 'get') send(peer, {cmd: 'get_back'})
            send(peer, {cmd: 'welcome',
                versions: generate_braid(parents),
                fissures: Object.values(L.fissures),
                parents: parents && Object.keys(parents).length ? get_leaves(ancestors(parents, true)) : {}
            })
        } else if (cmd == 'forget') {
            if (!L.peers[peer]) throw 'bad'
            delete L.peers[peer]
            L.acks_in_process = {}
        } else if (cmd == 'set') {
            for (p in parents) if (!L.T[p]) throw 'bad'

            if (!peer || !L.T[version]) {
                add_version(version, parents, patches)
                for (let p of Object.keys(L.peers)) if (p != peer) send(p, {cmd: 'set', version, parents, patches})

                L.acks_in_process[version] = {origin: peer, count: Object.keys(L.peers).length}
                if (peer) L.acks_in_process[version].count--
            } else if (L.acks_in_process[version]) L.acks_in_process[version].count--

            check_ack_count(version)
        } else if (cmd == 'ack1') {
            if (L.acks_in_process[version]) {
                L.acks_in_process[version].count--
                check_ack_count(version)
            }
        } else if (cmd == 'ack2') {
            if (!L.T[version]) return
            if (ancestors(L.unack_boundary)[version]) return
            if (ancestors(L.acked_boundary)[version]) return
            add_full_ack_leaf(version)
            for (let p of Object.keys(L.peers)) if (p != peer) send(p, {cmd: 'ack2', version})
        } else if (cmd == 'fissure') {
            var key = fissure.a + ':' + fissure.b + ':' + fissure.conn
            if (!L.fissures[key]) {
                L.fissures[key] = fissure
                L.acks_in_process = {}
                for (let p of Object.keys(L.peers)) if (p != peer) send(p, {cmd: 'fissure', fissure})
                if (fissure.b == L.id) L.receive({cmd: 'fissure', fissure: {...fissure, a: L.id, b: fissure.a}})
            }
        } else if (cmd == 'welcome') {
            var versions_to_add = {}
            versions.forEach(v => versions_to_add[v.version] = v.parents)
            versions.forEach(v => {
                if (L.T[v.version]) {
                    remove_ancestors(v.version)
                    function remove_ancestors(v) {
                        if (versions_to_add[v]) {
                            Object.keys(versions_to_add[v]).forEach(remove_ancestors)
                            delete versions_to_add[v]
                        }
                    }
                }
            })

            var send_error = () => send(peer, {cmd: 'error'})

            var added_versions = []
            for (var v of versions) {
                if (versions_to_add[v.version]) {
                    if (!Object.keys(v.parents).every(p => L.T[p])) return send_error()

                    add_version(v.version, v.parents, v.patches, v.sort_keys)
                    added_versions.push(v)
                }
            }

            if (((min_leaves && Object.keys(min_leaves).some(k => !L.T[k])) || (unack_boundary && Object.keys(unack_boundary).some(k => !L.T[k])))) return send_error()

            var new_fissures = []
            var gen_fissures = []
            fissures.forEach(f => {
                var key = f.a + ':' + f.b + ':' + f.conn
                if (!L.fissures[key]) {

                    new_fissures.push(f)
                    L.fissures[key] = f

                    if (f.b == L.id) gen_fissures.push({...f, a: L.id, b: f.a})
                }
            })

            if (!unack_boundary) unack_boundary = {...L.current_version}

            var our_conn_versions = ancestors(L.T, L.unack_boundary)
            var new_conn_versions = ancestors(L.T, unack_boundary)

            Object.keys(L.unack_boundary).forEach(x => {
                if (new_conn_versions[x] && !unack_boundary[x])
                    delete L.unack_boundary[x]
            })
            Object.keys(unack_boundary).forEach(x => {
                if (!our_conn_versions[x]) L.unack_boundary[x] = true
            })
            
            if (!min_leaves) {
                if (versions.length === 0 && (!parents || Object.keys(parents).length === 0))
                    min_leaves = {...L.current_version}
                else {
                    min_leaves = parents ? {...parents} : {}
                    versions.forEach(v => {
                        if (!versions_to_add[v.version]) min_leaves[v.version] = true
                    })
                    min_leaves = get_leaves(ancestors(min_leaves, true))
                }
            }

            var min_versions = ancestors(min_leaves)
            var ack_versions = ancestors(L.acked_boundary)
            Object.keys(L.acked_boundary).forEach(x => {
                if (!min_versions[x]) delete L.acked_boundary[x]
            })
            Object.keys(min_leaves).forEach(x => {
                if (ack_versions[x]) L.acked_boundary[x] = true
            })

            L.acks_in_process = {}

            if (added_versions.length > 0 || new_fissures.length > 0) {
                for (let p of Object.keys(L.peers)) if (p != peer) send(p, {cmd: 'welcome', key, versions: added_versions, unack_boundary,min_leaves, fissures: new_fissures})
            }

            gen_fissures.forEach(f => L.receive({cmd: 'fissure', fissure: f}))
        }
    }

    var is_lit = x => !x || typeof(x) != 'object' || x.t == 'lit'
    var get_lit = x => (x && typeof(x) == 'object' && x.t == 'lit') ? x.S : x
    let make_lit = x => (x && typeof(x) == 'object') ? {t: 'lit', S: x} : x

    function prune() {
        var unremovable = {}

        Object.entries(L.fissures).forEach(x => {
            var other_key = x[1].b + ':' + x[1].a + ':' + x[1].conn
            var other = L.fissures[other_key]
            if (other) {
                delete L.fissures[x[0]]
                delete L.fissures[other_key]
            }
        })

        if (L.fissure_lifetime != null) {
            var now = Date.now()
            Object.entries(L.fissures).forEach(([k, f]) => {
                if (f.time == null) f.time = now
                if (f.time <= now - L.fissure_lifetime) {
                    delete L.fissures[k]
                }
            })
        }

        var keep_us = {}

        Object.values(L.fissures).forEach(f => {
            Object.keys(f.versions).forEach(v => keep_us[v] = true)
        })

        var acked = ancestors(L.T, L.acked_boundary)
        Object.keys(L.T).forEach(x => {
            if (!acked[x] || L.acked_boundary[x]) keep_us[x] = true
        })

        var children = {}
        Object.entries(L.T).forEach(([v, parents]) => {
            Object.keys(parents).forEach(parent => {
                if (!children[parent]) children[parent] = {}
                children[parent][v] = true
            })
        })

        var to_bubble = {}
        var bubble_tops = {}
        var bubble_bottoms = {}
        
        function mark_bubble(bottom, top, tag) {
            if (!to_bubble[bottom]) {
                to_bubble[bottom] = tag
                if (bottom !== top) Object.keys(L.T[bottom]).forEach(p => mark_bubble(p, top, tag))
            }
        }
        
        var done = {}
        function f(cur) {
            if (!L.T[cur]) return
            if (done[cur]) return
            done[cur] = true
            
            if (!to_bubble[cur] || bubble_tops[cur]) {
                var bubble_top = find_one_bubble(cur)
                if (bubble_top) {
                    delete to_bubble[cur]
                    mark_bubble(cur, bubble_top, bubble_tops[cur] || cur)
                    bubble_tops[bubble_top] = bubble_tops[cur] || cur
                    bubble_bottoms[bubble_tops[cur] || cur] = bubble_top
                }
            }

            Object.keys(L.T[cur]).forEach(f)
        }
        Object.keys(L.current_version).forEach(f)

        function find_one_bubble(cur) {
            var seen = {[cur]: true}
            var q = Object.keys(L.T[cur])
            var expecting = Object.fromEntries(q.map(x => [x, true]))
            while (q.length) {
                cur = q.pop()
                if (!L.T[cur]) return null
                if (keep_us[cur]) return null
                if (Object.keys(children[cur]).every(c => seen[c])) {
                    seen[cur] = true
                    delete expecting[cur]
                    if (!Object.keys(expecting).length) return cur
                    
                    Object.keys(L.T[cur]).forEach(p => {
                        q.push(p)
                        expecting[p] = true
                    })
                }
            }
            return null
        }

        to_bubble = Object.fromEntries(Object.entries(to_bubble).map(
            ([v, bub]) => [v, [bub, bubble_bottoms[bub]]]
        ))

        apply_bubbles(to_bubble)
    }

    function add_full_ack_leaf(version) {
        var marks = {}
        function f(v) {
            if (!marks[v]) {
                marks[v] = true
                delete L.unack_boundary[v]
                delete L.acked_boundary[v]
                delete L.acks_in_process[v]
                Object.keys(L.T[v]).forEach(f)
            }
        }
        f(version)

        L.acked_boundary[version] = true
        prune(L)
    }

    function check_ack_count(version) {
        if (L.acks_in_process[version] && L.acks_in_process[version].count == 0) {
            if (L.acks_in_process[version].origin) {
                send(L.acks_in_process[version].origin, {cmd: 'ack1', version})
            } else {
                add_full_ack_leaf(version)
                for (let p of Object.keys(L.peers)) send(p, {cmd: 'ack2', version})
            }
        }
    }

    function generate_braid(versions) {
        var anc = versions && Object.keys(versions).length ? ancestors(versions, true) : {}
        var is_anc = x => anc[x]

        if (Object.keys(L.T).length === 0) return []

        return Object.entries(L.version_cache).filter(x => !is_anc(x[0])).map(([version, set_message]) => {
            return L.version_cache[version] = set_message || generate_set_message(version)
        })

        function generate_set_message(version) {
            if (!Object.keys(L.T[version]).length) {
                return {
                    version,
                    parents: {},
                    patches: [` = ${JSON.stringify(L.read(v => v == version))}`]
                }
            }
        
            var is_lit = x => !x || typeof(x) !== 'object' || x.t === 'lit'
            var get_lit = x => (x && typeof(x) === 'object' && x.t === 'lit') ? x.S : x
        
            var ancs = ancestors({[version]: true})
            delete ancs[version]
            var is_anc = x => ancs[x]
            var path = []
            var patches = []
            var sort_keys = {}
            recurse(L.S)
            function recurse(x) {
                if (is_lit(x)) {
                } else if (x.t === 'val') {
                    space_dag_generate_braid(x.S, version, is_anc).forEach(s => {
                        if (s[2].length) {
                            patches.push(`${path.join('')} = ${JSON.stringify(s[2][0])}`)
                            if (s[3]) sort_keys[patches.length - 1] = s[3]
                        }
                    })
                    traverse_space_dag(x.S, is_anc, node => {
                        node.elems.forEach(recurse)
                    })
                } else if (x.t === 'arr') {
                    space_dag_generate_braid(x.S, version, is_anc).forEach(s => {
                        patches.push(`${path.join('')}[${s[0]}:${s[0] + s[1]}] = ${JSON.stringify(s[2])}`)
                        if (s[3]) sort_keys[patches.length - 1] = s[3]
                    })
                    var i = 0
                    traverse_space_dag(x.S, is_anc, node => {
                        node.elems.forEach(e => {
                            path.push(`[${i++}]`)
                            recurse(e)
                            path.pop()
                        })
                    })
                } else if (x.t === 'obj') {
                    Object.entries(x.S).forEach(e => {
                        path.push('[' + JSON.stringify(e[0]) + ']')
                        recurse(e[1])
                        path.pop()
                    })
                } else if (x.t === 'str') {
                    space_dag_generate_braid(x.S, version, is_anc).forEach(s => {
                        patches.push(`${path.join('')}[${s[0]}:${s[0] + s[1]}] = ${JSON.stringify(s[2])}`)
                        if (s[3]) sort_keys[patches.length - 1] = s[3]
                    })
                }
            }
        
            return {
                version,
                parents: {...L.T[version]},
                patches,
                sort_keys
            }
        }
    }
    L.generate_braid = generate_braid

    function space_dag_generate_braid(S, version, is_anc) {
        var splices = []

        function add_ins(offset, ins, sort_key, end_cap) {
            if (typeof(ins) !== 'string')
                ins = ins.map(x => L.read(x, () => false))
            if (splices.length > 0) {
                var prev = splices[splices.length - 1]
                if (prev[0] + prev[1] === offset && !end_cap && (prev[4] === 'i' || (prev[4] === 'r' && prev[1] === 0))) {
                    prev[2] = prev[2].concat(ins)
                    return
                }
            }
            splices.push([offset, 0, ins, sort_key, end_cap ? 'r' : 'i'])
        }

        function add_del(offset, del, ins) {
            if (splices.length > 0) {
                var prev = splices[splices.length - 1]
                if (prev[0] + prev[1] === offset && prev[4] !== 'i') {
                    prev[1] += del
                    return
                }
            }
            splices.push([offset, del, ins, null, 'd'])
        }
        
        var offset = 0
        function helper(node, _version, end_cap) {
            if (_version === version) {
                add_ins(offset, node.elems.slice(0), node.sort_key, end_cap)
            } else if (node.deleted_by[version] && node.elems.length > 0) {
                add_del(offset, node.elems.length, node.elems.slice(0, 0))
            }
            
            if ((!_version || is_anc(_version)) && !Object.keys(node.deleted_by).some(is_anc)) {
                offset += node.elems.length
            }
            
            node.nexts.forEach(next => helper(next, next.version, node.end_cap))
            if (node.next) helper(node.next, _version)
        }
        helper(S, null)
        splices.forEach(s => {
            // if we have replaces with 0 deletes,
            // make them have at least 1 delete..
            // this can happen when there are multiple replaces of the same text,
            // and our code above will associate those deletes with only one of them
            if (s[4] === 'r' && s[1] === 0) s[1] = 1
        })
        return splices
    }

    function apply_bubbles(to_bubble) {
        function recurse(x) {
            if (is_lit(x)) return x
            if (x.t == 'val') {
                space_dag_apply_bubbles(x.S, to_bubble)
                traverse_space_dag(x.S, () => true, node => {
                    node.elems = node.elems.slice(0, 1).map(recurse)
                }, true)
                if (x.S.nexts.length == 0 && !x.S.next && x.S.elems.length == 1 && is_lit(x.S.elems[0])) return x.S.elems[0]
                return x
            }
            if (x.t == 'arr') {
                space_dag_apply_bubbles(x.S, to_bubble)
                traverse_space_dag(x.S, () => true, node => {
                    node.elems = node.elems.map(recurse)
                }, true)
                if (x.S.nexts.length == 0 && !x.S.next && x.S.elems.every(is_lit) && !Object.keys(x.S.deleted_by).length) return {t: 'lit', S: x.S.elems.map(get_lit)}
                return x
            }
            if (x.t == 'obj') {
                Object.entries(x.S).forEach(e => {
                    var y = x.S[e[0]] = recurse(e[1])
                    if (y == null) delete x.S[e[0]]
                })
                if (Object.values(x.S).every(is_lit)) {
                    var o = {}
                    Object.entries(x.S).forEach(e => o[e[0]] = get_lit(e[1]))
                    return {t: 'lit', S: o}
                }
                return x
            }
            if (x.t == 'str') {
                space_dag_apply_bubbles(x.S, to_bubble)
                if (x.S.nexts.length == 0 && !x.S.next && !Object.keys(x.S.deleted_by).length) return x.S.elems
                return x
            }
        }
        L.S = recurse(L.S)

        Object.entries(to_bubble).forEach(([version, bubble]) => {
            if (version === bubble[1])
                L.T[bubble[0]] = L.T[bubble[1]]
            if (version !== bubble[0]) {
                delete L.T[version]
                delete L.version_cache[version]
            } else L.version_cache[version] = null
        })

        var leaves = Object.keys(L.current_version)
        var acked_boundary = Object.keys(L.acked_boundary)
        var fiss = Object.keys(L.fissures)
        if (leaves.length == 1 && acked_boundary.length == 1
            && leaves[0] == acked_boundary[0] && fiss.length == 0) {
            L.T = { [leaves[0]]: {} }
            L.S = make_lit(L.read())
        }
    }

    function add_version(version, parents, patches, sort_keys, is_anc) {
        if (L.T[version]) return

        L.T[version] = {...parents}

        L.version_cache[version] = JSON.parse(JSON.stringify({
            version, parents, patches, sort_keys
        }))

        Object.keys(parents).forEach(k => {
            if (L.current_version[k])
                delete L.current_version[k]
        })
        L.current_version[version] = true
        
        if (!sort_keys) sort_keys = {}
        
        if (!Object.keys(parents).length) {
            var parse = parse_patch(patches[0])
            L.S = make_lit(parse.value)
            return
        }
        
        if (!is_anc) {
            if (parents == L.current_version) {
                is_anc = _version => _version != version
            } else {
                var ancs = ancestors(parents)
                is_anc = _version => ancs[_version]
            }
        }
        
        patches.forEach((patch, i) => {
            var sort_key = sort_keys[i]
            var parse = parse_patch(patch)
            var cur = resolve_path(parse)
            if (!parse.slice) {
                if (cur.t != 'val') throw 'bad'
                var len = space_dag_length(cur.S, is_anc)
                space_dag_add_version(cur.S, version, [[0, len, [parse.delete ? null : make_lit(parse.value)]]], sort_key, is_anc)
            } else {
                if (typeof parse.value === 'string' && cur.t !== 'str')
                    throw `Cannot splice string ${JSON.stringify(parse.value)} into non-string`
                if (parse.value instanceof Array && cur.t !== 'arr')
                    throw `Cannot splice array ${JSON.stringify(parse.value)} into non-array`
                if (parse.value instanceof Array)
                    parse.value = parse.value.map(x => make_lit(x))

                var r0 = parse.slice[0]
                var r1 = parse.slice[1]
                if (r0 < 0 || Object.is(r0, -0) || r1 < 0 || Object.is(r1, -0)) {
                    let len = space_dag_length(cur.S, is_anc)
                    if (r0 < 0 || Object.is(r0, -0)) r0 = len + r0
                    if (r1 < 0 || Object.is(r1, -0)) r1 = len + r1
                }

                space_dag_add_version(cur.S, version, [[r0, r1 - r0, parse.value]], sort_key, is_anc)
            }
        })

        function resolve_path(parse) {
            var cur = L.S
            if (!cur || typeof(cur) != 'object' || cur.t == 'lit')
                cur = L.S = {t: 'val', S: create_space_dag_node(null, [cur])}
            var prev_S = null
            var prev_i = 0
            for (var i=0; i<parse.path.length; i++) {
                var key = parse.path[i]
                if (cur.t == 'val') cur = space_dag_get(prev_S = cur.S, prev_i = 0, is_anc)
                if (cur.t == 'lit') {
                    var new_cur = {}
                    if (cur.S instanceof Array) {
                        new_cur.t = 'arr'
                        new_cur.S = create_space_dag_node(null, cur.S.map(x => make_lit(x)))
                    } else {
                        if (typeof(cur.S) != 'object') throw 'bad'
                        new_cur.t = 'obj'
                        new_cur.S = {}
                        Object.entries(cur.S).forEach(e => new_cur.S[e[0]] = make_lit(e[1]))
                    }
                    cur = new_cur
                    space_dag_set(prev_S, prev_i, cur, is_anc)
                }
                if (cur.t == 'obj') {
                    let x = cur.S[key]
                    if (!x || typeof(x) != 'object' || x.t == 'lit')
                        x = cur.S[key] = {t: 'val', S: create_space_dag_node(null, [x == null ? null : x])}
                    cur = x
                } else if (i == parse.path.length - 1 && !parse.slice) {
                    parse.slice = [key, key + 1]
                    parse.value = (cur.t == 'str') ? parse.value : [parse.value]
                } else if (cur.t == 'arr') {
                    cur = space_dag_get(prev_S = cur.S, prev_i = key, is_anc)
                } else throw 'bad'
            }
            if (parse.slice) {
                if (cur.t == 'val') cur = space_dag_get(prev_S = cur.S, prev_i = 0, is_anc)
                if (typeof(cur) == 'string') {
                    cur = {t: 'str', S: create_space_dag_node(null, cur)}
                    space_dag_set(prev_S, prev_i, cur, is_anc)
                } else if (cur.t == 'lit') {
                    if (!(cur.S instanceof Array)) throw 'bad'
                    cur = {t: 'arr', S: create_space_dag_node(null, cur.S.map(x => make_lit(x)))}
                    space_dag_set(prev_S, prev_i, cur, is_anc)
                }
            }
            return cur
        }
    }

    function ancestors(versions, ignore_nonexistent) {
        var result = {}
        function recurse(version) {
            if (result[version]) return
            if (!L.T[version]) {
                if (ignore_nonexistent) return
                throw `The version ${version} no existo`
            }
            result[version] = true
            Object.keys(L.T[version]).forEach(recurse)
        }
        Object.keys(versions).forEach(recurse)
        return result
    }

    L.ancestors = ancestors

    function get_leaves(versions) {
        var leaves = {...versions}
        Object.keys(versions).forEach(v => {
            Object.keys(L.T[v]).forEach(p => delete leaves[p])
        })
        return leaves
    }

    if (!Object.keys(L.T).length) L.set('= "i am empty"')

    return L
}

function create_space_dag_node(version, elems, end_cap, sort_key) {
    return {
        version : version,
        sort_key : sort_key,
        elems : elems,
        deleted_by : {},
        end_cap : end_cap,
        nexts : [],
        next : null
    }
}

function space_dag_apply_bubbles(S, to_bubble) {

    traverse_space_dag(S, () => true, node => {
        if (to_bubble[node.version] && to_bubble[node.version][0] != node.version) {
            if (!node.sort_key) node.sort_key = node.version
            node.version = to_bubble[node.version][0]
        }

        for (var x of Object.keys(node.deleted_by)) {
            if (to_bubble[x]) {
                delete node.deleted_by[x]
                node.deleted_by[to_bubble[x][0]] = true
            }
        }
    }, true)

    function set_nnnext(node, next) {
        while (node.next) node = node.next
        node.next = next
    }

    do_line(S, S.version)
    function do_line(node, version) {
        var prev = null
        while (node) {
            if (node.nexts[0] && node.nexts[0].version == version) {
                for (let i = 0; i < node.nexts.length; i++) {
                    delete node.nexts[i].version
                    delete node.nexts[i].sort_key
                    set_nnnext(node.nexts[i], i + 1 < node.nexts.length ? node.nexts[i + 1] : node.next)
                }
                node.next = node.nexts[0]
                node.nexts = []
            }

            if (node.deleted_by[version]) {
                node.elems = node.elems.slice(0, 0)
                node.deleted_by = {}
                if (prev) { node = prev; continue }
            }

            var next = node.next

            if (!node.nexts.length && next && (!node.elems.length || !next.elems.length || (Object.keys(node.deleted_by).every(x => next.deleted_by[x]) && Object.keys(next.deleted_by).every(x => node.deleted_by[x])))) {
                if (!node.elems.length) node.deleted_by = next.deleted_by
                node.elems = node.elems.concat(next.elems)
                node.end_cap = next.end_cap
                node.nexts = next.nexts
                node.next = next.next
                continue
            }

            for (let n of node.nexts) do_line(n, n.version)

            prev = node
            node = next
        }
    }
}

function space_dag_get(S, i, is_anc) {
    var ret = null
    var offset = 0
    traverse_space_dag(S, is_anc ? is_anc : () => true, (node) => {
        if (i - offset < node.elems.length) {
            ret = node.elems[i - offset]
            return false
        }
        offset += node.elems.length
    })
    return ret
}

function space_dag_set(S, i, v, is_anc) {
    var offset = 0
    traverse_space_dag(S, is_anc ? is_anc : () => true, (node) => {
        if (i - offset < node.elems.length) {
            node.elems[i - offset] = v
            return false
        }
        offset += node.elems.length
    })
}

function space_dag_length(S, is_anc) {
    var count = 0
    traverse_space_dag(S, is_anc ? is_anc : () => true, node => {
        count += node.elems.length
    })
    return count
}

function space_dag_break_node(node, x, end_cap, new_next) {
    var tail = create_space_dag_node(null, node.elems.slice(x), node.end_cap)
    Object.assign(tail.deleted_by, node.deleted_by)
    tail.nexts = node.nexts
    tail.next = node.next
    
    node.elems = node.elems.slice(0, x)
    node.end_cap = end_cap
    node.nexts = new_next ? [new_next] : []
    node.next = tail

    return tail
}

function space_dag_add_version(S, version, splices, sort_key, is_anc) {
    
    function add_to_nexts(nexts, to) {
        var i = binarySearch(nexts, function (x) {
            if ((to.sort_key || to.version) < (x.sort_key || x.version)) return -1
            if ((to.sort_key || to.version) > (x.sort_key || x.version)) return 1
            return 0
        })
        nexts.splice(i, 0, to)
    }
    
    var si = 0
    var delete_up_to = 0
    
    var process_patch = (node, offset, has_nexts, prev, _version, deleted) => {
        var s = splices[si]
        if (!s) return false
        
        if (deleted) {
            if (s[1] == 0 && s[0] == offset) {
                if (node.elems.length == 0 && !node.end_cap && has_nexts) return
                var new_node = create_space_dag_node(version, s[2], null, sort_key)
                if (node.elems.length == 0 && !node.end_cap)
                    add_to_nexts(node.nexts, new_node)
                else
                    space_dag_break_node(node, 0, undefined, new_node)
                si++
            }
            return            
        }
        
        if (s[1] == 0) {
            var d = s[0] - (offset + node.elems.length)
            if (d > 0) return
            if (d == 0 && !node.end_cap && has_nexts) return
            var new_node = create_space_dag_node(version, s[2], null, sort_key)
            if (d == 0 && !node.end_cap) {
                add_to_nexts(node.nexts, new_node)
            } else {
                space_dag_break_node(node, s[0] - offset, undefined, new_node)
            }
            si++
            return
        }
        
        if (delete_up_to <= offset) {
            var d = s[0] - (offset + node.elems.length)
            if (d >= 0) return
            delete_up_to = s[0] + s[1]
            
            if (s[2]) {
                var new_node = create_space_dag_node(version, s[2], null, sort_key)
                if (s[0] == offset && prev && prev.end_cap) {
                    add_to_nexts(prev.nexts, new_node)
                } else {
                    space_dag_break_node(node, s[0] - offset, true, new_node)
                    return
                }
            } else {
                if (s[0] == offset) {
                } else {
                    space_dag_break_node(node, s[0] - offset)
                    return
                }
            }
        }
        
        if (delete_up_to > offset) {
            if (delete_up_to <= offset + node.elems.length) {
                if (delete_up_to < offset + node.elems.length) {
                    space_dag_break_node(node, delete_up_to - offset)
                }
                si++
            }
            node.deleted_by[version] = true
            return
        }
    }
    
    var f = is_anc
    var exit_early = {}
    var offset = 0
    function traverse(node, prev, version) {
        var has_nexts = node.nexts.find(next => f(next.version))
        var deleted = Object.keys(node.deleted_by).some(version => f(version))
        if (process_patch(node, offset, has_nexts, prev, version, deleted) == false)
            throw exit_early
        if (!deleted) {
            offset += node.elems.length
        }
        for (var next of node.nexts)
            if (f(next.version)) traverse(next, null, next.version)
        if (node.next) traverse(node.next, node, version)
    }
    try {
        if (!S) debugger
        traverse(S, null, S.version)
    } catch (e) {
        if (e != exit_early) throw e
    }
    
}

function traverse_space_dag(S, f, cb, view_deleted, tail_cb) {
    var exit_early = {}
    var offset = 0
    function helper(node, prev, version) {
        var has_nexts = node.nexts.find(next => f(next.version))
        var deleted = Object.keys(node.deleted_by).some(version => f(version))
        if (view_deleted || !deleted) {
            if (cb(node, offset, has_nexts, prev, version, deleted) == false)
                throw exit_early
            offset += node.elems.length
        }
        for (var next of node.nexts)
            if (f(next.version)) helper(next, null, next.version)
        if (node.next) helper(node.next, node, version)
        else if (tail_cb) tail_cb(node)
    }
    try {
        helper(S, null, S.version)
    } catch (e) {
        if (e != exit_early) throw e
    }
}

function parse_patch(patch) {
    var ret = { path : [] }
    var re = /^(delete)\s+|\.?([^\.\[ =]+)|\[((\-?\d+)(:\-?\d+)?|'(\\'|[^'])*'|"(\\"|[^"])*")\]|\s*=\s*([\s\S]*)/g
    var m
    while (m = re.exec(patch)) {
        if (m[1]) ret.delete = true
        else if (m[2]) ret.path.push(m[2])
        else if (m[3] && m[5]) ret.slice = [JSON.parse(m[4]), JSON.parse(m[5].substr(1))]
        else if (m[3]) ret.path.push(JSON.parse(m[3]))
        else if (m[8]) ret.value = JSON.parse(m[8])
    }
    return ret
}

// modified from https://stackoverflow.com/questions/22697936/binary-search-in-javascript
function binarySearch(ar, compare_fn) {
    var m = 0;
    var n = ar.length - 1;
    while (m <= n) {
        var k = (n + m) >> 1;
        var cmp = compare_fn(ar[k]);
        if (cmp > 0) {
            m = k + 1;
        } else if(cmp < 0) {
            n = k - 1;
        } else {
            return k;
        }
    }
    return m;
}
