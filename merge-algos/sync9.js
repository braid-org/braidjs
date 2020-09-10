// Adapted from https://github.com/dglittle/cdn/blob/gh-pages/sync9_047.html

module.exports = require.sync9 = function create (resource) {
    if (!resource.space_dag) resource.space_dag = null
    return {
        add_version: function (version, parents, patches, sort_keys, is_anc) {
            return add_version(resource, version, parents, patches, sort_keys, is_anc)
        },

        read: function (version) {
            return read(resource, version)
        },

        read_raw: function (version) {
            return read_raw(resource, version)
        },

        prune: function (to_bubble, seen_annotations) {
            return prune(resource, to_bubble, seen_annotations)
        },

        change_names: function (name_changes, deleted) {
            change_names(resource, name_changes, deleted)
        },

        generate_braid: function(is_anc
                                   /*from_parents, to_parents*/) {
            return generate_braid(resource, is_anc)
        }
    }
}

function generate_braid(resource, is_anc) {
    if (Object.keys(resource.time_dag).length === 0) return []
    return Object.entries(resource.version_cache).filter(x => !is_anc(x[0])).map(([version, set_message]) => {
        return resource.version_cache[version] = set_message || generate_set_message(version)
    })

    function generate_set_message(version) {
        if (!Object.keys(resource.time_dag[version]).length) {
            return {
                version,
                parents: {},
                changes: [` = ${JSON.stringify(read_raw(resource, v => v == version))}`]
            }
        }
    
        var is_lit = x => !x || typeof(x) != 'object' || x.t == 'lit'
        var get_lit = x => (x && typeof(x) == 'object' && x.t == 'lit') ? x.S : x
    
        var ancs = resource.ancestors({[version]: true})
        delete ancs[version]
        var is_anc = x => ancs[x]
        var path = []
        var changes = []
        var sort_keys = {}
        recurse(resource.space_dag)
        function recurse(x) {
            if (is_lit(x)) {
            } else if (x.t == 'val') {
                space_dag_generate_braid(x.S, resource, version, is_anc).forEach(s => {
                    if (s[2].length) {
                        changes.push(`${path.join('')} = ${JSON.stringify(s[2][0])}`)
                        if (s[3]) sort_keys[changes.length - 1] = s[3]
                    }
                })
                traverse_space_dag(x.S, is_anc, node => {
                    node.elems.forEach(recurse)
                })
            } else if (x.t == 'arr') {
                space_dag_generate_braid(x.S, resource, version, is_anc).forEach(s => {
                    changes.push(`${path.join('')}[${s[0]}:${s[0] + s[1]}] = ${JSON.stringify(s[2])}`)
                    if (s[3]) sort_keys[changes.length - 1] = s[3]
                })
                var i = 0
                traverse_space_dag(x.S, is_anc, node => {
                    node.elems.forEach(e => {
                        path.push(`[${i++}]`)
                        recurse(e)
                        path.pop()
                    })
                })
            } else if (x.t == 'obj') {
                Object.entries(x.S).forEach(e => {
                    path.push('[' + JSON.stringify(e[0]) + ']')
                    recurse(e[1])
                    path.pop()
                })
            } else if (x.t == 'str') {
                space_dag_generate_braid(x.S, resource, version, is_anc).forEach(s => {
                    changes.push(`${path.join('')}[${s[0]}:${s[0] + s[1]}] = ${JSON.stringify(s[2])}`)
                    if (s[3]) sort_keys[changes.length - 1] = s[3]
                })
            }
        }
    
        return {
            version,
            parents: Object.assign({}, resource.time_dag[version]),
            changes,
            sort_keys
        }
    }
}

function space_dag_generate_braid(S, resource, version, is_anc) {
    var splices = []

    function add_ins(offset, ins, sort_key, end_cap) {
        if (typeof(ins) != 'string')
            ins = ins.map(x => read_raw(x, () => false))
        if (splices.length > 0) {
            var prev = splices[splices.length - 1]
            if (prev[0] + prev[1] == offset && !end_cap && (prev[4] == 'i' || (prev[4] == 'r' && prev[1] == 0))) {
                prev[2] = prev[2].concat(ins)
                return
            }
        }
        splices.push([offset, 0, ins, sort_key, end_cap ? 'r' : 'i'])
    }

    function add_del(offset, del, ins) {
        if (splices.length > 0) {
            var prev = splices[splices.length - 1]
            if (prev[0] + prev[1] == offset && prev[4] != 'i') {
                prev[1] += del
                return
            }
        }
        splices.push([offset, del, ins, null, 'd'])
    }
    
    var offset = 0
    function helper(node, _version, end_cap) {
        if (_version == version) {
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
    return splices
}



function prune(x, to_bubble, seen_annotations) {
    var is_lit = x => !x || typeof(x) != 'object' || x.t == 'lit'
    var get_lit = x => (x && typeof(x) == 'object' && x.t == 'lit') ? x.S : x

    seen_annotations = seen_annotations || {}
    see_annotations(x.space_dag)
    function see_annotations(x, is_lit_override) {
        if (is_lit_override || is_lit(x)) {
            if (!is_lit_override && x && typeof(x) == 'object' && x.t == 'lit') x = x.S
            if (Array.isArray(x)) for (y of x) see_annotations(y, true)
            else if (x && typeof(x) == 'object') {
                if (x.type == 'location') seen_annotations[x.id] = true
                else for (y of Object.values(x)) see_annotations(y, true)
            }
        } else if (x.t == 'val') {
            traverse_space_dag(x.S, () => true, node => {
                node.elems.forEach(x => see_annotations(x))
            }, true)
        } else if (x.t == 'arr') {
            traverse_space_dag(x.S, () => true, node => {
                node.elems.forEach(x => see_annotations(x))
            }, true)
        } else if (x.t == 'obj') {
            Object.values(x.S).forEach(x => see_annotations(x))
        }
    }

    function recurse(x) {
        if (is_lit(x)) return x
        if (x.t == 'val') {
            space_dag_prune(x.S, to_bubble)
            traverse_space_dag(x.S, () => true, node => {
                node.elems = node.elems.slice(0, 1).map(recurse)
            }, true)
            if (x.S.nexts.length == 0 && !x.S.next && x.S.elems.length == 1 && is_lit(x.S.elems[0])) return x.S.elems[0]
            return x
        }
        if (x.t == 'arr') {
            space_dag_prune(x.S, to_bubble, seen_annotations)
            traverse_space_dag(x.S, () => true, node => {
                node.elems = node.elems.map(recurse)
            }, true)
            if (x.S.nexts.length == 0 && !x.S.next && x.S.elems.every(is_lit) && !Object.keys(x.S.deleted_by).length && !x.S.annotations) return {t: 'lit', S: x.S.elems.map(get_lit)}
            return x
        }
        if (x.t == 'obj') {
            Object.entries(x.S).forEach(e => {
                var y = x.S[e[0]] = recurse(e[1])
                if (is_lit(y) && y && typeof(y) == 'object' && y.S.type == 'deleted')
                    delete x.S[e[0]]
            })
            if (Object.values(x.S).every(is_lit)) {
                var o = {}
                Object.entries(x.S).forEach(e => o[e[0]] = get_lit(e[1]))
                return {t: 'lit', S: o}
            }
            return x
        }
        if (x.t == 'str') {
            space_dag_prune(x.S, to_bubble, seen_annotations)
            if (x.S.nexts.length == 0 && !x.S.next && !Object.keys(x.S.deleted_by).length && !x.S.annotations) return x.S.elems
            return x
        }
    }
    x.space_dag = recurse(x.space_dag)

    Object.entries(to_bubble).forEach(([version, bubble]) => {
        if (version == bubble[1]) x.time_dag[bubble[0]] = x.time_dag[bubble[1]]
        if (version != bubble[0]) {
            delete x.time_dag[version]
            delete x.version_cache[version]
        } else x.version_cache[version] = null
    })
}

function space_dag_prune(S, to_bubble, seen_annotations) {

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

        if (node.annotations) {
            for (k of Object.keys(node.annotations))
                if (!seen_annotations[k]) delete node.annotations[k]
            if (!Object.keys(node.annotations).length) delete node.annotations
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
                if (node.annotations) Object.keys(node.annotations).forEach(k => node.annotations[k] = 0)
                node.elems = node.elems.slice(0, 0)
                node.deleted_by = {}
                if (prev) { node = prev; continue }
            }

            var next = node.next

            if (!node.nexts.length && next && (!node.elems.length || !next.elems.length || (Object.keys(node.deleted_by).every(x => next.deleted_by[x]) && Object.keys(next.deleted_by).every(x => node.deleted_by[x])))) {
                if (next.annotations) {
                    node.annotations = node.annotations || {}
                    Object.entries(next.annotations).forEach(e => {
                        node.annotations[e[0]] = node.elems.length + e[1]
                    })
                }
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

function add_version(resource, version, parents, changes, sort_keys, is_anc) {
    let make_lit = x => (x && typeof(x) == 'object') ? {t: 'lit', S: x} : x
    
    if (resource.time_dag[version]) return
    if (!Object.keys(parents).length && Object.keys(resource.time_dag).length) return

    resource.time_dag[version] = Object.assign({}, parents)

    resource.version_cache[version] = JSON.parse(JSON.stringify({version, parents, changes, sort_keys}))

    if (!sort_keys) sort_keys = {}
    
    Object.keys(parents).forEach(k => {
        if (resource.current_version[k]) delete resource.current_version[k]
    })
    resource.current_version[version] = true
    
    if (!Object.keys(parents).length) {
        var parse = parse_change(changes[0])
        resource.space_dag = make_lit(parse.val)
        parse.annotations && create_annotations(parse.annotations)
        return
    }
    
    if (!is_anc) {
        if (parents == resource.current_version)
            is_anc = (_version) => _version != version
        else {
            var ancs = resource.ancestors(parents)
            is_anc = _version => ancs[_version]
        }
    }

    var annotations = {}
    
    changes.forEach((change, i) => {
        var sort_key = sort_keys[i]
        var parse = parse_change(change)
        Object.assign(annotations, parse.annotations)
        var cur = resolve_path(parse)
        if (!parse.range) {
            if (cur.t != 'val') throw 'bad'
            var len = space_dag_length(cur.S, is_anc)
            space_dag_add_version(cur.S, version, [[0, len, [parse.delete ? make_lit({type: 'deleted'}) : make_lit(parse.val)]]], sort_key, is_anc)
        } else {
            if (typeof parse.val === 'string' && cur.t !== 'str')
                throw `Cannot splice string ${JSON.stringify(parse.val)} into non-string`
            if (parse.val instanceof Array && cur.t !== 'arr')
                throw `Cannot splice array ${JSON.stringify(parse.val)} into non-array`
            if (parse.val instanceof Array) parse.val = parse.val.map(x => make_lit(x))

            var r0 = parse.range[0]
            var r1 = parse.range[1]
            if (r0 < 0 || Object.is(r0, -0) || r1 < 0 || Object.is(r1, -0)) {
                let len = space_dag_length(cur.S, is_anc)
                if (r0 < 0 || Object.is(r0, -0)) r0 = len + r0
                if (r1 < 0 || Object.is(r1, -0)) r1 = len + r1
            }

            space_dag_add_version(cur.S, version, [[r0, r1 - r0, parse.val]], sort_key, is_anc)
        }
    })

    create_annotations(annotations)
    function create_annotations(annotations) {
        var prev_is_anc = is_anc
        is_anc = v => prev_is_anc(v) || v == version
        Object.entries(annotations).forEach(e => {
            e[1].range = [0, 0]
            var cur = resolve_path(e[1])
            function helper(node, offset) {
                if (offset <= e[1].pos && e[1].pos <= offset + node.elems.length) {
                    node.annotations = node.annotations || {}
                    node.annotations[e[0]] = e[1].pos - offset
                    return false
                }
            }
            if (e[1].pos == 0) helper(cur.S, 0)
            else traverse_space_dag(cur.S, is_anc, helper)
        })
    }

    function resolve_path(parse) {
        var cur = resource.space_dag
        if (!cur || typeof(cur) != 'object' || cur.t == 'lit')
            cur = resource.space_dag = {t: 'val', S: create_space_dag_node(null, [cur])}
        var prev_S = null
        var prev_i = 0
        for (var i=0; i<parse.keys.length; i++) {
            var key = parse.keys[i]
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
                    x = cur.S[key] = {t: 'val', S: create_space_dag_node(null, [x == undefined ? {t: 'lit', S: {type: 'deleted'}} : x])}
                cur = x
            } else if (i == parse.keys.length - 1 && !parse.range) {
                parse.range = [key, key + 1]
                parse.val = (cur.t == 'str') ? parse.val : [parse.val]
            } else if (cur.t == 'arr') {
                cur = space_dag_get(prev_S = cur.S, prev_i = key, is_anc)
            } else throw 'bad'
        }
        if (parse.range) {
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

function read(x, is_anc) {
    if (!is_anc) is_anc = () => true
    var annotations = {}
    return finalize(read_raw(x, is_anc, annotations))
    function finalize(x) {
        if (Array.isArray(x))
            for (var i = 0; i < x.length; i++) x[i] = finalize(x[i])
        else if (x && typeof(x) == 'object') {
            if (x.type == 'location')
                return annotations[x.id]
            else {
                var y = {}
                Object.entries(x).forEach(e => {
                    if (e[1] && typeof(e[1]) == 'object' && e[1].type == 'deleted') return
                    var key = e[0].match(/^_+type$/) ? e[0].slice(1) : e[0]
                    y[key] = finalize(e[1])
                })
                return y
            }
        }
        return x
    }
}

function read_raw(x, is_anc, annotations) {
    if (!is_anc) is_anc = () => true
    else if (typeof(is_anc) == 'string') {
        var ancs = x.ancestors({[is_anc]: true})
        is_anc = v => ancs[v]
    } else if (typeof(is_anc) == 'object') {
        var ancs = x.ancestors(is_anc)
        is_anc = v => ancs[v]
    }

    return finalize(rec_read(x))
    function rec_read(x) {
        if (x && typeof(x) == 'object') {
            if (!x.t) return rec_read(x.space_dag)
            if (x.t == 'lit') return JSON.parse(JSON.stringify(x.S))
            if (x.t == 'val') return rec_read(space_dag_get(x.S, 0, is_anc))
            if (x.t == 'obj') {
                var o = {}
                Object.entries(x.S).forEach(([k, v]) => o[k] = rec_read(v))
                return o
            }
            if (x.t == 'arr') {
                var a = []
                traverse_space_dag(x.S, is_anc, (node, _, __, ___, ____, deleted) => {
                    if (annotations && node.annotations) Object.entries(node.annotations).forEach(e => {
                        annotations[e[0]] = a.length + (deleted ? 0 : e[1])
                    })
                    if (!deleted) {
                        node.elems.forEach((e) => {
                            a.push(rec_read(e))
                        })
                    }
                }, true)
                return a
            }
            if (x.t == 'str') {
                var s = []
                var len = 0
                traverse_space_dag(x.S, is_anc, (node, _, __, ___, ____, deleted) => {
                    if (annotations && node.annotations) Object.entries(node.annotations).forEach(e => {
                        annotations[e[0]] = len + (deleted ? 0 : e[1])
                    })
                    if (!deleted) {
                        s.push(node.elems)
                        len += node.elems.length
                    }
                }, true)
                return s.join('')
            }
            throw 'bad'
        } return x
    }
    function finalize(x) {
        if (Array.isArray(x)) x.forEach(x => finalize(x))
        else if (x && typeof(x) == 'object') {
            if (!annotations && x.type == 'location') delete x.id
            else Object.values(x).forEach(x => finalize(x))
        }
        return x
    }
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

    var annotations = node.annotations || {}
    delete node.annotations
    Object.entries(annotations).forEach(e => {
        if (e[1] <= x) {
            node.annotations = node.annotations || {}
            node.annotations[e[0]] = e[1]
        } else {
            tail.annotations = tail.annotations || {}
            tail.annotations[e[0]] = e[1] - x
        }
    })
    
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
    
    // `node` is a patch
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

function parse_change(change) {
    var ret = { keys : [] }
    var re = /^(delete)\s+|\.?([^\.\[ =]+)|\[((\-?\d+)(:\-?\d+)?|'(\\'|[^'])*'|"(\\"|[^"])*")\]|\s*=\s*([\s\S]*)/g
    var m
    while (m = re.exec(change)) {
        if (m[1])
            ret.delete = true
        else if (m[2])
            ret.keys.push(m[2])
        else if (m[3] && m[5])
            ret.range = [
                JSON.parse(m[4]),
                JSON.parse(m[5].substr(1))
            ]
        else if (m[3])
            ret.keys.push(JSON.parse(m[3]))
        else if (m[8]) {
            ret.val = JSON.parse(m[8])
            rec(ret.val)
            function rec(x) {
                if (x && typeof(x) == 'object') {
                    if (x instanceof Array) {
                        for (var i = 0; i < x.length; i++) rec(x[i])
                    } else {
                        if (Object.keys(x).find(k => k == 'type' && x[k] == 'location')) {
                            x.id = Math.random().toString(36).slice(2)

                            ret.annotations = ret.annotations || {}
                            var path = parse_change(x.path).keys
                            ret.annotations[x.id] = {
                                keys: path.slice(0, path.length - 1),
                                pos: path[path.length - 1]
                            }
                        } else for (let k of Object.keys(x)) rec(x[k])
                    }
                }
            }
        }
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
