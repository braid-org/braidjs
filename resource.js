// Implementation of a `subscribable resource`.  Each subscribable resource
// has a URL, and supports:
//
//  - subscriptions
//  - acknowledgements
//  - connections and disconnections
//  - pruning
//  - and a merge-type.
//
// Right now it only works with the sync9 merge-type, which is implemented in
// the mergeables/ directory


module.exports = function create_resource(pid) {
    var resource = {}
    // resource.pid = conn_funcs.pid || random_id()
    resource.pid = pid || random_id()

    // The version history
    resource.time_dag = {}
    resource.current_version = {}
    resource.ancestors = function ancestors(versions) {
        var result = {}
        function recurse (version) {
            if (result[version]) return
            result[version] = true
            Object.keys(resource.time_dag[version]).forEach(recurse)
        }
        Object.keys(versions).forEach(recurse)
        return result
    }

    // A data structure that can merge simultaneous operations
    resource.mergeable = require('./merge-algorithms/sync9.js').create(resource)

    // The peers we are connected to, and whether they can send us edits
    resource.connections = {}

    // Disconnections that have occurred in the network without a forget()
    resource.fissures = {}

    // Acknowledgement data
    resource.acked_boundary = {}
    resource.unack_boundary = {}
    resource.acks_in_process = {}

    // Empty versions sent to collapse outstanding parallel edits
    resource.joiners = {}
    
    resource.prune = () => {
        var unremovable = {}
        Object.entries(resource.fissures).forEach(x => {
            if (!resource.fissures[x[1].b + ':' + x[1].a + ':' + x[1].conn]) {
                function f(y) {
                    if (!unremovable[y.a + ':' + y.b + ':' + y.conn]) {
                        unremovable[y.a + ':' + y.b + ':' + y.conn] = true
                        unremovable[y.b + ':' + y.a + ':' + y.conn] = true
                        Object.keys(y.parents).forEach(p => {
                            if (resource.fissures[p]) f(resource.fissures[p])
                        })
                    }
                }
                f(x[1])
            }
        })
        
        var acked = resource.ancestors(resource.acked_boundary)
        var done = {}
        Object.entries(resource.fissures).forEach(x => {
            var other_key = x[1].b + ':' + x[1].a + ':' + x[1].conn
            var other = resource.fissures[other_key]
            if (other && !done[x[0]] && !unremovable[x[0]]) {
                done[x[0]] = true
                done[other_key] = true
                
                if (Object.keys(x[1].versions).every(x => acked[x] || !resource.time_dag[x])) {
                    delete resource.fissures[x[0]]
                    delete resource.fissures[other_key]
                }
            }
        })
        
        var tags = {'null': {tags: {}}}
        var frozen = {}
        Object.keys(resource.time_dag).forEach(version => {
            tags[version] = {tags: {}}
        })
        function tag(version, t) {
            if (!tags[version].tags[t]) {
                tags[version].tags[t] = true
                Object.keys(resource.time_dag[version]).forEach(version => tag(version, t))
                tags[null].tags[t] = true
            }
        }
        Object.entries(resource.fissures).forEach(x => {
            Object.keys(x[1].versions).forEach(v => {
                if (!resource.time_dag[v]) return
                tag(v, v)
                frozen[v] = true
                Object.keys(resource.time_dag[v]).forEach(v => {
                    tag(v, v)
                    frozen[v] = true
                })
            })
        })
        var acked = resource.ancestors(resource.acked_boundary)
        Object.keys(resource.time_dag).forEach(x => {
            if (!acked[x] || resource.acked_boundary[x]) {
                tag(x, x)
                frozen[x] = true
                Object.keys(resource.time_dag[x]).forEach(v => {
                    tag(v, v)
                    frozen[v] = true
                })
            }
        })
        Object.entries(tags).forEach(x => {
            var keys = Object.keys(x[1].tags)
            if (keys.length == 0) {
                frozen[x[0]] = true
            } else if (!frozen[x[0]]) {
                x[1].tag = keys.sort().join(',')
            }
        })
        var q = (a, b) => {
            if (!a) a = 'null'
            return a && b && !frozen[a] && !frozen[b] && (tags[a].tag == tags[b].tag)
        }
        resource.mergeable.prune(q, q)

        var leaves = Object.keys(resource.current_version)
        var acked_boundary = Object.keys(resource.acked_boundary)
        var fiss = Object.keys(resource.fissures)
        if (leaves.length == 1 && acked_boundary.length == 1 && leaves[0] == acked_boundary[0] && fiss.length == 0) {
            resource.time_dag = {
                [leaves[0]]: {}
            }
            var val = resource.mergeable.read()
            resource.space_dag = (val && typeof(val) == 'object') ? {t: 'lit', S: val} : val
        }
    }
    
    return resource
}