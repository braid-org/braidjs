function apply_patch (obj, range, content) {

    // Descend down a bunch of objects until we get to the final object
    // The final object can be a slice
    // Set the value in the final object

    var path = range,
        new_stuff = content

    var path_segment = /^(\.?([^\.\[]+))|(\[((-?\d+):)?(-?\d+)\])|\[("(\\"|[^"])*")\]/
    var curr_obj = obj,
        last_obj = null

    // Handle negative indices, like "[-9]" or "[-0]"
    function de_neg (x) {
        return x[0] === '-'
            ? curr_obj.length - parseInt(x.substr(1), 10)
            : parseInt(x, 10)
    }

    // Now iterate through each segment of the range e.g. [3].a.b[3][9]
    while (true) {
        var match = path_segment.exec(path),
            subpath = match ? match[0] : '',
            field = match && match[2],
            slice_start = match && match[5],
            slice_end = match && match[6],
            quoted_field = match && match[7]

        // The field could be expressed as ["nnn"] instead of .nnn
        if (quoted_field) field = JSON.parse(quoted_field)

        slice_start = slice_start && de_neg(slice_start)
        slice_end = slice_end && de_neg(slice_end)

        // console.log('Descending', {curr_obj, path, subpath, field, slice_start, slice_end, last_obj})

        // If it's the final item, set it
        if (path.length === subpath.length) {
            if (!subpath) return new_stuff
            else if (field) {                           // Object
                if (new_stuff === undefined)
                    delete curr_obj[field]              // - Delete a field in object
                else
                    curr_obj[field] = new_stuff         // - Set a field in object
            } else if (typeof curr_obj === 'string') {  // String
                console.assert(typeof new_stuff === 'string')
                if (!slice_start) {slice_start = slice_end; slice_end = slice_end+1}
                if (last_obj) {
                    var s = last_obj[last_field]
                    last_obj[last_field] = (s.slice(0, slice_start)
                                            + new_stuff
                                            + s.slice(slice_end))
                } else
                    return obj.slice(0, slice_start) + new_stuff + obj.slice(slice_end)
            } else                                     // Array
                if (slice_start)                       //  - Array splice
                    [].splice.apply(curr_obj, [slice_start, slice_end-slice_start]
                                    .concat(new_stuff))
            else {                                     //  - Array set
                console.assert(slice_end >= 0, 'Index '+subpath+' is too small')
                console.assert(slice_end <= curr_obj.length - 1,
                               'Index '+subpath+' is too big')
                curr_obj[slice_end] = new_stuff
            }

            return obj
        }

        // Otherwise, descend down the path
        console.assert(!slice_start, 'No splices allowed in middle of path')
        last_obj = curr_obj
        last_field = field || slice_end
        curr_obj = curr_obj[last_field]
        path = path.substr(subpath.length)
    }
}

module.exports = apply_patch
