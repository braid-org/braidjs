
var antimatter = {}    // The antimatter algorithm
var json = {}          // A json crdt
var sequence = {}      // A sequence crdt

if (typeof module != 'undefined') module.exports = {antimatter, json, sequence}

;(() => {
    antimatter.create = (send, self) => {
        self = json.create(self)
        self.send = send

        self.id = self.id ?? Math.random().toString(36).slice(2)
        self.next_seq = self.next_seq ?? 0

        self.conns = self.conns ?? {}
        self.proto_conns = self.proto_conns ?? {}

        self.version_cache = self.version_cache ?? {}
        self.fissures = self.fissures ?? {}
        self.acked_boundary = self.acked_boundary ?? {}
        self.unack_boundary = self.unack_boundary ?? {}
        self.acks_in_process = self.acks_in_process ?? {}
        self.forget_cbs = self.forget_cbs ?? {}

        self.receive = ({cmd, version, parents, patches, versions, fissure, fissures, seen, forget, peer, conn}) => {
        
            if (cmd == 'get' || (cmd == 'welcome' && peer != null)) {
                if (self.conns[conn] != null) throw Error('bad')
                self.conns[conn] = peer

                send({
                    cmd: 'welcome',
                    versions: self.generate_braid(parents),
                    fissures: Object.values(self.fissures),
                    parents: parents && Object.keys(parents).length ? self.get_leaves(self.ancestors(parents, true)) : {},
                    ... cmd == 'get' ? {peer: self.id} : {},
                    conn
                })
            }

            if (cmd == 'forget') {
                if (self.conns[conn] == null) throw Error('bad')
                send({cmd: 'ack', forget: true, conn})

                delete self.conns[conn]
                delete self.proto_conns[conn]
            } else if (cmd == 'disconnect') {
                if (self.conns[conn] == null && !self.proto_conns[conn]) throw Error('bad')
                delete self.proto_conns[conn]

                if (self.conns[conn] == null) {
                    let new_fissures = resolve_fissures()
                    if (new_fissures.length) for (let c of Object.keys(self.conns)) send({cmd: 'fissure', fissures: new_fissures, conn: c})
                } else {
                    let peer = self.conns[conn]
                    delete self.conns[conn]

                    if (fissure) self.receive({cmd: 'fissure', fissure: create_fissure(peer, conn)})
                }
            } else if (cmd == 'fissure') {
                if (fissure && fissures) throw Error('bad')
                if (!fissures) fissures = [fissure]

                let new_fissures = []
                for (let fissure of fissures) {
                    var key = fissure.a + ':' + fissure.b + ':' + fissure.conn
                    if (!self.fissures[key]) {
                        self.fissures[key] = fissure
                        new_fissures.push(fissure)
                        self.acks_in_process = {}
                    }
                }
                let extra_fissures = resolve_fissures()
                new_fissures = new_fissures.concat(extra_fissures)

                if (extra_fissures.length) send({cmd: 'fissure', fissures: extra_fissures, conn})
                if (new_fissures.length) for (let c of Object.keys(self.conns)) if (c != conn) send({cmd: 'fissure', fissures: new_fissures, conn: c})
            } else if (cmd == 'set') {
                if (conn == null || !self.T[version]) {
                    for (p in parents) if (!self.T[p]) throw Error('bad')
                    
                    var rebased_patches = self.add_version(version, parents, patches)
                    for (let c of Object.keys(self.conns)) if (c != conn) send({cmd: 'set', version, parents, patches, conn: c})

                    self.acks_in_process[version] = {origin: conn, count: Object.keys(self.conns).length - (conn != null ? 1 : 0)}
                } else if (self.acks_in_process[version]) self.acks_in_process[version].count--

                check_ack_count(version)
                return rebased_patches
            } else if (cmd == 'ack' && forget) {
                self.forget_cbs[peer]()
            } else if (cmd == 'ack' && seen == 'local') {
                if (self.acks_in_process[version]) {
                    self.acks_in_process[version].count--
                    check_ack_count(version)
                }
            } else if (cmd == 'ack' && seen == 'global') {
                if (!self.T[version]) return
                if (self.ancestors(self.unack_boundary)[version]) return                
                if (self.ancestors(self.acked_boundary)[version]) return
                add_full_ack_leaf(version)
                for (let c of Object.keys(self.conns)) if (c != conn) send({cmd, seen, version, conn: c})

            }

            if (cmd == 'welcome') {
                var versions_to_add = {}
                versions.forEach(v => versions_to_add[v.version] = v.parents)
                versions.forEach(v => {
                    if (self.T[v.version]) {
                        remove_ancestors(v.version)
                        function remove_ancestors(v) {
                            if (versions_to_add[v]) {
                                Object.keys(versions_to_add[v]).forEach(remove_ancestors)
                                delete versions_to_add[v]
                            }
                        }
                    }
                })

                var rebased_patches = []
                var added_versions = []
                for (var v of versions) {
                    if (versions_to_add[v.version]) {
                        if (!Object.keys(v.parents).every(p => self.T[p])) throw Error('bad')

                        rebased_patches = rebased_patches.concat(self.add_version(v.version, v.parents, v.patches, v.sort_keys))
                        added_versions.push(v)
                    }
                }

                var new_fissures = []
                fissures.forEach(f => {
                    var key = f.a + ':' + f.b + ':' + f.conn
                    if (!self.fissures[key]) {
                        new_fissures.push(f)
                        self.fissures[key] = f
                    }
                })
                let extra_fissures = resolve_fissures()
                new_fissures = new_fissures.concat(extra_fissures)

                if (extra_fissures.length) send({cmd: 'fissure', fissures: extra_fissures, conn})
                if (added_versions.length || new_fissures.length) {
                    for (let c of Object.keys(self.conns)) if (c != conn) send({cmd: 'welcome', versions: added_versions, fissures: new_fissures, conn: c})
                }

                self.acks_in_process = {}

                return rebased_patches
            }
        }

        self.get = conn => {
            self.proto_conns[conn] = true
            send({cmd: 'get', peer: self.id, conn})
        }
        self.connect = self.get

        self.forget = async conn => {
            await new Promise(done => {
                if (self.conns[conn] != null) {
                    self.forget_cbs[conn] = done
                    send({cmd: 'forget', conn})
                }
                self.receive({cmd: 'disconnect', conn, fissure: false})
            })
        }

        self.disconnect = conn => {
            self.receive({cmd: 'disconnect', conn, fissure: true})
        }

        self.set = (...patches) => {
            var version = `${self.next_seq++}@${self.id}`
            self.receive({cmd: 'set', version, parents: {...self.current_version}, patches})
            return version
        }

        function create_fissure(peer, conn) {
            let ack_versions = self.ancestors(self.acked_boundary)
            let versions = Object.fromEntries(Object.keys(self.T).filter(v => !ack_versions[v] || self.acked_boundary[v]).map(v => [v, true]))
            return {a: self.id, b: peer, conn, versions, time: Date.now()}
        }

        function resolve_fissures() {
            let new_fissures = []
            let unfissured = {}

            Object.entries(self.fissures).forEach(([fk, f]) => {
                var other_key = f.b + ':' + f.a + ':' + f.conn
                var other = self.fissures[other_key]

                if (!other && f.b == self.id && !self.proto_conns[f.conn] && !self.conns[f.conn]) {
                    other = {...f, a: f.b, b: f.a}
                    new_fissures.push(self.fissures[other_key] = other)
                    self.acks_in_process = {}
                }

                if (other) {
                    if (Object.keys(f.versions).length) {
                        for (let v of Object.keys(f.versions)) unfissured[v] = true
                        self.fissures[fk] = {...f, versions: {}}
                    }
                    if (Object.keys(other.versions).length) {
                        for (let v of Object.keys(other.versions)) unfissured[v] = true
                        self.fissures[other_key] = {...other, versions: {}}
                    }
                }
            })

            if (Object.keys(unfissured).length) {
                let ack_versions = self.ancestors(self.acked_boundary)
                let unfissured_descendants = self.descendants(unfissured, true)
                for (let un of Object.keys(unfissured_descendants)) if (ack_versions[un]) delete ack_versions[un]
                self.acked_boundary = self.get_leaves(ack_versions)

                let u = self.ancestors(self.unack_boundary)
                for (let x of Object.keys(self.ancestors(unfissured_descendants))) u[x] = true
                self.unack_boundary = self.get_leaves(u)
            }

            return new_fissures
        }

        function prune() {
            Object.entries(self.fissures).forEach(x => {
                var other_key = x[1].b + ':' + x[1].a + ':' + x[1].conn
                var other = self.fissures[other_key]
                if (other) {
                    delete self.fissures[x[0]]
                    delete self.fissures[other_key]
                }
            })

            if (self.fissure_lifetime != null) {
                var now = Date.now()
                Object.entries(self.fissures).forEach(([k, f]) => {
                    if (f.time == null) f.time = now
                    if (f.time <= now - self.fissure_lifetime) {
                        delete self.fissures[k]
                    }
                })
            }

            var keep_us = {}

            Object.values(self.fissures).forEach(f => {
                Object.keys(f.versions).forEach(v => keep_us[v] = true)
            })

            var acked = self.ancestors(self.acked_boundary)
            Object.keys(self.T).forEach(x => {
                if (!acked[x] || self.acked_boundary[x]) keep_us[x] = true
            })

            var children = self.get_child_map()

            var to_bubble = {}
            var bubble_tops = {}
            var bubble_bottoms = {}
            
            function mark_bubble(bottom, top, tag) {
                if (!to_bubble[bottom]) {
                    to_bubble[bottom] = tag
                    if (bottom !== top) Object.keys(self.T[bottom]).forEach(p => mark_bubble(p, top, tag))
                }
            }
            
            var done = {}
            function f(cur) {
                if (!self.T[cur]) return
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

                Object.keys(self.T[cur]).forEach(f)
            }
            Object.keys(self.current_version).forEach(f)

            function find_one_bubble(cur) {
                var seen = {[cur]: true}
                var q = Object.keys(self.T[cur])
                var expecting = Object.fromEntries(q.map(x => [x, true]))
                while (q.length) {
                    cur = q.pop()
                    if (!self.T[cur]) return null
                    if (keep_us[cur]) return null
                    if (Object.keys(children[cur]).every(c => seen[c])) {
                        seen[cur] = true
                        delete expecting[cur]
                        if (!Object.keys(expecting).length) return cur
                        
                        Object.keys(self.T[cur]).forEach(p => {
                            q.push(p)
                            expecting[p] = true
                        })
                    }
                }
                return null
            }

            self.apply_bubbles(Object.fromEntries(Object.entries(to_bubble).map(
                ([v, bub]) => [v, [bub, bubble_bottoms[bub]]]
            )))
        }

        function add_full_ack_leaf(version) {
            var marks = {}
            function f(v) {
                if (!marks[v]) {
                    marks[v] = true
                    delete self.unack_boundary[v]
                    delete self.acked_boundary[v]
                    delete self.acks_in_process[v]
                    Object.keys(self.T[v]).forEach(f)
                }
            }
            f(version)

            self.acked_boundary[version] = true
            prune(self)
        }

        function check_ack_count(version) {
            let a = self.acks_in_process[version]
            if (a?.count == 0) {
                if (a.origin != null) {
                    send({cmd: 'ack', seen: 'local', version, conn: a.origin})
                } else {
                    add_full_ack_leaf(version)
                    for (let c of Object.keys(self.conns)) send({cmd: 'ack', seen: 'global', version, conn: c})
                }
            }
        }

        return self
    }

    json.create = self => {
        self = self ?? {}     
        self.S = self.S ?? null
        self.T = self.T ?? {}
        self.current_version = self.current_version ?? {}

        let is_lit = x => !x || typeof(x) != 'object' || x.t == 'lit'
        let get_lit = x => (x && typeof(x) == 'object' && x.t == 'lit') ? x.S : x
        let make_lit = x => (x && typeof(x) == 'object') ? {t: 'lit', S: x} : x
            self = self ?? {}
    
        self.read = (is_anc) => {
            if (!is_anc) is_anc = () => true

            return rec_read(self.S)
            function rec_read(x) {
                if (x && typeof(x) == 'object') {
                    if (x.t == 'lit') return JSON.parse(JSON.stringify(x.S))
                    if (x.t == 'val') return rec_read(sequence.get(x.S, 0, is_anc))
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
                        sequence.traverse(x.S, is_anc, (node, _, __, ___, ____, deleted) => {
                            if (!deleted) node.elems.forEach((e) => a.push(rec_read(e)))
                        }, true)
                        return a
                    }
                    if (x.t == 'str') {
                        var s = []
                        sequence.traverse(x.S, is_anc, (node, _, __, ___, ____, deleted) => {
                            if (!deleted) s.push(node.elems)
                        }, true)
                        return s.join('')
                    }
                    throw Error('bad')
                } return x
            }
        }

        self.generate_braid = versions => {
            var anc = versions && Object.keys(versions).length ? self.ancestors(versions, true) : {}
            var is_anc = x => anc[x]

            if (Object.keys(self.T).length === 0) return []

            return Object.entries(self.version_cache).filter(x => !is_anc(x[0])).map(([version, set_message]) => {
                return self.version_cache[version] = set_message || generate_set_message(version)
            })

            function generate_set_message(version) {
                if (!Object.keys(self.T[version]).length) {
                    return {
                        version,
                        parents: {},
                        patches: [{range: '', content: self.read(v => v == version)}]
                    }
                }
            
                var is_lit = x => !x || typeof(x) !== 'object' || x.t === 'lit'
                var get_lit = x => (x && typeof(x) === 'object' && x.t === 'lit') ? x.S : x
            
                var ancs = self.ancestors({[version]: true})
                delete ancs[version]
                var is_anc = x => ancs[x]
                var path = []
                var patches = []
                var sort_keys = {}
                recurse(self.S)
                function recurse(x) {
                    if (is_lit(x)) {
                    } else if (x.t === 'val') {
                        sequence.generate_braid(x.S, version, is_anc).forEach(s => {
                            if (s[2].length) {
                                patches.push({range: path.join(''), content: s[2][0]})
                                if (s[3]) sort_keys[patches.length - 1] = s[3]
                            }
                        })
                        sequence.traverse(x.S, is_anc, node => {
                            node.elems.forEach(recurse)
                        })
                    } else if (x.t === 'arr') {
                        sequence.generate_braid(x.S, version, is_anc).forEach(s => {
                            patches.push({range: `${path.join('')}[${s[0]}:${s[0] + s[1]}]`, content: s[2]})
                            if (s[3]) sort_keys[patches.length - 1] = s[3]
                        })
                        var i = 0
                        sequence.traverse(x.S, is_anc, node => {
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
                        sequence.generate_braid(x.S, version, is_anc).forEach(s => {
                            patches.push({range: `${path.join('')}[${s[0]}:${s[0] + s[1]}]`, content: s[2]})
                            if (s[3]) sort_keys[patches.length - 1] = s[3]
                        })
                    }
                }
            
                return {
                    version,
                    parents: {...self.T[version]},
                    patches,
                    sort_keys
                }
            }
        }

        self.apply_bubbles = to_bubble => {
            function recurse(x) {
                if (is_lit(x)) return x
                if (x.t == 'val') {
                    sequence.apply_bubbles(x.S, to_bubble)
                    sequence.traverse(x.S, () => true, node => {
                        node.elems = node.elems.slice(0, 1).map(recurse)
                    }, true)
                    if (x.S.nexts.length == 0 && !x.S.next && x.S.elems.length == 1 && is_lit(x.S.elems[0])) return x.S.elems[0]
                    return x
                }
                if (x.t == 'arr') {
                    sequence.apply_bubbles(x.S, to_bubble)
                    sequence.traverse(x.S, () => true, node => {
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
                    sequence.apply_bubbles(x.S, to_bubble)
                    if (x.S.nexts.length == 0 && !x.S.next && !Object.keys(x.S.deleted_by).length) return x.S.elems
                    return x
                }
            }
            self.S = recurse(self.S)

            Object.entries(to_bubble).forEach(([version, bubble]) => {
                if (version === bubble[1])
                    self.T[bubble[0]] = self.T[bubble[1]]
                if (version !== bubble[0]) {
                    delete self.T[version]
                    delete self.version_cache[version]
                } else self.version_cache[version] = null
            })

            var leaves = Object.keys(self.current_version)
            var acked_boundary = Object.keys(self.acked_boundary)
            var fiss = Object.keys(self.fissures)
            if (leaves.length == 1 && acked_boundary.length == 1
                && leaves[0] == acked_boundary[0] && fiss.length == 0) {
                self.T = { [leaves[0]]: {} }
                self.S = make_lit(self.read())
            }
        }

        self.add_version = (version, parents, patches, sort_keys) => {
            if (self.T[version]) return

            self.T[version] = {...parents}

            self.version_cache[version] = JSON.parse(JSON.stringify({
                version, parents, patches, sort_keys
            }))

            Object.keys(parents).forEach(k => {
                if (self.current_version[k])
                    delete self.current_version[k]
            })
            self.current_version[version] = true
            
            if (!sort_keys) sort_keys = {}
            
            if (!Object.keys(parents).length) {
                var parse = self.parse_patch(patches[0])
                self.S = make_lit(parse.value)
                return patches
            }
            
            let is_anc
            if (parents == self.current_version) {
                is_anc = _version => _version != version
            } else {
                let ancs = self.ancestors(parents)
                is_anc = _version => ancs[_version]
            }
            
            var rebased_patches = []
            patches.forEach((patch, i) => {
                var sort_key = sort_keys[i]
                var parse = self.parse_patch(patch)
                var cur = resolve_path(parse)
                if (!parse.slice) {
                    if (cur.t != 'val') throw Error('bad')
                    var len = sequence.length(cur.S, is_anc)
                    sequence.add_version(cur.S, version, [[0, len, [parse.delete ? null : make_lit(parse.value)], sort_key]], is_anc)
                    rebased_patches.push(patch)
                } else {
                    if (typeof parse.value === 'string' && cur.t !== 'str')
                        throw Error(`Cannot splice string ${JSON.stringify(parse.value)} into non-string`)
                    if (parse.value instanceof Array && cur.t !== 'arr')
                        throw Error(`Cannot splice array ${JSON.stringify(parse.value)} into non-array`)
                    if (parse.value instanceof Array)
                        parse.value = parse.value.map(x => make_lit(x))

                    var r0 = parse.slice[0]
                    var r1 = parse.slice[1]
                    if (r0 < 0 || Object.is(r0, -0) || r1 < 0 || Object.is(r1, -0)) {
                        let len = sequence.length(cur.S, is_anc)
                        if (r0 < 0 || Object.is(r0, -0)) r0 = len + r0
                        if (r1 < 0 || Object.is(r1, -0)) r1 = len + r1
                    }

                    var rebased_splices = sequence.add_version(cur.S, version, [[r0, r1 - r0, parse.value, sort_key]], is_anc)
                    for (let rebased_splice of rebased_splices) rebased_patches.push(`${parse.path.map(x => `[${JSON.stringify(x)}]`).join('')}[${rebased_splice[0]}:${rebased_splice[0] + rebased_splice[1]}] = ${JSON.stringify(rebased_splice[2])}`)
                }
            })

            function resolve_path(parse) {
                var cur = self.S
                if (!cur || typeof(cur) != 'object' || cur.t == 'lit')
                    cur = self.S = {t: 'val', S: sequence.create_node(null, [cur])}
                var prev_S = null
                var prev_i = 0
                for (var i=0; i<parse.path.length; i++) {
                    var key = parse.path[i]
                    if (cur.t == 'val') cur = sequence.get(prev_S = cur.S, prev_i = 0, is_anc)
                    if (cur.t == 'lit') {
                        var new_cur = {}
                        if (cur.S instanceof Array) {
                            new_cur.t = 'arr'
                            new_cur.S = sequence.create_node(null, cur.S.map(x => make_lit(x)))
                        } else {
                            if (typeof(cur.S) != 'object') throw Error('bad')
                            new_cur.t = 'obj'
                            new_cur.S = {}
                            Object.entries(cur.S).forEach(e => new_cur.S[e[0]] = make_lit(e[1]))
                        }
                        cur = new_cur
                        sequence.set(prev_S, prev_i, cur, is_anc)
                    }
                    if (cur.t == 'obj') {
                        let x = cur.S[key]
                        if (!x || typeof(x) != 'object' || x.t == 'lit')
                            x = cur.S[key] = {t: 'val', S: sequence.create_node(null, [x == null ? null : x])}
                        cur = x
                    } else if (i == parse.path.length - 1 && !parse.slice) {
                        parse.slice = [key, key + 1]
                        parse.value = (cur.t == 'str') ? parse.value : [parse.value]
                    } else if (cur.t == 'arr') {
                        cur = sequence.get(prev_S = cur.S, prev_i = key, is_anc)
                    } else throw Error('bad')
                }
                if (parse.slice) {
                    if (cur.t == 'val') cur = sequence.get(prev_S = cur.S, prev_i = 0, is_anc)
                    if (typeof(cur) == 'string') {
                        cur = {t: 'str', S: sequence.create_node(null, cur)}
                        sequence.set(prev_S, prev_i, cur, is_anc)
                    } else if (cur.t == 'lit') {
                        if (!(cur.S instanceof Array)) throw Error('bad')
                        cur = {t: 'arr', S: sequence.create_node(null, cur.S.map(x => make_lit(x)))}
                        sequence.set(prev_S, prev_i, cur, is_anc)
                    }
                }
                return cur
            }

            return rebased_patches
        }

        self.get_child_map = () => {
            let children = {}
            Object.entries(self.T).forEach(([v, parents]) => {
                Object.keys(parents).forEach(parent => {
                    if (!children[parent]) children[parent] = {}
                    children[parent][v] = true
                })
            })
            return children
        }

        self.ancestors = (versions, ignore_nonexistent) => {
            var result = {}
            function recurse(version) {
                if (result[version]) return
                if (!self.T[version]) {
                    if (ignore_nonexistent) return
                    throw Error(`The version ${version} no existo`)
                }
                result[version] = true
                Object.keys(self.T[version]).forEach(recurse)
            }
            Object.keys(versions).forEach(recurse)
            return result
        }

        self.descendants = (versions, ignore_nonexistent) => {
            let children = self.get_child_map()
            var result = {}
            function recurse(version) {
                if (result[version]) return
                if (!self.T[version]) {
                    if (ignore_nonexistent) return
                    throw Error(`The version ${version} no existo`)
                }
                result[version] = true
                Object.keys(children[version] ?? {}).forEach(recurse)
            }
            Object.keys(versions).forEach(recurse)
            return result
        }

        self.get_leaves = versions => {
            var leaves = {...versions}
            Object.keys(versions).forEach(v => {
                Object.keys(self.T[v]).forEach(p => delete leaves[p])
            })
            return leaves
        }

        self.parse_patch = patch => {
            let x = self.parse_json_path(patch.range)
            x.value = patch.content
            return x
        }

        self.parse_json_path = json_path => {
            var ret = { path : [] }
            var re = /^(delete)\s+|\.?([^\.\[ =]+)|\[((\-?\d+)(:\-?\d+)?|"(\\"|[^"])*")\]/g
            var m
            while (m = re.exec(json_path)) {
                if (m[1]) ret.delete = true
                else if (m[2]) ret.path.push(m[2])
                else if (m[3] && m[5]) ret.slice = [JSON.parse(m[4]), JSON.parse(m[5].substr(1))]
                else if (m[3]) ret.path.push(JSON.parse(m[3]))
            }
            return ret
        }

        return self
    }

    sequence.create_node = (version, elems, end_cap, sort_key) => ({
        version,
        sort_key,
        elems,
        end_cap,
        deleted_by : {},
        nexts : [],
        next : null
    })

    sequence.generate_braid = (S, version, is_anc) => {
        var splices = []

        function add_ins(offset, ins, sort_key, end_cap) {
            if (typeof(ins) !== 'string')
                ins = ins.map(x => read_raw(x, () => false))
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

    sequence.apply_bubbles = (S, to_bubble) => {

        sequence.traverse(S, () => true, node => {
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

    sequence.get = (S, i, is_anc) => {
        var ret = null
        var offset = 0
        sequence.traverse(S, is_anc ? is_anc : () => true, (node) => {
            if (i - offset < node.elems.length) {
                ret = node.elems[i - offset]
                return false
            }
            offset += node.elems.length
        })
        return ret
    }

    sequence.set = (S, i, v, is_anc) => {
        var offset = 0
        sequence.traverse(S, is_anc ? is_anc : () => true, (node) => {
            if (i - offset < node.elems.length) {
                if (typeof node.elems == 'string') node.elems = node.elems.slice(0, i - offset) + v + node.elems.slice(i - offset + 1)
                else node.elems[i - offset] = v
                return false
            }
            offset += node.elems.length
        })
    }

    sequence.length = (S, is_anc) => {
        var count = 0
        sequence.traverse(S, is_anc ? is_anc : () => true, node => {
            count += node.elems.length
        })
        return count
    }

    sequence.break_node = (node, x, end_cap, new_next) => {
        var tail = sequence.create_node(null, node.elems.slice(x), node.end_cap)
        Object.assign(tail.deleted_by, node.deleted_by)
        tail.nexts = node.nexts
        tail.next = node.next
        
        node.elems = node.elems.slice(0, x)
        node.end_cap = end_cap
        node.nexts = new_next ? [new_next] : []
        node.next = tail

        return tail
    }

    sequence.add_version = (S, version, splices, is_anc) => {

        var rebased_splices = []
        
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
            var sort_key = s[3]
            
            if (deleted) {
                if (s[1] == 0 && s[0] == offset) {
                    if (node.elems.length == 0 && !node.end_cap && has_nexts) return
                    var new_node = sequence.create_node(version, s[2], null, sort_key)

                    rebased_splices.push([rebase_offset, 0, s[2]])

                    if (node.elems.length == 0 && !node.end_cap)
                        add_to_nexts(node.nexts, new_node)
                    else
                        sequence.break_node(node, 0, undefined, new_node)
                    si++
                }
                return            
            }
            
            if (s[1] == 0) {
                var d = s[0] - (offset + node.elems.length)
                if (d > 0) return
                if (d == 0 && !node.end_cap && has_nexts) return
                var new_node = sequence.create_node(version, s[2], null, sort_key)

                rebased_splices.push([rebase_offset + s[0] - offset, 0, s[2]])

                if (d == 0 && !node.end_cap) {
                    add_to_nexts(node.nexts, new_node)
                } else {
                    sequence.break_node(node, s[0] - offset, undefined, new_node)
                }
                si++
                return
            }
            
            if (delete_up_to <= offset) {
                var d = s[0] - (offset + node.elems.length)
                if (d >= 0) return
                delete_up_to = s[0] + s[1]
                
                if (s[2]) {
                    var new_node = sequence.create_node(version, s[2], null, sort_key)

                    rebased_splices.push([rebase_offset + s[0] - offset, 0, s[2]])

                    if (s[0] == offset && prev && prev.end_cap) {
                        add_to_nexts(prev.nexts, new_node)
                    } else {
                        sequence.break_node(node, s[0] - offset, true, new_node)
                        return
                    }
                } else {
                    if (s[0] == offset) {
                    } else {
                        sequence.break_node(node, s[0] - offset)
                        return
                    }
                }
            }
            
            if (delete_up_to > offset) {
                if (delete_up_to <= offset + node.elems.length) {
                    if (delete_up_to < offset + node.elems.length) {
                        sequence.break_node(node, delete_up_to - offset)
                    }
                    si++
                }
                node.deleted_by[version] = true

                rebased_splices.push([rebase_offset, node.elems.length, ''])

                return
            }
        }
        
        var f = is_anc || (() => true)
        var exit_early = {}
        var offset = 0
        var rebase_offset = 0
        function traverse(node, prev, version) {
            var rebase_deleted = Object.keys(node.deleted_by).length > 0
            if (!version || f(version)) {
                var has_nexts = node.nexts.find(next => f(next.version))
                var deleted = Object.keys(node.deleted_by).some(version => f(version))
                if (process_patch(node, offset, has_nexts, prev, version, deleted) == false) throw exit_early
                if (!deleted) offset += node.elems.length
            }
            if (!rebase_deleted) rebase_offset += node.elems.length

            for (var next of node.nexts) traverse(next, null, next.version)
            if (node.next) traverse(node.next, node, version)
        }
        try {
            traverse(S, null, S.version)
        } catch (e) {
            if (e != exit_early) throw e
        }

        return rebased_splices
    }

    sequence.traverse = (S, f, cb, view_deleted, tail_cb) => {
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
})()
