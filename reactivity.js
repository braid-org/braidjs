// Example using a braid-peer in a reactive programming environment, and
// implementing reactive representations

function clean () {
    // 1. Collect all functions for all keys and dirtied getters
    var dirty_funks = new Set()
    for (var b in busses) {
        var fs = busses[b].rerunnable_funks()
        for (var i=0; i<fs.length; i++)
            dirty_funks.add(fs[i])
    }
    clean_timer = null

    // 2. Run any priority function first (e.g. file_store's on_set)
    dirty_funks = dirty_funks.values()
    log('Cleaning up', dirty_funks.length, 'funks')
    for (var i=0; i<dirty_funks.length; i++) {
        // console.log(funks[dirty_funks[i]].proxies_for)
        var p = funks[dirty_funks[i]].proxies_for
        if (p && p.priority) {
            log('Clean-early:', funk_name(funks[dirty_funks[i]]))
            funks[dirty_funks[i]].react()
            dirty_funks.splice(i,1)
            i--
        }
    }

    // 3. Re-run the functions
    for (var i=0; i<dirty_funks.length; i++) {
        log('Clean:', funk_name(funks[dirty_funks[i]]))
        if (bus.render_when_loading || !funks[dirty_funks[i]].loading())
            funks[dirty_funks[i]].react()
    }
    // log('We just cleaned up', dirty_funks.length, 'funks!')
}

function rerunnable_funks () {
    var result = []
    var keys = changed_keys.values()
    var getters = dirty_getters.values()

    //log(bus+' Cleaning up!', keys, 'keys, and', getters.length, 'getters')
    for (var i=0; i<keys.length; i++) {          // Collect all keys
        // if (to_be_forgotten[keys[i]])
        //     // Ignore changes to keys that have been forgotten, but not
        //     // processed yet
        //     continue
        var fs = bindings(keys[i], 'on_set')
        for (var j=0; j<fs.length; j++) {
            var f = fs[j].func
            if (bus.honk == 'todos')
                console.log("Make sure this func hasn't already run on this version.")
            if (false) {
                log('skipping', funk_name(f), 'already at version', versions[keys[i]], 'proof:', v)
                continue
            }
            if (f.react) {
                // Skip if it's already up to date
                var v = f.subscribed_to_keys[JSON.stringify([this.id, keys[i]])]
                //log('re-run:', keys[i], f.braid_id, f.subscribed_to_keys)

            } else {
                // Fresh handlers are always run, but need a wrapper
                f.seen_keys = f.seen_keys || {}
                var v = f.seen_keys[JSON.stringify([this.id, keys[i]])]
                autodetect_args(f)
                // initialize_sink(keys[i])
                console.log('running the on_set', f, 'for', keys[i], 'with sink',
                            sinks[keys[i]])
                f = run_handler(f, 'on_set', sinks[keys[i]].get(),
                                {dont_run: true, binding: keys[i]})
            }
            result.push(funk_key(f))
        }
    }
    for (var i=0; i<getters.length; i++)        // Collect all getters
        result.push(getters[i])

    changed_keys.clear()
    dirty_getters.clear()

    //log('found', result.length, 'funks to re run')

    return result
}