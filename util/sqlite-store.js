
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
        get(key, callback) {
            // synchronously call the callback
            let err = null,
                row = null
            try {
                row = GET_STATEMENT.get([key])
            }
            catch (e) {
                err = r
            }
            callback && callback(err, row && row.val)
        },
        set(key, data, callback) {
            let err = null
            try {
                SET_STATEMENT.run([key, data])
            }
            catch (e) {
                err = e
            }
            callback && callback(err, data)
        },
        del(key, callback) {
            let err = null
            try {
                DEL_STATEMENT.run([key])
            }
            catch (e) {
                err = e;
            }
            callback && callback(err)
        },
        list_keys(callback) {
            let err = null,
                keys = null
            try {
                keys = LIST_STATEMENT.all().map(x => x.key);
            }
            catch (e) {
                err = e
            }
            callback && callback(err, keys)
        }
    }
}
