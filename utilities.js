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
    }
}
