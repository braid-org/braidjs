// Greg: This version was adapted from sync9_041.html

module.exports = {
    create: sync9_create,
    set: function (patches, version, parents) {
        return sync9_add_version(this, version, parents, patches)
    },
    get: function (version) {
        return sync9_read_version(this, version)
    }
}


function sync9_extract_versions(x, is_anc, is_new_anc) {
    var versions = sync9_space_dag_extract_versions(sync9_space_dag_get(x.val.S, 0).S, x, is_anc, is_new_anc)
    versions.forEach(x => {
        x.patches = x.splices.map(x => {
            return `[${x[0]}:${x[0] + x[1]}] = ${JSON.stringify(x[2])}`
        })
        delete x.splices
    })
    return versions
}

function sync9_space_dag_extract_versions(S, s9, is_anc) {
    return Object.keys(s9.T).filter(x => !is_anc(x)).map(vid => {
        var v = {
            vid,
            parents : Object.assign({}, s9.T[vid]),
            splices : []
        }
        
        function add_result(offset, del, ins) {
            if (v.splices.length > 0) {
                var prev = v.splices[v.splices.length - 1]
                if (prev[0] + prev[1] == offset) {
                    prev[1] += del
                    prev[2] = prev[2].concat(ins)
                    return
                }
            }
            v.splices.push([offset, del, ins])
        }
        
        var ancs = sync9_get_ancestors(s9, {[vid]: true})
        delete ancs[vid]
        var offset = 0
        function helper(node, vid) {
            if (vid == v.vid) {
                add_result(offset, 0, node.elems.slice(0))
            } else if (node.deleted_by[v.vid] && node.elems.length > 0) {
                add_result(offset, node.elems.length, node.elems.slice(0, 0))
            }
            
            if (ancs[vid] && !Object.keys(node.deleted_by).some(x => ancs[x])) {
                offset += node.elems.length
            }
            
            for (var next of node.nexts)
                helper(next, next.vid)
            if (node.next) helper(node.next, vid)
        }
        helper(S, S.vid)
        return v
    })
}



function sync9_prune2(x, has_everyone_whos_seen_a_seen_b) {
    var seen_versions = {}
    var did_something = true
    function rec(x) {
        if (x && typeof(x) == 'object') {
            if (!x.t && x.val) {
                rec(x.val)
            } else if (x.t == 'val') {
                if (sync9_space_dag_prune2(x.S, has_everyone_whos_seen_a_seen_b, seen_versions)) did_something = true
                sync9_trav_space_dag(x.S, () => true, node => {
                    node.elems.forEach(rec)
                }, true)
            } else if (x.t == 'obj') {
                Object.values(x.S).forEach(v => rec(v))
            } else if (x.t == 'arr') {
                if (sync9_space_dag_prune2(x.S, has_everyone_whos_seen_a_seen_b, seen_versions)) did_something = true
                sync9_trav_space_dag(x.S, () => true, node => {
                    node.elems.forEach(rec)
                }, true)
            } else if (x.t == 'str') {
                if (sync9_space_dag_prune2(x.S, has_everyone_whos_seen_a_seen_b, seen_versions)) did_something = true
            }
        }
    }
    while (did_something) {
        seen_versions = {}
        did_something = false
        rec(x)
    }

    var delete_us = {}
    var children = {}
    Object.keys(x.T).forEach(y => {
        Object.keys(x.T[y]).forEach(z => {
            if (!children[z]) children[z] = {}
            children[z][y] = true
        })
    })
    Object.keys(x.T).forEach(y => {
        if (!seen_versions[y] && Object.keys(children[y] || {}).some(z => has_everyone_whos_seen_a_seen_b(y, z))) delete_us[y] = true
    })

    var visited = {}
    var forwards = {}
    function g(vid) {
        if (visited[vid]) return
        visited[vid] = true
        if (delete_us[vid])
            forwards[vid] = {}
        Object.keys(x.T[vid]).forEach(pid => {
            g(pid)
            if (delete_us[vid]) {
                if (delete_us[pid])
                    Object.assign(forwards[vid], forwards[pid])
                else
                    forwards[vid][pid] = true
            } else if (delete_us[pid]) {
                delete x.T[vid][pid]
                Object.assign(x.T[vid], forwards[pid])
            }
        })
    }
    Object.keys(x.leaves).forEach(g)
    Object.keys(delete_us).forEach(vid => delete x.T[vid])
    return delete_us
}

function sync9_space_dag_prune2(S, has_everyone_whos_seen_a_seen_b, seen_versions) {
    function set_nnnext(node, next) {
        while (node.next) node = node.next
        node.next = next
    }
    function process_node(node, offset, vid, prev) {
        var nexts = node.nexts
        var next = node.next
        
        var all_nexts_prunable = nexts.every(x => has_everyone_whos_seen_a_seen_b(vid, x.vid))
        if (nexts.length > 0 && all_nexts_prunable) {
            var first_prunable = 0
            var gamma = next
            if (first_prunable + 1 < nexts.length) {
                gamma = sync9_create_space_dag_node(null, typeof(node.elems) == 'string' ? '' : [])
                gamma.nexts = nexts.slice(first_prunable + 1)
                gamma.next = next
            }
            if (first_prunable == 0) {
                if (nexts[0].elems.length == 0 && !nexts[0].end_cap && nexts[0].nexts.length > 0) {
                    var beta = gamma
                    if (nexts[0].next) {
                        beta = nexts[0].next
                        set_nnnext(beta, gamma)
                    }
                    node.nexts = nexts[0].nexts
                    node.next = beta
                } else {
                    delete node.end_cap
                    node.nexts = []
                    node.next = nexts[0]
                    node.next.vid = null
                    set_nnnext(node, gamma)
                }
            } else {
                node.nexts = nexts.slice(0, first_prunable)
                node.next = nexts[first_prunable]
                node.next.vid = null
                set_nnnext(node, gamma)
            }
            return true
        }
        
        if (Object.keys(node.deleted_by).some(k => has_everyone_whos_seen_a_seen_b(vid, k))) {
            node.deleted_by = {}
            node.elems = node.elems.slice(0, 0)
            delete node.gash
            return true
        } else {
            Object.assign(seen_versions, node.deleted_by)
        }
        
        if (next && !next.nexts[0] && (Object.keys(next.deleted_by).some(k => has_everyone_whos_seen_a_seen_b(vid, k)) || next.elems.length == 0)) {
            node.next = next.next
            return true
        }
        
        if (nexts.length == 0 && next &&
            !(next.elems.length == 0 && !next.end_cap && next.nexts.length > 0) &&
            Object.keys(node.deleted_by).every(x => next.deleted_by[x]) &&
            Object.keys(next.deleted_by).every(x => node.deleted_by[x])) {
            node.elems = node.elems.concat(next.elems)
            node.end_cap = next.end_cap
            node.nexts = next.nexts
            node.next = next.next
            return true
        }
    }
    var did_something = false
    sync9_trav_space_dag(S, () => true, (node, offset, has_nexts, prev, vid) => {
        if (!prev) seen_versions[vid] = true
        while (process_node(node, offset, vid, prev)) {
            did_something = true
        }
    }, true)
    return did_something
}



function sync9_create() {
    return {
        T: {root : {}},
        leaves: {root: true},
        val: sync9_create_val()
    }
}

function sync9_add_version(x, vid, parents, patches, is_anc) {
    if (x.T[vid]) return
    x.T[vid] = Object.assign({}, parents)
    
    Object.keys(parents).forEach(k => {
        if (x.leaves[k]) delete x.leaves[k]
    })
    x.leaves[vid] = true
    
    if (!is_anc) {
        if (parents == x.leaves) {
            is_anc = (_vid) => _vid != vid
        } else {
            var ancs = sync9_get_ancestors(x, parents)
            is_anc = _vid => ancs[_vid]
        }
    }
    
    patches.forEach(patch => {
        var parse = sync9_parse_patch(patch)
        var cur = x.val
        parse.keys.forEach((key, i) => {
            if (cur.t == 'val') cur = sync9_space_dag_get(cur.S, 0, is_anc)
            if (!cur) throw 'bad'
            if (typeof(key) == 'string' && cur.t == 'obj') {
                if (!cur.S[key]) cur.S[key] = sync9_create_val()
                cur = cur.S[key]
            } else if (typeof(key) == 'number') {
                if (i == parse.keys.length - 1) {
                    parse.range = [key, key + 1]
                    parse.val = [parse.val]
                } else if (i < parse.keys.length - 1 && cur.t == 'arr') {
                    cur = sync9_space_dag_get(cur.S, key, is_anc)
                } else throw 'bad'
            } else {
                throw 'bad'
            }
        })
        if (!parse.range) {
            if (cur.t != 'val') throw 'bad'
            var len = sync9_space_dag_length(cur.S, is_anc)
            sync9_space_dag_add_version(cur.S, vid, [[0, len, [sync9_wrap(parse.val, vid)]]], is_anc)
        } else {
            if (cur.t == 'val') cur = sync9_space_dag_get(cur.S, 0, is_anc)
            if (parse.val instanceof Array && cur.t != 'arr') throw 'bad'
            if (parse.val instanceof String && cur.t != 'str') throw 'bad'
            if (parse.val instanceof Array) parse.val = parse.val.map(x => sync9_wrap(x, vid))
            sync9_space_dag_add_version(cur.S, vid, [[parse.range[0], parse.range[1] - parse.range[0], parse.val]], is_anc)
        }
    })
}

function sync9_read(x, is_anc) {
    if (!is_anc) is_anc = () => true
    if (x && typeof(x) == 'object') {
        if (!x.t && x.val) return sync9_read(x.val, is_anc)
        if (x.t == 'val') return sync9_read(sync9_space_dag_get(x.S, 0, is_anc), is_anc)
        if (x.t == 'obj') {
            var o = {}
            Object.entries(x.S).forEach(([k, v]) => {
                o[k] = sync9_read(v, is_anc)
            })
            return o
        }
        if (x.t == 'arr') {
            var a = []
            sync9_trav_space_dag(x.S, is_anc, (node) => {
                node.elems.forEach((e) => {
                    a.push(sync9_read(e, is_anc))
                })
            })
            return a
        }
        if (x.t == 'str') {
            var s = []
            sync9_trav_space_dag(x.S, is_anc, (node) => {
                s.push(node.elems)
            })
            return s.join('')
        }
    } return x
}

function sync9_read_version(s9, version) {
    if (version)
        var ancs = sync9_get_ancestors(s9, {[version]:true})
    return sync9_read(s9, ancs && (x=>ancs[x]))
}

function sync9_wrap(x, vid) {
    if (typeof(x) == 'number' || x == null || typeof(x) == 'boolean') {
        return x
    } else if (typeof(x) == 'string') {
        var s = sync9_create_str()
        sync9_space_dag_add_version(s.S, vid, [[0, 0, x]], _vid => _vid != vid)
        return s
    } else if (typeof(x) == 'object') {
        if (x instanceof Array) {
            var a = sync9_create_arr()
            sync9_space_dag_add_version(a.S, vid, [[0, 0, x.map(x => sync9_wrap(x, vid))]], _vid => _vid != vid)
            return a
        } else {
            var o = sync9_create_obj()
            Object.entries(x).forEach(([k, v]) => {
                var val = sync9_create_val()
                sync9_space_dag_add_version(val.S, vid, [[0, 0, [sync9_wrap(v, vid)]]], _vid => _vid != vid)
                o.S[k] = val
            })
            return o
        }
    } else throw 'bad'
}


function sync9_create_val() {
    return {
        t : 'val',
        S : sync9_create_space_dag_node('root', [])
    }
}

function sync9_create_obj() {
    return {
        t : 'obj',
        S : {}
    }
}

function sync9_create_arr() {
    return {
        t : 'arr',
        S : sync9_create_space_dag_node('root', [])
    }
}

function sync9_create_str() {
    return {
        t : 'str',
        S : sync9_create_space_dag_node('root', '')
    }
}

function sync9_create_space_dag_node(vid, elems, end_cap) {
    return {
        vid : vid,
        elems : elems,
        deleted_by : {},
        end_cap : end_cap,
        nexts : [],
        next : null
    }
}

function sync9_space_dag_get(S, i, is_anc) {
    var ret = null
    var offset = 0
    sync9_trav_space_dag(S, is_anc ? is_anc : () => true, (node) => {
        if (i - offset < node.elems.length) {
            ret = node.elems[i - offset]
            return false
        }
        offset += node.elems.length
    })
    return ret
}

function sync9_space_dag_length(S, is_anc) {
    var count = 0
    sync9_trav_space_dag(S, is_anc ? is_anc : () => true, node => {
        count += node.elems.length
    })
    return count
}

function sync9_space_dag_break_node(node, x, end_cap, new_next) {
    function subseq(x, start, stop) {
        return (x instanceof Array) ?
            x.slice(start, stop) :
            x.substring(start, stop)
    }
    
    var tail = sync9_create_space_dag_node(null, subseq(node.elems, x), node.end_cap)
    Object.assign(tail.deleted_by, node.deleted_by)
    tail.nexts = node.nexts
    tail.next = node.next
    
    node.elems = subseq(node.elems, 0, x)
    node.end_cap = end_cap
    if (end_cap) tail.gash = true
    node.nexts = new_next ? [new_next] : []
    node.next = tail
    
    return tail
}

function sync9_space_dag_add_version(S, vid, splices, is_anc) {
    
    function add_to_nexts(nexts, to) {
        var i = binarySearch(nexts, function (x) {
            if (to.vid < x.vid) return -1
            if (to.vid > x.vid) return 1
            return 0
        })
        nexts.splice(i, 0, to)
    }
    
    var si = 0
    var delete_up_to = 0
    
    var cb = (node, offset, has_nexts, prev, _vid, deleted) => {
        var s = splices[si]
        if (!s) return false
        
        if (deleted) {
            if (s[1] == 0 && s[0] == offset) {
                if (node.elems.length == 0 && !node.end_cap && has_nexts) return
                var new_node = sync9_create_space_dag_node(vid, s[2])
                if (node.elems.length == 0 && !node.end_cap)
                    add_to_nexts(node.nexts, new_node)
                else
                    sync9_space_dag_break_node(node, 0, undefined, new_node)
                si++
            }
            return            
        }
        
        if (s[1] == 0) {
            var d = s[0] - (offset + node.elems.length)
            if (d > 0) return
            if (d == 0 && !node.end_cap && has_nexts) return
            var new_node = sync9_create_space_dag_node(vid, s[2])
            if (d == 0 && !node.end_cap) {
                add_to_nexts(node.nexts, new_node)
            } else {
                sync9_space_dag_break_node(node, s[0] - offset, undefined, new_node)
            }
            si++
            return
        }
        
        if (delete_up_to <= offset) {
            var d = s[0] - (offset + node.elems.length)
            if (d >= 0) return
            delete_up_to = s[0] + s[1]
            
            if (s[2]) {
                var new_node = sync9_create_space_dag_node(vid, s[2])
                if (s[0] == offset && node.gash) {
                    if (!prev.end_cap) throw 'no end_cap?'
                    add_to_nexts(prev.nexts, new_node)
                } else {
                    sync9_space_dag_break_node(node, s[0] - offset, true, new_node)
                    return
                }
            } else {
                if (s[0] == offset) {
                } else {
                    sync9_space_dag_break_node(node, s[0] - offset)
                    return
                }
            }
        }
        
        if (delete_up_to > offset) {
            if (delete_up_to <= offset + node.elems.length) {
                if (delete_up_to < offset + node.elems.length) {
                    sync9_space_dag_break_node(node, delete_up_to - offset)
                }
                si++
            }
            node.deleted_by[vid] = true
            return
        }
    }
    
    var f = is_anc
    var exit_early = {}
    var offset = 0
    function helper(node, prev, vid) {
        var has_nexts = node.nexts.find(next => f(next.vid))
        var deleted = Object.keys(node.deleted_by).some(vid => f(vid))
        if (cb(node, offset, has_nexts, prev, vid, deleted) == false)
            throw exit_early
        if (!deleted) {
            offset += node.elems.length
        }
        for (var next of node.nexts)
            if (f(next.vid)) helper(next, null, next.vid)
        if (node.next) helper(node.next, node, vid)
    }
    try {
        helper(S, null, S.vid)
    } catch (e) {
        if (e != exit_early) throw e
    }
    
}

function sync9_trav_space_dag(S, f, cb, view_deleted, tail_cb) {
    var exit_early = {}
    var offset = 0
    function helper(node, prev, vid) {
        var has_nexts = node.nexts.find(next => f(next.vid))
        if (view_deleted ||
            !Object.keys(node.deleted_by).some(vid => f(vid))) {
            if (cb(node, offset, has_nexts, prev, vid) == false)
                throw exit_early
            offset += node.elems.length
        }
        for (var next of node.nexts)
            if (f(next.vid)) helper(next, null, next.vid)
        if (node.next) helper(node.next, node, vid)
        else if (tail_cb) tail_cb(node)
    }
    try {
        helper(S, null, S.vid)
    } catch (e) {
        if (e != exit_early) throw e
    }
}

function sync9_get_ancestors(x, vids) {
    var ancs = {}
    function mark_ancs(key) {
        if (!ancs[key]) {
            ancs[key] = true
            Object.keys(x.T[key]).forEach(mark_ancs)
        }
    }
    Object.keys(vids).forEach(mark_ancs)
    return ancs
}

function sync9_parse_patch(patch) {
    var result = { keys : [] }
    
    var re = /\.?([^\.\[ =]+)|\[((\-?\d+)(:\-?\d+)?|'(\\'|[^'])*'|"(\\"|[^"])*")\]|\s*=\s*(.*)/g
    var m
    while (m = re.exec(patch)) {
        if (m[1])
            result.keys.push(m[1])
        else if (m[2] && m[4])
            result.range = [
                JSON.parse(m[3]),
                JSON.parse(m[4].substr(1))
            ]
        else if (m[2])
            result.keys.push(JSON.parse(m[2]))
        else if (m[7])
            result.val = JSON.parse(m[7])
    }
    
    return result
}

function sync9_diff_ODI(a, b) {
    var offset = 0
    var prev = null
    var ret = []
    var d = diff_main(a, b)
    for (var i = 0; i < d.length; i++) {
        if (d[i][0] == 0) {
            if (prev) ret.push(prev)
            prev = null
            offset += d[i][1].length
        } else if (d[i][0] == 1) {
            if (prev)
                prev[2] += d[i][1]
            else
                prev = [offset, 0, d[i][1]]
        } else {
            if (prev)
                prev[1] += d[i][1].length
            else
                prev = [offset, d[i][1].length, '']
            offset += d[i][1].length
        }
    }
    if (prev) ret.push(prev)
    return ret
}

function sync9_guid() {
    var x = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    var s = []
    for (var i = 0; i < 15; i++)
        s.push(x[Math.floor(Math.random() * x.length)])
    return s.join('')
}

function sync9_create_proxy(x, cb, path) {
    path = path || ''
    var child_path = key => path + '[' + JSON.stringify(key) + ']'
    return new Proxy(x, {
        get : (x, key) => {
            if (['copyWithin', 'reverse', 'sort', 'fill'].includes(key))
                throw 'proxy does not support function: ' + key
            if (key == 'push') return function () {
                var args = Array.from(arguments)
                cb([path + '[' + x.length + ':' + x.length + '] = ' + JSON.stringify(args)])
                return x.push.apply(x, args)
            }
            if (key == 'pop') return function () {
                cb([path + '[' + (x.length - 1) + ':' + x.length + '] = []'])
                return x.pop()
            }
            if (key == 'shift') return function () {
                cb([path + '[0:1] = []'])
                return x.shift()
            }
            if (key == 'unshift') return function () {
                var args = Array.from(arguments)
                cb([path + '[0:0] = ' + JSON.stringify(args)])
                return x.unshift.apply(x, args)
            }
            if (key == 'splice') return function () {
                var args = Array.from(arguments)
                cb([child_path(key) + '[' + args[0] + ':' + (args[0] + args[1]) + '] = ' + JSON.stringify(args.slice(2))])
                return x.splice.apply(x, args)
            }
            
            var y = x[key]
            if (y && typeof(y) == 'object') {
                return sync9_create_proxy(y, cb, child_path(key))
            } else return y
        },
        set : (x, key, val) => {
            if (typeof(val) == 'string' && typeof(x[key]) == 'string') {
                cb(sync9_diff_ODI(x[key], val).map(splice => {
                    return child_path(key) + '[' + splice[0] + ':' + (splice[0] + splice[1]) + '] = ' + JSON.stringify(splice[2])
                }))
            } else {
                if ((x instanceof Array) && key.match(/^\d+$/)) key = +key
                cb([child_path(key) + ' = ' + JSON.stringify(val)])
            }
            x[key] = val
            return true
        }
    })
}

function sync9_prune(x, has_everyone_whos_seen_a_seen_b, has_everyone_whos_seen_a_seen_b_2) {
    var seen_versions = {}
    var did_something = true
    function rec(x) {
        if (x && typeof(x) == 'object') {
            if (!x.t && x.val) {
                rec(x.val)
            } else if (x.t == 'val') {
                if (sync9_space_dag_prune(x.S, has_everyone_whos_seen_a_seen_b, seen_versions)) did_something = true
                rec(sync9_space_dag_get(x.S, 0))
            } else if (x.t == 'obj') {
                Object.values(x.S).forEach(v => rec(v))
            } else if (x.t == 'arr') {
                if (sync9_space_dag_prune(x.S, has_everyone_whos_seen_a_seen_b, seen_versions)) did_something = true
                sync9_trav_space_dag(x.S, () => true, node => {
                    node.elems.forEach(e => rec(e))
                })
            } else if (x.t == 'str') {
                if (sync9_space_dag_prune(x.S, has_everyone_whos_seen_a_seen_b, seen_versions)) did_something = true
            }
        }
    }
    while (did_something) {
        did_something = false
        rec(x)
    }

    var visited = {}    
    var delete_us = {}
    function f(vid) {
        if (visited[vid]) return
        visited[vid] = true
        Object.keys(x.T[vid]).forEach(pid => {
            if (has_everyone_whos_seen_a_seen_b_2(pid, vid) && !seen_versions[pid]) {
                delete_us[pid] = true
            }
            f(pid)
        })
    }
    Object.keys(x.leaves).forEach(f)

    var visited = {}
    var forwards = {}
    function g(vid) {
        if (visited[vid]) return
        visited[vid] = true
        if (delete_us[vid])
            forwards[vid] = {}
        Object.keys(x.T[vid]).forEach(pid => {
            g(pid)
            if (delete_us[vid]) {
                if (delete_us[pid])
                    Object.assign(forwards[vid], forwards[pid])
                else
                    forwards[vid][pid] = true
            } else if (delete_us[pid]) {
                delete x.T[vid][pid]
                Object.assign(x.T[vid], forwards[pid])
            }
        })
    }
    Object.keys(x.leaves).forEach(g)
    Object.keys(delete_us).forEach(vid => delete x.T[vid])
    return delete_us
}

function sync9_space_dag_prune(S, has_everyone_whos_seen_a_seen_b, seen_versions) {
    function set_nnnext(node, next) {
        while (node.next) node = node.next
        node.next = next
    }
    function process_node(node, offset, vid, prev) {
        var nexts = node.nexts
        var next = node.next

        var first_prunable = nexts.findIndex(x => has_everyone_whos_seen_a_seen_b(vid, x.vid))
        if (first_prunable > 0 && (node.elems.length > 0 || !prev)) {
            first_prunable = nexts.findIndex((x, i) => (i > first_prunable) && has_everyone_whos_seen_a_seen_b(vid, x.vid))
        }
        
        if (first_prunable >= 0) {
            var gamma = next
            if (first_prunable + 1 < nexts.length) {
                gamma = sync9_create_space_dag_node(null, typeof(node.elems) == 'string' ? '' : [])
                gamma.nexts = nexts.slice(first_prunable + 1)
                gamma.next = next
            }
            if (first_prunable == 0) {
                if (nexts[0].elems.length == 0 && !nexts[0].end_cap && nexts[0].nexts.length > 0) {
                    var beta = gamma
                    if (nexts[0].next) {
                        beta = nexts[0].next
                        set_nnnext(beta, gamma)
                    }
                    node.nexts = nexts[0].nexts
                    node.next = beta
                } else {
                    delete node.end_cap
                    node.nexts = []
                    node.next = nexts[0]
                    node.next.vid = null
                    set_nnnext(node, gamma)
                }
            } else {
                node.nexts = nexts.slice(0, first_prunable)
                node.next = nexts[first_prunable]
                node.next.vid = null
                set_nnnext(node, gamma)
            }
            return true
        }
        
        if (Object.keys(node.deleted_by).some(k => has_everyone_whos_seen_a_seen_b(vid, k))) {
            node.deleted_by = {}
            node.elems = typeof(node.elems) == 'string' ? '' : []
            delete node.gash
            return true
        } else {
            Object.assign(seen_versions, node.deleted_by)
        }
        
        if (next && !next.nexts[0] && (Object.keys(next.deleted_by).some(k => has_everyone_whos_seen_a_seen_b(vid, k)) || next.elems.length == 0)) {
            node.next = next.next
            return true
        }
        
        if (nexts.length == 0 && next &&
            !(next.elems.length == 0 && !next.end_cap && next.nexts.length > 0) &&
            Object.keys(node.deleted_by).every(x => next.deleted_by[x]) &&
            Object.keys(next.deleted_by).every(x => node.deleted_by[x])) {
            node.elems = node.elems.concat(next.elems)
            node.end_cap = next.end_cap
            node.nexts = next.nexts
            node.next = next.next
            return true
        }
    }
    var did_something = false
    sync9_trav_space_dag(S, () => true, (node, offset, has_nexts, prev, vid) => {
        if (!prev) seen_versions[vid] = true
        while (process_node(node, offset, vid, prev)) {
            did_something = true
        }
    }, true)
    return did_something
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