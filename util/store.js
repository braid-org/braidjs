
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
module.exports = require.store = async function create_store(node, db, options) {
    if (!options) options = {}
    if (options.compress_if_inactive_time == null) options.compress_if_inactive_time = 4000
    if (options.compress_after_this_many == null) options.compress_after_this_many = 10000

    var inactive_timers = {}
    var nexts = {}

    let pid = await db.get('pid');
    node.pid = pid || node.pid;
    // Set the node's PID, and then play back the db into the node
    await db.set('pid', node.pid)
        .then(fastforward);

    // When something happens in the node, record it, and reset the the inactivity timer
    node.ons.push((method, arg) => {
        var key = arg.key
        add(key, { method, arg }).then(() => {

            var n = nexts[key]
            if (typeof (g_debug_WS_messages) != 'undefined') {
                if (n[1] >= options.compress_after_this_many)
                    g_debug_WS_messages.push(() => compress(key))
            } else {
                clearTimeout(inactive_timers[key])
                // If we've had enough messages, compress right away
                // Otherwise, compress in a few seconds
                inactive_timers[key] = setTimeout(() => compress(key),
                    n[1] >= options.compress_after_this_many ? 0 : options.compress_if_inactive_time)
            }
        });
    })
    // Ensure the node knows that it's totally disconnected at startup.
    Object.entries(node.resources).forEach(([key, r]) =>
        Object.values(r.keepalive_peers).forEach(pipe => {
            node.disconnected({ key, origin: pipe })
        })
    )

    return Promise.all(Object.keys(nexts).map(compress)).then(_ => node);

    async function fastforward() {
        console.log("Fast-forwarding braid state using db...")
        // For all ab:... keys
        let keys = await db.list_keys();
        await Promise.all(keys
            .filter(k => k.match(/^ab:/))
            .map(async (k) => {
                let ab = await db.get(k);
                // Get the part after ab
                // Sorry this isn't more informative, I do not understand the db format
                let key = k.slice(3)
                return find_open_index(ab, key, async (val) => {
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
                }).then(i => {
                    // Set nexts once we've found the open index
                    nexts[key] = [ab, i];
                })
            })
        )
    }

    async function add(key, x) {
        var n = nexts[key]
        if (!n) {
            await db.set(`ab:${key}`, 'a');
            n = nexts[key] = ['a', 0]
        }
        // Try to set the key as the next element in the sequence
        await db.set(`${n[0]}:${n[1]++}:${key}`, JSON.stringify(x))
        .catch(err => {
            console.error(err);
            console.error(`Failed to set key ${n[0]}:${n[1]++}:${key} to value`);
            console.dir(x, { depth: 5 });
        })
        
    }
    async function compress(key) {
        var n = nexts[key]
        if (!n) return
        var ab = (n[0] == 'a') ? 'b' : 'a'
        let i = await find_open_index(ab, key, (_, ii) => 
            // Count up and delete
            db.del(`${ab}:${ii}:${key}`)
        )
        // At the top
        nexts[key] = [ab, 0]
        await add(key, node.resource_at(key));
        await db.set(`ab:${key}`, ab)
        for (let ii = n[1] - 1; ii >= 0; ii--)
            await db.del(`${n[0]}:${ii}:${key}`)
    }

    async function find_open_index(ab, key, intermediate) {
        let i = 0;
        let val;
        while (val = await db.get(`${ab}:${i}:${key}`)) {
            // Do something with the lower values of i
            intermediate && await intermediate(val, i++);
        }
        return i;
    }
}
