
// options = {
//     get(key) {},
//     set(key, data) {},
//     del(key) {},
//
//     compress_if_inactive_time: 4000 // <-- default, means it will compress 4 seconds after the last edit, as long as no other edits happen
//     compress_after_this_many: 10000 // <-- default, means it will compress if there are 10000 uncompressed edits
// }
module.exports = require.store = function create_store(node, options) {
    if (!options) options = {}
    if (options.compress_if_inactive_time == null) options.compress_if_inactive_time = 4000
    if (options.compress_after_this_many == null) options.compress_after_this_many = 10000

    var a_or_b = options.get('a_or_b') || 'a'
    node.init({})
    var d
    for (var next = 0; d = options.get(`${a_or_b}:${next}`); next++) {
        d = JSON.parse(d)

        // console.log('d = ' + JSON.stringify(d, null, '    '))

        if (d.resources) {
            node.init(d)

            Object.entries(node.resources).forEach(([k, r]) =>
                Object.values(r.we_welcomed).forEach(pipe => {
                    pipe.remote = true
                    node.bind(k, pipe)
                    node.gets_in.add(k, pipe.id)
                })
            )
        } else node[d.method](...d.args)
    }

    function add(x) {
        options.set(`${a_or_b}:${next++}`, JSON.stringify(x))
    }

    function compress() {
        a_or_b = (a_or_b == 'a') ? 'b' : 'a'
        for (var i = 0; options.get(`${a_or_b}:${i}`); i++) {}
        for (i = i - 1; i >= 0; i--) options.del(`${a_or_b}:${i}`)

        var old_next = next
        next = 0
        add(node)
        options.set('a_or_b', a_or_b)

        for (i = old_next - 1; i >= 0; i--)
            options.del(`${(a_or_b == 'a') ? 'b' : 'a'}:${i}`)
    }

    var inactive_timer = 0
    node.ons.push((method, args) => {
        add({method, args})

        if (typeof(g_debug_WS_messages) != 'undefined') {
            if (next >= options.compress_after_this_many)
                g_debug_WS_messages.push(compress)
        } else {
            clearTimeout(inactive_timer)
            inactive_timer = setTimeout(compress, next >= options.compress_after_this_many ? 0 : options.compress_if_inactive_time)
        }
    })

    Object.entries(node.resources).forEach(([key, r]) =>
        Object.values(r.we_welcomed).forEach(pipe => {
            node.disconnected({key, origin: pipe})
        })
    )

    compress()
    node.compress = compress
    return node
}
