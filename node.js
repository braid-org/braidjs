module.exports = function create_node() {
    var node = {}
    node.pid = random_id()
    node.keys = {}
    
    function get_key(key) {
        if (!node.keys[key]) node.keys[key] = require('./resource.js')({
            pid: node.pid,
            get: (conn, initial) => {
                node.on_get(key, initial, {conn})
            },
            set: (conn, version, parents, changes, joiner_num) => {
                node.on_set(key, changes, {version: version, parents: parents, conn}, joiner_num)
            },
            multiset: (conn, versions, fissures, conn_leaves, min_leaves) => {
                node.on_multiset(key, versions, fissures.map(x => ({
                    name: x.a + ':' + x.b + ':' + x.conn,
                    versions: x.versions,
                    parents: x.parents
                })), conn_leaves, min_leaves, {conn})
            },
            ack: (conn, version, joiner_num) => {
                node.on_ack(key, null, 'local', {version: version, conn}, joiner_num)
            },
            full_ack: (conn, version) => {
                node.on_ack(key, null, 'global', {version: version, conn})
            },
            fissure: (conn, fissure) => {
                node.on_disconnected(key, fissure.a + ':' + fissure.b + ':' + fissure.conn, fissure.versions, fissure.parents, {conn})
            }
        })

        return node.keys[key]
    }

    node.get = (key, initial, t) => {
        get_key(key).get(t.conn, initial)
    }
    
    node.set = (key, patches, t, joiner_num) => {
        get_key(key).set(t.conn, t.version, t.parents, patches, joiner_num)
    }
    
    node.multiset = (key, versions, fissures, conn_leaves, min_leaves, t) => {
        get_key(key).multiset(t.conn, versions, fissures.map(x => {
            var [a, b, conn] = x.name.split(/:/)
            return {a, b, conn, versions: x.versions, parents: x.parents}
        }), conn_leaves, min_leaves)
    }
    
    node.forget = (key, t) => {
        get_key(key).forget(t.conn)
    }
    
    node.ack = (key, valid, seen, t, joiner_num) => {
        if (seen == 'local') {
            get_key(key).ack(t.conn, t.version, joiner_num)
        } else if (seen == 'global') {
            get_key(key).full_ack(t.conn, t.version)
        }
    }
    
    node.disconnected = (key, name, versions, parents, t) => {
        // To do: make this work for read-only connections
        get_key(key).disconnected(t.conn, name, versions, parents)
    }
    
    node.delete = () => {
        // work here: idea: use "undefined" to represent deletion
    }

    node.connect = () => {
        console.log('Time to connect!', arguments)
        // ...
        // node.connections.add({
        //     id:
        //     citizen_id:
        //     ..methods
        // })

    }
    return node
}
