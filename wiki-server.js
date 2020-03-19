var db = new (require('better-sqlite3'))('db.sqlite')
db.pragma('journal_mode = WAL')
db.prepare('create table if not exists store (key text primary key, val text)').run()

function create_persistent_node(key_base, get_key, set_key, del_key) {
    var a_or_b = get_key(key_base) || 'a'

    var d, node = null
    for (var next = 0; d = get_key(`${key_base}:${a_or_b}:${next}`); next++) {
        d = JSON.parse(d)
        if (d.resources) {
            delete d.ons
            node = require('./node.js')(d)

            Object.entries(node.resources).forEach(resource =>
                Object.values(resource[1].we_welcomed).forEach(pipe =>
                    pipe.remote = true
                    node.bind(resource[0], pipe)
                )
            )

        } else {
            if (!node) node = require('./node.js')()
            node[d.method](...d.args)
        }
    }
    if (!node) node = require('./node.js')()

    Object.entries(node.resources).forEach(resource =>
        Object.values(resource[1].we_welcomed).forEach(pipe =>
            node.disconnected({key: resource[0], origin: pipe})
        )
    )

    function add(x) {
        set_key(`${key_base}:${a_or_b}:${next++}`, JSON.stringify(x))
    }

    function prune() {
        a_or_b = (a_or_b == 'a') ? 'b' : 'a'
        for (var i = 0; get_key(`${key_base}:${a_or_b}:${i}`); i++) {}
        for (i = i - 1; i >= 0; i--) del_key(`${key_base}:${a_or_b}:${i}`)

        var old_next = next
        next = 0
        add(node)
        set_key(key_base, a_or_b)

        for (i = old_next - 1; i >= 0; i--)
            del_key(`${key_base}:${(a_or_b == 'a') ? 'b' : 'a'}:${i}`)
    }

    node.ons.push((method, args) => {
        add({method, args})
        if (Math.random() < 0.1) prune()
    })

    return node
}

var node = create_persistent_node('HIHI', key => {
    var x = db.prepare('select * from store where key = ?').get([key])
    return x && x.val
}, (key, data) => {
    db.prepare('replace into store (key, val) values (?, ?)').run([key, data])
}, key => {
    db.prepare('delete from store where key = ?').run([key])
})

var wss = require('./networks/websocket-server.js')(node)

show_debug = true
print_network = true
