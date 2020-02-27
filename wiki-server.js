
// load node info from disk (or create new node if there's nothing on disk)

// if there are connections, create fissures for them (since we're just
// booting up, so we're clearly not connected to anything)

// setup websocket node server,
//     - on every relevant edit, append it to disk
//     - with some frequency, serialize the current state and flush the append-logs

var db = new (require('better-sqlite3'))('db.txt')
db.pragma('journal_mode = WAL')
db.prepare('create table if not exists store (key text primary key, val text)').run()

function create_persistor(key_base, get_key, set_key, del_key, get_data) {
    var a_or_b = get_key(key_base) || 'a'
    var d, data = []
    for (var next = 0; d = get_key(`${key_base}:${a_or_b}:${next}`); next++)
        data.push(d)
    return {
        data,
        add_data(data) {
            set_key(`${key_base}:${a_or_b}:${next++}`, data)
        },
        prune() {
            a_or_b = (a_or_b == 'a') ? 'b' : 'a'
            for (var i = 0; get_key(`${key_base}:${a_or_b}:${i}`); i++) {}
            for (i = i - 1; i >= 0; i--) del_key(`${key_base}:${a_or_b}:${i}`)

            var old_next = next
            next = 0
            this.add_data(get_data())
            set_key(key_base, a_or_b)

            for (i = old_next - 1; i >= 0; i--) del_key(`${key_base}:${(a_or_b == 'a') ? 'b' : 'a'}:${i}`)
        }
    }
}

var n = require('./node.js')()

var persistor = create_persistor('HIHI', key => {
    var x = db.prepare('select * from store where key = ?').get([key])
    return x && x.val
}, (key, data) => {
    db.prepare('replace into store (key, val) values (?, ?)').run([key, data])
}, key => {
    db.prepare('delete from store where key = ?').run([key])
}, () => JSON.stringify(n))

persistor.data



    // node.pid = u.random_id()
    // node.resources = {}
    
    // resource.time_dag = {}
    // resource.current_version = {}
    // resource.mergeable = require('./merge-algorithms/sync9.js')(resource)    

    // resource.fissures = {}

    // // Acknowledgement data
    // resource.acked_boundary = {}
    // resource.unack_boundary = {}
    // resource.acks_in_process = {}

    // // Empty versions sent to collapse outstanding parallel edits
    // resource.joiners = {}

})

persistor.add_data('hi!')
persistor.add_data('hi2!')
persistor.prune()
persistor.add_data('hi3!')


n.set('hi', null, '= {"a":5}')

console.log(JSON.stringify(n, null, '    '))


// print_network = true


// console.log(n)

// var wss = require('./networks/websocket-server.js')(n)

// console.log(wss)
