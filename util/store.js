
// options = {
//     get(key) {},
//     set(key, data) {},
//     del(key) {},
//     list_keys() {},
//
//     compress_if_inactive_time: 4000 // <-- default, means it will compress 4 seconds after the last edit, as long as no other edits happen
//     compress_after_this_many: 10000 // <-- default, means it will compress if there are 10000 uncompressed edits
// }
module.exports = require.store = function create_store(node, options) {
    if (!options) options = {}
    if (options.compress_if_inactive_time == null) options.compress_if_inactive_time = 4000
    if (options.compress_after_this_many == null) options.compress_after_this_many = 10000

    options.set('pid', node.pid = options.get('pid') || node.pid)

    var nexts = {}
    for (var k of options.list_keys()) {
        if (k.match(/^ab:/)) {
            var ab = options.get(k)
            k = k.slice(3)
            var d
            for (var i = 0; d = options.get(`${ab}:${i}:${k}`); i++) {
                d = JSON.parse(d)
                if (!d.method) {
                    node.resources[k] = node.create_resource(d)
                    Object.values(node.resources[k].keepalive_peers).forEach(pipe => {
                        pipe.remote = true
                        node.bind(k, pipe)
                        node.gets_in.add(k, pipe.id, pipe)
                    })
                } else node[d.method](d.arg)
            }
            nexts[k] = [ab, i]
        }
    }

    function add(key, x) {
        var n = nexts[key]
        if (!n) {
            options.set(`ab:${key}`, 'a')
            n = nexts[key] = ['a', 0]
        }

        try {
        options.set(`${n[0]}:${n[1]++}:${key}`, JSON.stringify(x))
        } catch (e) {


            var shallow = rec(x, 5)
            function rec(x, n) {
                if (n < 0) return
                n--
                if (x && typeof(x) == 'object') {
                    var y = {}
                    Object.keys(x).forEach(k => {
                        y[k] = rec(x[k], n)
                    })
                    return y
                } else return x
            }



            console.log('e ' + Object.keys(x) + '::::' + JSON.stringify(shallow))
            throw 'stop'
        }
    }

    function compress(key) {
        var n = nexts[key]
        if (!n) return
        var ab = (n[0] == 'a') ? 'b' : 'a'
        for (var i = 0; options.get(`${ab}:${i}:${key}`); i++) {}
        for (i = i - 1; i >= 0; i--) options.del(`${ab}:${i}:${key}`)
        nexts[key] = [ab, 0]
        add(key, node.resource_at(key))
        options.set(`ab:${key}`, ab)
        for (i = n[1] - 1; i >= 0; i--) options.del(`${n[0]}:${i}:${key}`)
    }

    var inactive_timers = {}
    node.ons.push((method, arg) => {
        var key = arg.key
        add(key, {method, arg})

        var n = nexts[key]
        if (typeof(g_debug_WS_messages) != 'undefined') {
            if (n[1] >= options.compress_after_this_many)
                g_debug_WS_messages.push(() => compress(key))
        } else {
            clearTimeout(inactive_timers[key])
            inactive_timers[key] = setTimeout(() => compress(key), n[1] >= options.compress_after_this_many ? 0 : options.compress_if_inactive_time)
        }
    })

    Object.entries(node.resources).forEach(([key, r]) =>
        Object.values(r.keepalive_peers).forEach(pipe => {
            node.disconnected({key, origin: pipe})
        })
    )

    Object.keys(nexts).forEach(compress)

    return node
}
