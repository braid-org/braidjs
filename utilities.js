// ===============================================
//
//   Utilities
//

// dict() is an alternative to {}.  It creates a clean hash table without any
// pre-existing keys, like .constructor or .prototype that are built into
// Javascript Objects.
var dict = () => Object.create({})

module.exports = require.utilities = {
    dict: dict,
    random_id: () => Math.random().toString(36).substr(2),

    // Maps a key to a set of values.
    //
    // If the value is not hashable, you can provide its hash using k2.
    one_to_many: () => {
        var data   = dict()
        var counts = dict()
        return {
            get (k) { return Object.values(data[k] || dict()) },
            add (k1, k2, value) {
                if (  data[k1] === undefined)   data[k1] = dict()
                if (counts[k1] === undefined) counts[k1] = 0
                if (!data[k1][k2]) counts[k1]++
                data[k1][k2] = value
            },
            delete (k, k2) { delete data[k][k2]; counts[k]-- },
            delete_all (k) { delete data[k]; delete counts[k] },
            has (k, k2)    { return data[k] && data[k][k2] },
            count (k)      { return counts[k] || 0}
        }
    },
    deep_equals,
}

assert = function () {
    if (!arguments[0]) {
        console.trace.apply(console, ['-Assert-', ...[...arguments].slice(1)])
        if (this.process)
            process.exit()
        else
            throw 'Bad'
    }
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


log = console.log.bind(console)