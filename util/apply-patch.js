function apply_patch (obj, range, content) {

    // Descend down a bunch of objects until we get to the final object
    // The final object can be a slice
    // Set the value in the final object

    var path = range,
        new_stuff = content

    // We will break up the path into segments, like:
    //
    //   Path: ".foo.bar[3]"
    //
    //   Segments:
    //     - ".foo"
    //     - ".bar"
    //     - "[3]"

    var path_segment = /^(\.([^\.\[]+))|(\[((-?\d+):)?(-?\d+)\])/
    var curr_obj = obj,
        last_obj = null

    // Then we'll iterate through each segment, and descend into the obj.
    //
    // When we reach the *last* segment, we set its value to `content`, and
    // then we're done!

    do {

        // Grab the next segment from the path

        var match = path_segment.exec(path),
            subpath = match[0],
            field = match[2],
            slice_start = match[5],
            slice_end = match[6]

        slice_start = slice_start && de_neg(slice_start)
        slice_end = slice_end && de_neg(slice_end)

        // If this is not the last segment, then let's iterate one step deeper
        // into the object until we find the thing we're supposed to replace.

        if (path.length !== subpath.length) {
            console.assert(!slice_start, 'No splices allowed in middle of path')
            last_obj = curr_obj
            last_field = field
            curr_obj = curr_obj[field || slice_end]
            path = path.substr(subpath.length)
        }

        // Otherwise, we made it!  Let's replace the range with its new
        // contents!

        else {
            // There are 4 things we can set the values of:

            // Case 1: Object
            if (field)
                curr_obj[field] = new_stuff

            // Case 2: Strings
            else if (typeof curr_obj == 'string') {  // String
                console.assert(typeof new_stuff == 'string')
                if (!slice_start) {
                    slice_start = slice_end;
                    slice_end = slice_end+1
                }
                if (last_obj) {
                    var s = last_obj[last_field]
                    last_obj[last_field] = (s.slice(0, slice_start)
                                            + new_stuff
                                            + s.slice(slice_end))
                } else
                    return obj.slice(0, slice_start) + new_stuff + obj.slice(slice_end)
            
            }

            // Then it's an Array!  We have two ways to set an Array:
            else {
                // Case 3: Array Splice (e.g. [3:9] = [1]
                if (slice_start)
                    [].splice.apply(curr_obj, [slice_start, slice_end-slice_start]
                                    .concat(new_stuff))

                // Case 4: Array Set (e.g. [3] = true
                else {
                    console.assert(slice_end >= 0, 'Index '+subpath+' is too small')
                    console.assert(slice_end <= curr_obj.length - 1,
                                   'Index '+subpath+' is too big')
                    curr_obj[slice_end] = new_stuff
                }
            }

            return obj
        }

    } while (true)

    // This helper converts negative indices, like "[-9]" or "[-0]"
    function de_neg (x) {
        return x[0] === '-'
            ? curr_obj.length - parseInt(x.substr(1))
            : parseInt(x)
    }
}


if (require.main === module) {
    // Tests!
    console.log('\nTests:')
    console.log(apply_patch({a: 'b'}, '.a', 'c'))
    console.log(apply_patch([1,2,3], '[1]', 9))
    console.log(apply_patch([1,2,3], '[1:-0]', [10,100]))
    console.log(apply_patch([1,2,{a:'b'}], '[2].b', 9))
    console.log(apply_patch([1,2,{a:'b'}], '[2].a', 99))

    // Answer key
    console.log(`\nCorrect Answers:
{ a: 'c' }
[ 1, 9, 3 ]
[ 1, 10, 100 ]
[ 1, 2, { a: 'b', b: 9 } ]
[ 1, 2, { a: 99 } ]
`)
}