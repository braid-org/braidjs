// requires braid-http@0.3.8
// 
// url: simpleton resource endpoint
//
// apply_remote_update: ({patches, state}) => {...}
//     this is for incoming changes;
//     one of these will be non-null,
//     and can be applied to the current state.
//
// returns { changed(): (diff_function) => {...} }
//     this is for outgoing changes;
//     diff_function = () => ({patches, new_version}).
//
function simpleton_client(url, { apply_remote_update, generate_local_diff_update }) {
    var peer = Math.random().toString(36).substr(2)
    var current_version = []
    var prev_state = null
    var outstanding_changes = 0
    var max_outstanding_changes = 10

    braid_fetch_wrapper(url, {
        headers: { "Merge-Type": "simpleton" },
        subscribe: true,
        retry: true,
        parents: () => current_version,
        peer
    }).then(res =>
        res.subscribe(update => {
            // Only accept the update if its parents == our current version
            update.parents.sort()
            if (current_version.length === update.parents.length
                && current_version.every((v, i) => v === update.parents[i])) {
                current_version = update.version.sort()
                update.state = update.body
                prev_state = apply_remote_update(update)
            }
        })
    )
    
    return {
      changed: async () => {
        if (outstanding_changes >= max_outstanding_changes) return
        while (true) {
            var update = generate_local_diff_update({peer, prev_state})
            if (!update) return   // Stop if there wasn't a change!
            var {patches, version, state} = update
            
            var parents = current_version
            current_version = version.sort()
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
