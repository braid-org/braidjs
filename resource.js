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
    resource.ancestors = (versions) => {
        var result = {}
        function recurse (version) {
            if (result[version]) return
            result[version] = true
            if (!resource.time_dag[version])
                throw 'The version '+version+' no existo'
            Object.keys(resource.time_dag[version]).forEach(recurse)
        }
        Object.keys(versions).forEach(recurse)
        return result
    }
    resource.citizens = () => Object.values(resource.connections).filter(c => c.pid)

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
   
    return resource
}
