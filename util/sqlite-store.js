
// options = {
//     table_name: 'store' // <-- default, a table of this name will be created in sqlite
// }
// options also passed down to 'store.js'
module.exports = require['sqlite-store'] = function create_sqlite_store(filename, tablename) {
    var db = new (require('better-sqlite3'))(filename)
    if (!tablename)
        tablename = 'store'

    db.pragma('journal_mode = WAL')
    db.prepare(`create table if not exists ${tablename} (key text primary key, val text)`).run()

    const GET_STATEMENT = db.prepare(`select * from ${tablename} where key = ?`)
    const SET_STATEMENT = db.prepare(`replace into ${tablename} (key, val) values (?, ?)`)
    const DEL_STATEMENT = db.prepare(`delete from ${tablename} where key = ?`)
    const LIST_STATEMENT = db.prepare(`select key from ${tablename}`);
    return {
        async get(key) {
            var row = GET_STATEMENT.get([key])
            return row && row.val
        },
        async set(key, data) {
            SET_STATEMENT.run([key, data])
        },
        async del(key) {
            DEL_STATEMENT.run([key])
        },
        async list_keys() {
            return LIST_STATEMENT.all().map(x => x.key);
        }
    }
}
