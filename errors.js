function report (method, error) {
    if (show_protocol_errors)
        console.log('PROTOCOL ERROR for ' + method + ': ' + error)
    throw error
}

module.exports = require.errors = (node) => ({
    
    get (args) {
        var {key, subscribe, version, parents, origin} = args
        //var key = args.key, subscribe = args.subscribe, parents = args.parents
        if (!key || typeof(key) !== 'string')
            report('get', 'invalid key' + JSON.stringify(key))

        log('get:', node.pid, key)

        var resource = node.resource_at(key)
        if (subscribe && subscribe.keep_alive
            && resource.keepalive_peers[origin.id])
            report('get', 'we already welcomed them')

        if (version && typeof(version) != 'string')
            report('get', 'invalid version: ' + JSON.stringify(version))

        if (parents && (typeof(parents) != 'object'
                        || Object.entries(parents).some(([k, v]) => v !== true)))
            report('get', 'invalid parents: ' + JSON.stringify(parents))
    },

    set (args) {
        var {key, version, parents, patches, origin, joiner_num} = args

        if (!key || typeof(key) !== 'string')
            throw report('set', 'invalid key: ' + JSON.stringify(key))

        var resource = node.resource_at(key)

        // If you're trying to join a persistent consistent group, then
        // you probably don't want to send any SETs before you actually
        // join and know what the current version is:
        if (origin && u.has_keep_alive(origin, key)
            && !resource.keepalive_peers[origin.id])
            report('set', 'we did not welcome them yet')

        if (!patches || !Array.isArray(patches)
            || patches.some(x => typeof(x) != 'string'))
            report('set', 'invalid patches: ' + JSON.stringify(patches))

        if (!version || typeof(version) != 'string')
            report('set', 'invalid version: ' + JSON.stringify(version))

        if (parents && (typeof(parents) != 'object'
                        || Object.entries(parents).some(([k, v]) => v !== true)))
            report('set', 'invalid parents: ' + JSON.stringify(parents))

        if (typeof(joiner_num) != 'undefined' && typeof(joiner_num) != 'number')
            report('set', 'invalid joiner_num: ' + JSON.stringify(joiner_num))
    },

    welcome (args) {
        var {key, versions, fissures, unack_boundary, min_leaves, parents, origin} = args
        // Sanity-check the input
        {
            if (!key || typeof(key) != 'string')
                report('welcome', 'invalid key: ' + JSON.stringify(key))

            var resource = node.resource_at(key)
            if (!resource.keepalive_peers[origin.id])
                report('welcome', 'we did not welcome them yet')

            if (!Array.isArray(versions) || !versions.every(v => {
                if (v.version && typeof(v.version) != 'string') return false
                if (!v.parents || typeof(v.parents) != 'object'
                    || Object.entries(v.parents).some(([k, v]) => v !== true)) return false
                if (!Array.isArray(v.patches)
                    || v.patches.some(x => typeof(x) != 'string')) return false
                if (v.hint) {
                    if (!v.hint.sort_keys) return false
                    if (typeof(v.hint.sort_keys) != 'object') return false
                    if (!Object.entries(v.hint.sort_keys).every(([index, key]) => (''+index).match(/^\d+$/) && typeof(key) == 'string')) return false
                }
                return true
            })) {
                report('welcome', 'invalid versions: ' + JSON.stringify(versions))
            }

            if (!Array.isArray(fissures) || !fissures.every(fissure => {
                if (!fissure || typeof(fissure) != 'object') return false
                if (typeof(fissure.a) != 'string') return false
                if (typeof(fissure.b) != 'string') return false
                if (typeof(fissure.conn) != 'string') return false
                if (!fissure.versions || typeof(fissure.versions) != 'object'
                    || !Object.entries(fissure.versions).every(([k, v]) => v === true)) return false
                if (!fissure.parents || typeof(fissure.parents) != 'object'
                    || !Object.entries(fissure.parents).every(([k, v]) => v === true)) return false
                if (typeof(fissure.time) != 'number') return false
                return true
            })) {
                report('welcome', 'invalid fissures: ' + JSON.stringify(fissures))
            }

            if (unack_boundary && (typeof(unack_boundary) != 'object'
                                   || !Object.entries(unack_boundary).every(
                                       ([k, v]) => v === true)))
                report('welcome', 'invalid unack_boundary: '+JSON.stringify(unack_boundary))

            if (min_leaves && (typeof(min_leaves) != 'object'
                               || !Object.entries(min_leaves).every(
                                   ([k, v]) => v === true)))
                report('welcome', 'invalid min_leaves: ' + JSON.stringify(min_leaves))
            
            if (parents && (typeof(parents) != 'object'
                               || !Object.entries(parents).every(
                                   ([k, v]) => v === true)))
                report('welcome', 'invalid parents: ' + JSON.stringify(parents))
        }
    },

    forget (args) {
        if (!key || typeof(key) != 'string')
            report('forget', 'invalid key: ' + JSON.stringify(key))
        if (!node.incoming_subscriptions.has(key, origin.id))
            report('forget', `pipe "${origin.id}" did not get the key "${key}" yet`)
    },

    ack (args) {
        var {key, valid, seen, version, origin, joiner_num} = args

        // guard against invalid messages
        if (typeof(key) !== 'string')
            report('ack', 'invalid key: ' + JSON.stringify(key))

        var resource = node.resource_at(key)
        if (!resource.keepalive_peers[origin.id])
            report('ack', 'we did not welcome them yet')

        if (typeof(valid) !== 'undefined')
            report('ack', 'support for valid flag not yet implemented')

            if (seen !== 'local' && seen !== 'global')
                report('ack', 'invalid seen: ' + JSON.stringify(seen))

            if (typeof(version) !== 'string')
                report('ack', 'invalid version: ' + JSON.stringify(version))

            if (typeof(joiner_num) != 'undefined' && typeof(joiner_num) != 'number')
                report('ack', 'invalid joiner_num: ' + JSON.stringify(joiner_num))
    },

    fissure ({key, fissure, origin}) {
        if (typeof(key) !== 'string')
            return report('fissure', 'invalid key: ' + JSON.stringify(key))

        var resource = node.resource_at(key)

        if ((!fissure          || typeof(fissure)          !== 'object') ||
            (!fissure.a        || typeof(fissure.a)        !== 'string') ||
            (!fissure.b        || typeof(fissure.b)        !== 'string') ||
            (!fissure.conn     || typeof(fissure.conn)     !== 'string') ||
            (!fissure.versions || typeof(fissure.versions) !== 'object'
             || !Object.entries(fissure.versions).every(([k, v]) => v === true)) ||
            (!fissure.parents || typeof(fissure.parents) !== 'object'
             || !Object.entries(fissure.parents).every(([k, v]) => v === true)) ||
            (typeof(fissure.time) !== 'number'))
        {
            report('fissure', 'invalid fissure: ' + JSON.stringify(fissure))
        }
    }
})