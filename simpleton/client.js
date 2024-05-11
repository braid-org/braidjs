// requires braid-http@0.3.14
// 
// url: simpleton resource endpoint
//
// apply_remote_update: ({patches, state}) => {...}
//     this is for incoming changes;
//     one of these will be non-null,
//     and can be applied to the current state.
//
// generate_local_diff_update: (prev_state) => {...}
//     this is to generate outgoing changes,
//     and if there are changes, returns { patches, state }
//
// returns { changed(): (diff_function) => {...} }
//     this is for outgoing changes;
//     diff_function = () => ({patches, new_version}).
//
function simpleton_client(url, { apply_remote_update, generate_local_diff_update }) {
    var peer = Math.random().toString(36).substr(2)
    var current_version = []
    var prev_state = ""
    var char_counter = -1
    var outstanding_changes = 0
    var max_outstanding_changes = 10

    braid_fetch_wrapper(url, {
        headers: { "Merge-Type": "simpleton" },
        subscribe: true,
        retry: true,
        parents: () => current_version.length ? current_version : null,
        peer
    }).then(res =>
        res.subscribe(update => {
            // Only accept the update if its parents == our current version
            update.parents.sort()
            if (current_version.length === update.parents.length
                && current_version.every((v, i) => v === update.parents[i])) {
                current_version = update.version.sort()
                update.state = update.body

                if (update.patches) {
                    for (let p of update.patches) p.range = p.range.match(/\d+/g).map((x) => 1 * x)
                    update.patches.sort((a, b) => a.range[0] - b.range[0])

                    // convert from code-points to js-indicies
                    let c = 0
                    let i = 0
                    for (let p of update.patches) {
                        while (c < p.range[0]) {
                            i += get_char_size(prev_state, i)
                            c++
                        }
                        p.range[0] = i

                        while (c < p.range[1]) {
                            i += get_char_size(prev_state, i)
                            c++
                        }
                        p.range[1] = i
                    }
                }

                prev_state = apply_remote_update(update)
            }
        })
    )
    
    return {
      changed: async () => {
        if (outstanding_changes >= max_outstanding_changes) return
        while (true) {
            var update = generate_local_diff_update(prev_state)
            if (!update) return   // Stop if there wasn't a change!
            var {patches, state} = update

            // convert from js-indicies to code-points
            let c = 0
            let i = 0
            for (let p of patches) {
                while (i < p.range[0]) {
                    i += get_char_size(prev_state, i)
                    c++
                }
                p.range[0] = c

                while (i < p.range[1]) {
                    i += get_char_size(prev_state, i)
                    c++
                }
                p.range[1] = c

                char_counter += p.range[1] - p.range[0]
                char_counter += count_code_points(p.content)

                p.unit = "text"
                p.range = `[${p.range[0]}:${p.range[1]}]`
            }

            var version = [peer + "-" + char_counter]

            var parents = current_version
            current_version = version
            prev_state = state

            outstanding_changes++
            await braid_fetch_wrapper(url, {
                headers: { "Merge-Type": "simpleton" },
                method: "PUT",
                retry: true,
                version, parents, patches,
                peer
            })
            outstanding_changes--
        }
      }
    }
}

function get_char_size(s, i) {
    const charCode = s.charCodeAt(i)
    return (charCode >= 0xd800 && charCode <= 0xdbff) ? 2 : 1
}

function count_code_points(str) {
    let code_points = 0
    for (let i = 0; i < str.length; i++) {
        if (str.charCodeAt(i) >= 0xd800 && str.charCodeAt(i) <= 0xdbff) i++
        code_points++
    }
    return code_points
}

async function braid_fetch_wrapper(url, params) {
    if (!params.retry) throw "wtf"
    var waitTime = 10
    if (params.subscribe) {
        var subscribe_handler = null
        connect()
        async function connect() {
            try {
                var c = await braid_fetch(url, { ...params, parents: params.parents?.() })
                c.subscribe((...args) => subscribe_handler?.(...args), on_error)
                waitTime = 10
            } catch (e) {
                on_error(e)
            }
        }
        function on_error(e) {
          console.log('eee = ' + e.stack)
            setTimeout(connect, waitTime)
            waitTime = Math.min(waitTime * 2, 3000)
        }
        return {subscribe: handler => { subscribe_handler = handler }}
    } else {
        return new Promise((done) => {
            send()
            async function send() {
                try {
                    var res = await braid_fetch(url, params)
                    if (res.status !== 200) throw "status not 200: " + res.status
                    done(res)
                } catch (e) {
                    setTimeout(send, waitTime)
                    waitTime = Math.min(waitTime * 2, 3000)
                }
            }
        })
    }
}
