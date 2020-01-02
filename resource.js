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


module.exports = function create_resource() {
    var resource = {}

    // The version history
    resource.time_dag = {}
    resource.current_version = {}
    resource.ancestors = (versions) => {
        var result = {}
        // console.log('ancestors:', versions)
        function recurse (version) {
            if (result[version]) return
            result[version] = true
            assert(resource.time_dag[version],
                   'The version '+version+' no existo')
            Object.keys(resource.time_dag[version]).forEach(recurse)
        }
        Object.keys(versions).forEach(recurse)
        return result
    }
    // A data structure that can merge simultaneous operations
    resource.mergeable = require('./merge-algorithms/sync9.js').create(resource)

    // The pipes that wanna hear about this resource
    // resource.subscriptions = {}

    // The pipes that throw a fissure when broken (prolly not needed anymore)
    // resource.citizens = () => Object.values(resource.subscriptions)
    // resource.citizens = () => Object.values(resource.pipes).filter(p => p.peer)

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
