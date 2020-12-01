module.exports = require.llww = (resource) => {
    resource.value = undefined

    return {
        add_version (version, parents, patches) {
            patches.forEach(patch => apply_patch(patch, resource))
        },

        read (version) {
            assert(!version)
            return resource.value
        },

        generate_braid (versions) {
            if (resource.value === undefined)
                return []
            assert(!versions || is_current_version(versions, resource))
            return [{
                patches: [` = ${JSON.stringify(resource.value)}`]
            }]
        }
    }
}

var is_current_version = (versions, resource) =>
    Object.keys(versions).length === Object.keys(resource.current_version).length
    && Object.keys(versions).every(v => resource.current_version[v] === true)


var parse_patch = require('../util/utilities.js').parse_patch
function apply_patch (patch, resource) {
    // Todo: Handle slices
    var parse = parse_patch(patch)
    console.log('applying', {parse, to: resource.value})
    if (parse.path.length > 0) {
        var target = resource.value
        for (var i = 0; i < parse.path.length - 1; i++)
            target = target[p]
        target[parse.patch.length] = parse.value
    }
    else
        resource.value = parse.value
}
