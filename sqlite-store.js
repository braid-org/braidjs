
// options = {
//     table_name: 'store' // <-- default, a table of this name will be created in sqlite
// }
// options also passed down to 'store.js'
module.exports = require['sqlite-store'] = function create_sqlite_store(node, filename_base, options) {
    if (!options) options = {}
    if (options.table_name == null) options.table_name = 'store'

    var db = new (require('better-sqlite3'))(filename_base)
    db.pragma('journal_mode = WAL')
    db.prepare(`create table if not exists ${options.table_name} (key text primary key, val text)`).run()

    return require('./store.js')(node, Object.assign(options, {
        get(key) {
            var x = db.prepare(`select * from ${options.table_name} where key = ?`).get([key])
            return x && x.val
        },
        set(key, data) {
            db.prepare(`replace into ${options.table_name} (key, val) values (?, ?)`).run([key, data])
        },
        del(key) {
            db.prepare(`delete from ${options.table_name} where key = ?`).run([key])
        }        
    }))
}
