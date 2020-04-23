
// options = {
//     get(key) {},
//     set(key, data) {},
//     del(key) {},
//
//     compress_chance: 0.1 // <-- default, means every message has 1/10 chance to compress the message list into a single "message"
// }
module.exports = require.store = function create_store(node, options) {
    if (!options) options = {}
    if (options.compress_chance == null) options.compress_chance = 0.1

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

    node.ons.push((method, args) => {
        if (Math.random() < options.compress_chance) compress()
        add({method, args})
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
