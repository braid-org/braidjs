
// options = {
//     compress_if_inactive_time: 4000 // <-- default, means it will compress 4 seconds after the last edit, as long as no other edits happen
//     compress_after_this_many: 10000 // <-- default, means it will compress if there are 10000 uncompressed edits
// }
// db = {
//     get(key, cb)
//     set(key, val, cb)
//     del(key, cb)
//     list_keys(cb)
//}
module.exports = require.store = function create_store(node, db, options) {
    if (!options) options = {}
    if (options.compress_if_inactive_time == null) options.compress_if_inactive_time = 4000
    if (options.compress_after_this_many == null) options.compress_after_this_many = 10000

    var inactive_timers = {}
    var nexts = {}

    db.get('pid', (err, val) => {
        node.pid = val || node.pid
        db.set('pid', node.pid, (err) => {
            fastforward(register_compression);
        })
    })
    
    function fastforward(done_cb) {
        console.log("Fast-forwarding braid state using db...")
        // For all ab:... keys
        db.list_keys((err, keys) => {
            let ab_keys = keys.filter(k => k.match(/^ab:/));
            let n_callbacks_left = ab_keys.length;
            // This is why promises are nicer...
            let all_cb = () => {
                if (--n_callbacks_left == 0)
                    done_cb();
            }
            ab_keys.forEach(k => {
                db.get(k, (err, ab) => {
                    if (err)
                        console.error(err)
                    // Get the part after ab
                    // Sorry this isn't more informative, I do not understand the db format
                    let key = k.slice(3)
                    find_open_index(ab, 0, key, (i, val) => {
                        // Pass the stored braid messages to the node
                        let msg = JSON.parse(val)
                        if (!msg.method) {
                            node.resources[key] = node.create_resource(msg)
                            Object.values(node.resources[key].keepalive_peers).forEach(pipe => {
                                pipe.remote = true
                                node.bind(key, pipe)
                                node.incoming_subscriptions.add(key, pipe.id, pipe)
                            })
                        }
                        else node[msg.method](msg.arg)
                    }, i => {
                        // Set nexts once we've found the open index
                        nexts[key] = [ab, i];
                        // Count how many we have to do
                        all_cb();
                    })
                })
            })
        })
    }
    function register_compression() {
        node.ons.push((method, arg) => {
            var key = arg.key
            add(key, { method, arg })
    
            var n = nexts[key]
            if (typeof (g_debug_WS_messages) != 'undefined') {
                if (n[1] >= options.compress_after_this_many)
                    g_debug_WS_messages.push(() => compress(key))
            } else {
                clearTimeout(inactive_timers[key])
                inactive_timers[key] = setTimeout(() => compress(key), n[1] >= options.compress_after_this_many ? 0 : options.compress_if_inactive_time)
            }
        })
    
        Object.entries(node.resources).forEach(([key, r]) =>
            Object.values(r.keepalive_peers).forEach(pipe => {
                node.disconnected({ key, origin: pipe })
            })
        )
    
        Object.keys(nexts).forEach(compress)
    }

    function add(key, x, done_cb) {
        var n = nexts[key]
        if (!n)
            return db.set(`ab:${key}`, 'a', () => {
                nexts[key] = ['a', 0];
                add(key, x, done_cb);
            });

        // Try to set the key as the next element in the sequence
        db.set(`${n[0]}:${n[1]++}:${key}`, JSON.stringify(x), (err, _) => {
            // If it fails for some reason,
            if (err) {
                console.error(err);
                console.error(`Failed to set key ${n[0]}:${n[1]++}:${key} to value`);
                console.dir(x, { depth: 5 });
                throw err;
            }
            done_cb && done_cb();
        })
    }

    function compress(key) {
        var n = nexts[key]
        if (!n) return
        var ab = (n[0] == 'a') ? 'b' : 'a'
        find_open_index(ab, 0, key, (i, _) => {
            // Count up and delete
            db.del(`${ab}:${i}:${key}`)
        }, () => {
            // At the top
            nexts[key] = [ab, 0]
            add(key, node.resource_at(key), () => {
                db.set(`ab:${key}`, ab, (err, _) => {
                    for (var i = n[1] - 1; i >= 0; i--)
                        db.del(`${n[0]}:${i}:${key}`);
                })
            })
        })
    }
    function find_open_index(ab, i, key, not_done_cb, done_cb) {
        db.get(`${ab}:${i}:${key}`, (_, val) => {
            // We want to find the next i to insert
            // That is, the smallest one such that ab:i:key isn't defined
            if (!val)
                done_cb && done_cb(i)
            else {
                not_done_cb && not_done_cb(i, val)
                // Try the next index up
                find_open_index(ab, ++i, key, not_done_cb, done_cb)
            }
        })
    }

    return node
}
