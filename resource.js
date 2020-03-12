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


module.exports = require.resource = function create_resource(resource = {}) {
    // The version history
    if (!resource.time_dag) resource.time_dag = {}
    if (!resource.current_version) resource.current_version = {}
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
    resource.mergeable = require('./merge-algorithms/sync9.js')(resource)

    // The pipes that wanna hear about this resource
    // resource.subscriptions = {}

    // The pipes that throw a fissure when broken (prolly not needed anymore)
    // resource.citizens = () => Object.values(resource.subscriptions)
    // resource.citizens = () => Object.values(resource.pipes).filter(p => p.peer)

    // Peers that we have sent a welcome message to
    if (!resource.we_welcomed) resource.we_welcomed = {}

    // Have we been welcomed yet?  (Has the data loaded?)
    if (!resource.weve_been_welcomed) resource.weve_been_welcomed = false

    // Disconnections that have occurred in the network without a forget()
    if (!resource.fissures) resource.fissures = {}

    // Acknowledgement data
    if (!resource.acked_boundary) resource.acked_boundary = {}
    if (!resource.unack_boundary) resource.unack_boundary = {}
    if (!resource.acks_in_process) resource.acks_in_process = {}

    // Empty versions sent to collapse outstanding parallel edits
    if (!resource.joiners) resource.joiners = {}
   
    return resource
}
