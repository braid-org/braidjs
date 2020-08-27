// These 5 lines generate a module that can be included with CommonJS and <script> tags.
(function(name, definition) {
    var nodejs = typeof window === 'undefined'
    if (nodejs) module.exports = definition()
    else this[name] = definition()
}('statebus', function() {statelog_indent = 0; var busses = {}, executing_funk, global_funk, funks = {}, clean_timer, symbols, nodejs = typeof window === 'undefined'; function make_bus (options) {

    // ****************
    // Fetch, Save, Forget, Delete

    function fetch (key, callback) {
        key = key.key || key    // You can pass in an object instead of key
                                // We should probably disable this in future
        if (typeof key !== 'string')
            throw ('Error: fetch(key) called with a non-string key: '+key)
        bogus_check(key)

        var called_from_reactive_funk = !callback
        var funk = callback || executing_funk

        // Initialize callback
        if (callback) {
            (callback.defined = callback.defined || []
            ).push({as:'fetch callback', key:key});
            callback.has_seen = callback.has_seen || function (bus, key, version) {
                callback.seen_keys = callback.seen_keys || {}
                var bus_key = JSON.stringify([bus.id, key])
                var seen_versions =
                    callback.seen_keys[bus_key] = callback.seen_keys[bus_key] || []
                seen_versions.push(version)
                if (seen_versions.length > 50) seen_versions.shift()
            }
        }

        // ** Subscribe the calling funk **

        fetches_in.add(key, funk_key(funk))
        if (to_be_forgotten[key]) {
            clearTimeout(to_be_forgotten[key])
            delete to_be_forgotten[key]
        }

        bind(key, 'on_save', funk)

        // ** Call fetchers upstream **

        // TODO: checking fetches_out[] doesn't count keys that we got which
        // arrived nested within a bigger object, because we never explicity
        // fetched those keys.  But we don't need to fetch them now cause we
        // already have them.
        var to_fetchers = 0
        if (!fetches_out[key])
            to_fetchers = bus.route(key, 'to_fetch', key)

        // Now there might be a new value pubbed onto this bus.
        // Or there might be a pending fetch.
        // ... or there weren't any fetchers upstream.


        // ** Return a value **

        // If called reactively, we always return a value.
        if (called_from_reactive_funk) {
            funk.has_seen(bus, key, versions[key])
            backup_cache[key] = backup_cache[key] || {key: key}
            return cache[key] = cache[key] || {key: key}
        }

        // Otherwise, we want to make sure that a pub gets called on the
        // handler.  If there's a pending fetch, then it'll get called later.
        // If there was a to_fetch, then it already got called.  Otherwise,
        // let's call it now.
        else if (!pending_fetches[key] && to_fetchers === 0) {
            // TODO: my intuition suggests that we might prefer to
            // delay this .on_save getting called in a
            // setTimeout(f,0), to be consistent with other calls to
            // .on_save.
            backup_cache[key] = backup_cache[key] || {key: key}
            run_handler(funk, 'on_save', cache[key] = cache[key] || {key: key})
        }
    }
    function fetch_once (key, cb) {
        function cb2 (o) { cb(o); forget(key, cb2) }
        // fetch(key)   // This prevents key from being forgotten
        fetch(key, cb2)
    }
    fetch.once = fetch_once
    var pending_fetches = {}
    var fetches_out = {}                // Maps `key' to `func' iff we've fetched `key'
    var fetches_in = new One_To_Many()  // Maps `key' to `pub_funcs' subscribed to our key

    var currently_saving
    function save (obj, t) {
        // First let's handle diffs
        if (typeof obj === 'string' && t && t.patch) {
            if (typeof t.patch == 'string') t.patch = [t.patch]
            // Apply the patch locally
            obj = apply_patch(bus.cache[obj] || {key: obj}, t.patch[0])
        }

        if (!('key' in obj) || typeof obj.key !== 'string')
            console.error('Error: save(obj) called on object without a key: ', obj)
        bogus_check(obj.key)

        t = t || {}
        // Make sure it has a version.
        t.version = t.version || new_version()

        if ((executing_funk !== global_funk) && executing_funk.loading()) {
            abort_changes([obj.key])
            return
        }

        if (honking_at(obj.key))
            var message = save_msg(obj, t, 'save')

        // Ignore if nothing happened
        if (obj.key && !changed(obj)) {
            statelog(obj.key, grey, 'x', message)
            return
        } else
            statelog(obj.key, red, 'o', message)

        try {
            statelog_indent++
            var was_saving = currently_saving
            currently_saving = obj.key

            // Call the to_save() handlers!
            var num_handlers = bus.route(obj.key, 'to_save', obj, t)
            if (num_handlers === 0) {
                // And fire if there weren't any!
                save.fire(obj, t)
                bus.route(obj.key, 'on_set_sync', obj, t)
            }
        }
        finally {
            statelog_indent--
            currently_saving = was_saving
        }
        // TODO: Here's an alternative.  Instead of counting the handlers and
        // seeing if there are zero, I could just make a to_save handler that
        // is shadowed by other handlers if I can get later handlers to shadow
        // earlier ones.
    }
    save.fire = fire
    function fire (obj, t) {
        t = t || {}
        // Make sure it has a version.
        t.version = t.version || new_version()

        // Print a statelog entry
        if (obj.key && honking_at(obj.key)) {
            // Warning: Changes to *nested* objects will *not* be printed out!
            // In the future, we'll remove the recursion from fire() so that
            // nested objects aren't even changed.
            var message = save_msg(obj, t, 'save.fire')
            var color, icon
            if (currently_saving === obj.key &&
                !(obj.key && !changed(obj))) {
                statelog_indent--
                statelog(obj.key, red, '•', '↵' +
                         (t.version ? '\t\t\t[' + t.version + ']' : ''))
                statelog_indent++
            } else {
                // Ignore if nothing happened
                if (obj.key && !changed(obj)) {
                    color = grey
                    icon = 'x'
                    if (t.to_fetch)
                        message = (t.m) || 'Fetched ' + bus + "('"+obj.key+"')"
                    if (t.version) message += ' [' + t.version + ']'
                    statelog(obj.key, color, icon, message)
                    return
                }

                color = red, icon = '•'
                if (t.to_fetch || pending_fetches[obj.key]) {
                    color = green
                    icon = '^'
                    message = add_diff_msg((t.m)||'Fetched '+bus+"('"+obj.key+"')",
                                           obj)
                    if (t.version) message += ' [' + t.version + ']'
                }

                statelog(obj.key, color, icon, message)
            }
        }
        // Then we're gonna fire!

        // Recursively add all of obj, and its sub-objects, into the cache
        var modified_keys = update_cache(obj, cache)

        delete pending_fetches[obj.key]

        if ((executing_funk !== global_funk) && executing_funk.loading()) {
            abort_changes(modified_keys)
        } else {
            // Let's publish these changes!

            // These objects must replace their backups
            update_cache(obj, backup_cache)

            // And we mark each changed key as changed so that
            // reactions happen to them
            for (var i=0; i < modified_keys.length; i++) {
                var key = modified_keys[i]
                var parents = [versions[key]]   // Not stored yet
                versions[key] = t.version
                mark_changed(key, t)
            }
        }
    }

    save.abort = function (obj, t) {
        if (!obj) console.error('No obj', obj)
        abort_changes([obj.key])
        statelog(obj.key, yellow, '<', 'Aborting ' + obj.key)
        mark_changed(obj.key, t)
    }

    var version_count = 0
    function new_version () {
        return (bus.label||(id+' ')) + (version_count++).toString(36)
    }

    // Now create the statebus object
    function bus (arg) {
        // Called with a function to react to
        if (typeof arg === 'function') {
            var f = reactive(arg)
            f()
            return f
        }

        // Called with a key to produce a subspace
        else return subspace(arg)
    }
    var id = 'bus ' + Math.random().toString(36).substring(7)
    bus.toString = function () { return bus.label || id }
    bus.delete_bus = function () {
        // // Forget all wildcard handlers
        // for (var i=0; i<wildcard_handlers.length; i++) {
        //     console.log('Forgetting', funk_name(wildcard_handlers[i].funk))
        //     wildcard_handlers[i].funk.forget()
        // }

        // // Forget all handlers
        // for (var k1 in handlers.hash)
        //     for (var k2 in handlers.hash[k])
        //         handlers.hash[k][k2].forget()

        delete busses[bus.id]
    }

    // The Data Almighty!!
    var cache = {}
    var backup_cache = {}
    var versions = {}

    // Folds object into the cache recursively and returns the keys
    // for all mutated staet
    function update_cache (object, cache) {
        var modified_keys = new Set()
        function update_object (obj) {

            // Two ways to optimize this in future:
            //
            // 1. Only clone objects/arrays if they are new.
            //
            //    Right now we re-clone all internal arrays and objects on
            //    each pub.  But we really only need to clone them the first
            //    time they are pubbed into the cache.  After that, we can
            //    trust that they aren't referenced elsewhere.  (We make it
            //    the programmer's responsibility to clone data if necessary
            //    on fetch, but not when on pub.)
            //
            //    We'll optimize this once we have history.  We can look at
            //    the old version to see if an object/array existed already
            //    before cloning it.
            //
            // 2. Don't go infinitely deep.
            //
            //    Eventually, each save/pub will be limited to the scope
            //    underneath nested keyed objects.  Right now I'm just
            //    recursing infinitely on the whole data structure with each
            //    pub.

            // Clone arrays
            if (Array.isArray(obj))
                obj = obj.slice()

            // Clone objects
            else if (typeof obj === 'object'
                     && obj        // That aren't null
                     && !(obj.key  // That aren't already in cache
                          && cache[obj.key] === obj)) {
                var tmp = {}; for (var k in obj) tmp[k] = obj[k]; obj = tmp
            }

            // Inline pointers
            if ((nodejs ? global : window).pointerify && obj && obj._key) {
                if (Object.keys(obj).length > 1)
                    console.error('Got a {_key: ...} object with additional fields')
                obj = bus.cache[obj._key] = bus.cache[obj._key] || {key: obj._key}
            }

            // Fold cacheable objects into cache
            else if (obj && obj.key) {
                bogus_check(obj.key)

                if (cache !== backup_cache)
                    if (changed(obj))
                        modified_keys.add(obj.key)
                    else
                        log('Boring modified key', obj.key)
                if (!cache[obj.key])
                    // This object is new.  Let's store it.
                    cache[obj.key] = obj

                else if (obj !== cache[obj.key]) {
                    // Else, mutate cache to match the object.

                    // First, add/update missing/changed fields to cache
                    for (var k in obj)
                        if (cache[obj.key][k] !== obj[k])
                            cache[obj.key][k] = obj[k]

                    // Then delete extra fields from cache
                    for (var k in cache[obj.key])
                        if (!obj.hasOwnProperty(k))
                            delete cache[obj.key][k]
                }
                obj = cache[obj.key]
            }

            return obj
        }
        deep_map(object, update_object)
        return modified_keys.values()
    }

    function changed (object) {
        return pending_fetches[object.key]
            || !       cache.hasOwnProperty(object.key)
            || !backup_cache.hasOwnProperty(object.key)
            || !(deep_equals(object, backup_cache[object.key]))
    }
    function abort_changes (keys) {
        for (var i=0; i < keys.length; i++)
            update_cache(backup_cache[keys[i]], cache)
    }


    function forget (key, save_handler) {
        if (arguments.length === 0) {
            // Then we're forgetting the executing funk
            console.assert(executing_funk !== global_funk,
                           'forget() with no arguments forgets the currently executing reactive function.\nHowever, there is no currently executing reactive function.')
            executing_funk.forget()
            return
        }
        bogus_check(key)

        //log('forget:', key, funk_name(save_handler), funk_name(executing_funk))
        save_handler = save_handler || executing_funk
        var fkey = funk_key(save_handler)
        //console.log('Fetches in is', fetches_in.hash)
        if (!fetches_in.has(key, fkey)) {
            console.error("***\n****\nTrying to forget lost key", key,
                          'from', funk_name(save_handler), fkey,
                          "that hasn't fetched that key.")
            console.trace()
            return
            // throw Error('asdfalsdkfajsdf')
        }

        fetches_in.delete(key, fkey)
        unbind(key, 'on_save', save_handler)

        // If this is the last handler listening to this key, then we can
        // delete the cache entry, send a forget upstream, and de-activate the
        // .on_fetch handler.
        if (!fetches_in.has_any(key)) {
            clearTimeout(to_be_forgotten[key])
            to_be_forgotten[key] = setTimeout(function () {
                // Send a forget upstream
                bus.route(key, 'to_forget', key)

                // Delete the cache entry...?
                // delete cache[key]
                delete fetches_out[key]
                delete to_be_forgotten[key]
            }, 200)
        }
    }
    function del (key) {
        key = key.key || key   // Prolly disable this in future
        bogus_check(key)

        if ((executing_funk !== global_funk) && executing_funk.loading()) {
            abort_changes([key])
            return
        }

        statelog(key, yellow, 'v', 'Deleting ' + key)
        // Call the to_delete handlers
        var handlers_called = bus.route(key, 'to_delete', key)
        if (handlers_called === 0)
            // And go ahead and delete if there aren't any!
            delete cache[key]

        // console.warn("Deleting " + key + "-- Statebus doesn't yet re-run functions subscribed to it, or update versions")

        // Todos:
        //
        //  - Add transactions, so you can check permissions, abort a delete,
        //    etc.
        //    - NOTE: I did a crappy implementation of abort just now above!
        //      But it doesn't work if called after the to_delete handler returns.
        //    - Generalize the code across save and del with a "mutate"
        //      operation
        //
        //  - Right now we fire the to_delete handlers right here.
        //
        //    - Do we want to batch them up and fire them later?
        //      e.g. we could make a mark_deleted(key) like mark_changed(key)
        //
        //    - We might also record a new version of the state to show that
        //      it's been deleted, which we can use to cancel echoes from the
        //      sending bus.

    }

    var changed_keys = new Set()
    var dirty_fetchers = new Set()
    function dirty (key, t) {
        statelog(key, brown, '*', bus + ".dirty('"+key+"')")
        bogus_check(key)

        // Find any .to_fetch, and mark as dirty so that it re-runs
        var found = false
        if (fetches_out.hasOwnProperty(key))
            for (var i=0; i<fetches_out[key].length; i++) {
                dirty_fetchers.add(funk_key(fetches_out[key][i]))
                found = true
            }
        clean_timer = clean_timer || setTimeout(clean)

        // If none found, then just mark the key changed
        if (!found && cache.hasOwnProperty(key)) mark_changed(key, t)
    }

    function mark_changed (key, t) {
        // Marks a key as dirty, meaning that functions on it need to update
        log('Marking changed', bus.toString(), key)
        changed_keys.add(key)
        clean_timer = clean_timer || setTimeout(clean)
    }

    function clean () {
        // 1. Collect all functions for all keys and dirtied fetchers
        var dirty_funks = new Set()
        for (var b in busses) {
            var fs = busses[b].rerunnable_funks()
            for (var i=0; i<fs.length; i++)
                dirty_funks.add(fs[i])
        }
        clean_timer = null

        // 2. Run any priority function first (e.g. file_store's on_save)
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
        var fetchers = dirty_fetchers.values()

        //log(bus+' Cleaning up!', keys, 'keys, and', fetchers.length, 'fetchers')
        for (var i=0; i<keys.length; i++) {          // Collect all keys
            // if (to_be_forgotten[keys[i]])
            //     // Ignore changes to keys that have been forgotten, but not
            //     // processed yet
            //     continue
            var fs = bindings(keys[i], 'on_save')
            for (var j=0; j<fs.length; j++) {
                var f = fs[j].func
                if (f.react) {
                    // Skip if it's already up to date
                    var v = f.fetched_keys[JSON.stringify([this.id, keys[i]])]
                    //log('re-run:', keys[i], f.statebus_id, f.fetched_keys)
                    if (v && v.indexOf(versions[keys[i]]) !== -1) {
                        log('skipping', funk_name(f), 'already at version', versions[keys[i]], 'proof:', v)
                        continue
                    }
                } else {
                    // Fresh handlers are always run, but need a wrapper
                    f.seen_keys = f.seen_keys || {}
                    var v = f.seen_keys[JSON.stringify([this.id, keys[i]])]
                    if (v && v.indexOf(versions[keys[i]]) !== -1) {
                        // Note: Is this even possible?  Isn't it impossible
                        // for a fresh handler to have seen a version already?

                        //log('skipping', funk_name(f), 'already at version', v)
                        continue
                    }
                    autodetect_args(f)
                    f = run_handler(f, 'on_save', cache[keys[i]], {dont_run: true,
                                                                   binding: keys[i]})
                }
                result.push(funk_key(f))
            }
        }
        for (var i=0; i<fetchers.length; i++)        // Collect all fetchers
            result.push(fetchers[i])

        changed_keys.clear()
        dirty_fetchers.clear()

        //log('found', result.length, 'funks to re run')

        return result
    }

    // ****************
    // Connections
    function subspace (key) {
        var result = {}
        for (var method in {to_fetch:null, to_save:null, on_save:null, on_set_sync:null,
                            to_delete:null, to_forget:null})
            (function (method) {
                Object.defineProperty(result, method, {
                    set: function (func) {
                        autodetect_args(func)
                        func.defined = func.defined || []
                        func.defined.push(
                            {as:'handler', bus:bus, method:method, key:key})
                        bind(key, method, func, 'allow_wildcards')
                    },
                    get: function () {
                        var result = bindings(key, method)
                        for (var i=0; i<result.length; i++) result[i] = result[i].func
                        result.delete = function (func) { unbind (key, method, func, 'allow_wildcards') }
                        return result
                    }
                })
            })(method)
        return result
    }

    function autodetect_args (handler) {
        if (handler.args) return

        // Get an array of the handler's params
        var comments = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg,
            params = /([^\s,]+)/g,
            s = handler.toString().replace(comments, '')
        params = s.slice(s.indexOf('(')+1, s.indexOf(')')).match(params) || []

        handler.args = {}
        for (var i=0; i<params.length; i++)
            switch (params[i]) {
            case 'key':
            case 'k':
                handler.args['key'] = i; break
            case 'json':
            case 'vars':
                handler.args['vars'] = i; break
            case 'star':
            case 'rest':
                handler.args['rest'] = i; break
            case 't':
            case 'transaction':
                handler.args['t'] = i; break
            case 'o':
            case 'obj':
            case 'val':
            case 'new':
            case 'New':
                handler.args['obj'] = i; break
            case 'old':
                handler.args['old'] = i; break
            }
    }

    // The funks attached to each key, maps e.g. 'fetch /point/3' to '/30'
    var handlers = new One_To_Many()
    var wildcard_handlers = []  // An array of {prefix, method, funk}

    // A set of timers, for keys to send forgets on
    var to_be_forgotten = {}
    function bind (key, method, func, allow_wildcards) {
        bogus_check(key)
        if (allow_wildcards && key[key.length-1] === '*')
            wildcard_handlers.push({prefix: key,
                                    method: method,
                                    funk: func})
        else
            handlers.add(method + ' ' + key, funk_key(func))

        // Now check if the method is a fetch and there's a fetched
        // key in this space, and if so call the handler.
    }
    function unbind (key, method, funk, allow_wildcards) {
        bogus_check(key)
        if (allow_wildcards && key[key.length-1] === '*')
            // Delete wildcard connection
            for (var i=0; i<wildcard_handlers.length; i++) {
                var handler = wildcard_handlers[i]
                if (handler.prefix === key
                    && handler.method === method
                    && handler.funk === funk) {

                    wildcard_handlers.splice(i,1)  // Splice this element out of the array
                    i--                            // And decrement the counter while we're looping
                }
            }
        else
            // Delete direct connection
            handlers.delete(method + ' ' + key, funk_key(funk))
    }

    function bindings(key, method) {
        bogus_check(key)
        if (typeof key !== 'string') {
            console.error('Error:', key, 'is not a string', method)
            console.trace()
        }

        //console.log('bindings:', key, method)
        var result = []
        var seen = {}

        // First get the exact key matches
        var exacts = handlers.get(method + ' ' + key)
        for (var i=0; i < exacts.length; i++) {
            var f = funks[exacts[i]]
            if (!seen[funk_key(f)]) {
                f.statebus_binding = {key:key, method:method}
                result.push({method:method, key:key, func:f})
                seen[funk_key(f)] = true
            }
        }

        // Now iterate through prefixes
        for (var i=0; i < wildcard_handlers.length; i++) {
            handler = wildcard_handlers[i]

            var prefix = handler.prefix.slice(0, -1)       // Cut off the *
            if (prefix === key.substr(0,prefix.length)     // If the prefix matches
                && method === handler.method               // And it has the right method
                && !seen[funk_key(handler.funk)]) {
                handler.funk.statebus_binding = {key:handler.prefix, method:method}
                result.push({method:method, key:handler.prefix, func:handler.funk})
                seen[funk_key(handler.funk)] = true
            }
        }

        return result
    }

    function run_handler(funck, method, arg, options) {
        options = options || {}
        var t = options.t,
            just_make_it = options.dont_run,
            binding = options.binding

        // When we first run a handler (e.g. a fetch or save), we wrap it in a
        // reactive() funk that calls it with its arg.  Then if it fetches or
        // saves, it'll register a .on_save handler with this funk.

        // Is it reactive already?  Let's distinguish it.
        var funk = funck.react && funck,  // Funky!  So reactive!
            func = !funk && funck         // Just a function, waiting for a rapper to show it the funk.

        console.assert(funk || func)

        if (false && !funck.global_funk) {
            // \u26A1
            var event = {'to_save':'save','on_save':'save.fire','to_fetch':'fetch',
                         'to_delete':'delete','to_forget':'forget'}[method],
                triggering = funk ? 're-running' : 'initiating'
            console.log('   > a', bus+'.'+event + "('" + (arg.key||arg) + "') is " + triggering
                +'\n     ' + funk_name(funck))
        }

        if (funk) {
            // Then this is an on_save event re-triggering an already-wrapped
            // funk.  It has its own arg internally that it's calling itself
            // with.  Let's tell it to re-trigger itself with that arg.

            if (method !== 'on_save') {
                console.error(method === 'on_save', 'Funk is being re-triggered, but isn\'t on_save. It is: "' + method + '", oh and funk: ' + funk_name(funk))
                return
            }
            return funk.react()

            // This might not work that great.
            // Ex:
            //
            //    bus('foo').on_save = function (o) {...}
            //    save({key: 'foo'})
            //    save({key: 'foo'})
            //    save({key: 'foo'})
            //
            // Does this spin up 3 reactive functions?  I think so.
            // No, I think it does, but they all get forgotten once
            // they run once, and then are garbage collected.
            //
            //    bus('foo*').on_save = function (o) {...}
            //    save({key: 'foo1'})
            //    save({key: 'foo2'})
            //    save({key: 'foo1'})
            //    save({key: 'foo3'})
            //
            // Does this work ok?  Yeah, I think so.
        }

        // Alright then.  Let's wrap this func with some funk.

        // Fresh fetch/save/forget/delete handlers will just be regular
        // functions.  We'll store their arg and let them re-run until they
        // are done re-running.
        function key_arg () { return ((typeof arg.key) == 'string') ? arg.key : arg }
        function rest_arg () { return (key_arg()).substr(binding.length-1) }
        function vars_arg () {
            var r = rest_arg()
            try {
                return JSON.parse(r)
            } catch (e) {
                return 'Bad JSON "' + r + '" for key ' + key_arg()
            }
        }
        var f = reactive(function () {

            // Initialize transaction
            t = clone(t || {})
            if (method in {to_save:1, to_delete:1})
                t.abort = function () {
                    var key = method === 'to_save' ? arg.key : arg
                    if (f.loading()) return
                    bus.cache[key] = bus.cache[key] || {key: key}
                    bus.backup_cache[key] = bus.backup_cache[key] || {key: key}
                    bus.save.abort(bus.cache[key])
                }
            if (method !== 'to_forget')
                t.done = function (o) {
                    var key = method === 'to_save' ? arg.key : arg
                    bus.log('We are DONE()ing', method, key, o||arg)

                    // We use a simple (and crappy?) heuristic to know if the
                    // to_save handler has changed the state: whether the
                    // programmer passed (o) to the t.done(o) handler.  If
                    // not, we assume it hasn't changed.  If so, we assume it
                    // *has* changed, and thus we change the version of the
                    // state.  I imagine it would be more accurate to diff
                    // from before the to_save handler began with when
                    // t.done(o) ran.
                    if (o) t.version = new_version()

                    if (method === 'to_delete')
                        delete bus.cache[key]
                    else if (method === 'to_save') {
                        bus.save.fire(o || arg, t)
                        bus.route(key, 'on_set_sync', o||arg, t)
                    } else { // Then method === to_fetch
                        o.key = key
                        bus.save.fire(o, t)
                        // And now reset the version cause it could get called again
                        delete t.version
                    }
                }
            t.return = t.done
            if (method === 'to_save')
                t.refetch = function () { bus.dirty(arg.key) }

            // Then in run_handler, we'll call it with:
            var args = []
            args[0] = arg
            args[1] = t

            //console.log('This funcs args are', func.args)
            for (var k in (func.args||{})) {
                switch (k) {
                case 'key':
                    args[func.args[k]] = key_arg(); break
                case 'rest':
                    args[func.args[k]] = rest_arg(); break
                case 'vars':
                    args[func.args[k]] = vars_arg();
                    //console.log('We just made an arg', args[func.args[k]], 'in slot', func.args[k], 'for', k)
                    break
                case 't':
                    args[func.args[k]] = t; break
                case 'obj':
                    args[func.args[k]] = arg.key ? arg : bus.cache[arg]; break
                case 'old':
                    var key = key_arg()
                    args[func.args[k]] = bus.cache[key] || (bus.cache[key] = {key:key})
                    break
                }
                //console.log('processed', k, 'at slot', func.args[k], 'to make', args[func.args[k]])
            }
            //console.log('args is', args)

            // Call the raw function here!
            var result = func.apply(null, args)

            // We will wanna add in the fancy arg stuff here, with:
            // arr = []
            // for (var k of func.args || {})
            //    arr[func.args[k]] = <compute_blah(k)>

            // Trigger done() or abort() by return value
            console.assert(!(result === 'to_fetch' &&
                             (result === 'done' || result === 'abort')),
                           'Returning "done" or "abort" is not allowed from to_fetch handlers')
            if (result === 'done')  t.done()
            if (result === 'abort') t.abort()

            // For fetch
            if (method === 'to_fetch' && result instanceof Object
                && !f.loading()     // Experimental.
               ) {
                result.key = arg
                var new_t = clone(t || {})
                new_t.to_fetch = true
                save.fire(result, new_t)
                return result
            }

            // Save, forget and delete handlers stop re-running once they've
            // completed without anything loading.
            // ... with f.forget()
            if (method !== 'to_fetch' && !f.loading())
                f.forget()
        })
        f.proxies_for = func
        f.arg = arg

        // to_fetch handlers stop re-running when the key is forgotten
        if (method === 'to_fetch') {
            var key = arg
            function handler_done () {
                f.forget()
                unbind(key, 'to_forget', handler_done)
            }
            bind(key, 'to_forget', handler_done)

            // // Check if it's doubled-up
            // if (fetches_out[key])
            //     console.error('Two .to_fetch functions are running on the same key',
            //                   key+'!', funk_name(funck), funk_name(fetches_out[key]))

            fetches_out[key] = fetches_out[key] || []
            fetches_out[key].push(f)   // Record active to_fetch handler
            pending_fetches[key] = f   // Record that the fetch is pending
        }

        if (just_make_it)
            return f

        return f()
    }

    // route() can be overridden
    bus.route = function (key, method, arg, t) {
        var handlers = bus.bindings(key, method)
        if (handlers.length)
            log('route:', bus+'("'+key+'").'+method+'['+handlers.length+'](key:"'+(arg.key||arg)+'")')
        // log('route: got bindings',
        //     funcs.map(function (f) {return funk_key(f)+':'+funk_keyr(f)}))
        for (var i=0; i<handlers.length; i++)
            bus.run_handler(handlers[i].func, method, arg, {t: t, binding: handlers[i].key})

        // if (method === 'to_fetch')
        //     console.assert(handlers.length<2,
        //                    'Two to_fetch functions are registered for the same key '+key,
        //                    handlers)
        return handlers.length
    }


    // ****************
    // Reactive functions
    //
    // We wrap any function with a reactive wrapper that re-calls it whenever
    // state it's fetched changes.

    if (!global_funk) {
        global_funk = reactive(function global_funk () {})
        global_funk.global_funk = true
        executing_funk = global_funk
        funks[global_funk.statebus_id = 'global funk'] = global_funk
    }

    function reactive(func) {
        // You can call a funk directly:
        //
        //    f = reactive(func)
        //    f(arg1, arg2)
        //
        // This will remember every fetch it depends on, and make it re-call
        // itself whenever that state changes.  It will remember arg1 and arg2
        // and use those again.  You can also trigger a re-action manually
        // with:
        //
        //    funk.react().
        //
        // ...which will make it re-run with the original arg1 and arg2 .
        function funk () {
            console.assert(executing_funk === global_funk
                           || executing_funk !== funk, 'Recursive funk', funk.func)

            if (funk.called_directly)
                funk.this = this, funk.args = arguments

            // Forget the keys from last time
            funk.forget()

            // Now let's run it
            var last_executing_funk = executing_funk
            executing_funk = funk
            try {
                var result = func.apply(funk.this, funk.args)
            } catch (e) {
                if (e.message === 'Maximum call stack size exceeded') {
                    console.error(e)
                    process.exit()
                }
                //executing_funk = null // Or should this be last_executing_funk?
                if (funk.loading()) return null
                else {
                    // If we ware on node, then just print out the error
                    if (nodejs) {
                        console.error(e.stack)
                        process.exit()
                    } else {
                        // This is the best way to print errors in browsers,
                        // so that they get clickable line numbers
                        var result = func.apply(funk.this, funk.args)
                        // If code reaches here, there was an error triggering
                        // the error.  We should warn the programmer, and then
                        // probably move on, because maybe the error went
                        // away... and it doesn't do us any good to just crash
                        // now, does it?  Then the programmer has less
                        // information on what happened because he/she can't
                        // see it in the result, which might also be fucked
                        // up, and might be informative.
                        console.error('Non-deterministic Error!', e.stack || e)
                        console.warn("A non-deterministic error is when your reactive function triggers an error only some of the times it's called.\nThe error originated from calling:", funk_name(func, 400))
                    }
                }
            } finally {
                executing_funk = last_executing_funk
            }
            return result
        }

        funk.func = func  // just for debugging
        funk.called_directly = true
        funk.fetched_keys = {} // maps [bus,key] to version
                               // version will be undefined until loaded
        funk.abortable_keys = []
        funk.has_seen = function (bus, key, version) {
            //console.log('depend:', bus, key, versions[key])
            var bus_key = JSON.stringify([bus.id, key])
            var seen_versions =
                this.fetched_keys[bus_key] = this.fetched_keys[bus_key] || []
            seen_versions.push(version)
            if (seen_versions.length > 50) seen_versions.shift()
        }
        funk.react = function () {
            var result
            try {
                funk.called_directly = false
                result = funk()
            } finally {
                funk.called_directly = true
            }
            return result
        }
        funk.forget = function () {
            // Todo: This will bug out if an .on_save handler for a key also
            // fetches that key once, and then doesn't fetch it again, because
            // when it fetches the key, that key will end up being a
            // fetched_key, and will then be forgotten as soon as the funk is
            // re-run, and doesn't fetch it again, and the fact that it is
            // defined as an .on_save .on_save handler won't matter anymore.

            if (funk.statebus_id === 'global funk') return

            for (var hash in funk.fetched_keys) {
                var tmp = JSON.parse(hash),
                    bus = busses[tmp[0]], key = tmp[1]
                if (bus)  // Cause it might have been deleted
                    bus.forget(key, funk)
            }
            funk.fetched_keys = {}
        }
        funk.loading = function () {
            for (var hash in funk.fetched_keys) {
                var tmp = JSON.parse(hash),
                    bus = busses[tmp[0]], key = tmp[1]
                if (bus  // Cause it might have been deleted
                    && bus.pending_fetches[key])
                    return true
            }
            return false
        }

        // for backwards compatibility
        funk.is_loading = funk.loading

        return funk
    }

    function loading_keys (keys) {
        // Do any of these keys have outstanding gets?
        //console.log('Loading: pending_keys is', pending_fetches)
        for (var i=0; i<keys.length; i++)
            if (pending_fetches[keys[i]]) return true
        return false
    }

    // Tells you whether the currently executing funk is loading
    function loading () { return executing_funk.loading() }

    bus.default = function () {
        bus.deep_map(arguments, function (o) {
            if (o.key && !(bus.cache.hasOwnProperty(o.key)))
                bus.cache[o.key] = o
            return o
        })
    }

    function once (f) {
        var r = reactive(function () {
            f()
            if (!r.loading()) r.forget()
        })
        r()
    }

    // ******************
    // Pretty Printing

    if (nodejs)
        var red = '\x1b[31m', normal = '\x1b[0m', grey = '\x1b[0;38;5;245m',
            green = '\x1b[0;38;5;46m', brown = '\x1b[0;38;5;130m',
            yellow = '\x1b[0;38;5;226m'
    else
        var red = '', normal = '', grey = '',
            green = '', brown = ''
    function add_diff_msg (message, obj) {
        var diff = sorta_diff(backup_cache[obj.key], obj)
        if (diff) {
            var end_col = message.length + 2 + statelog_indent * 3
            for (var i=0; i<40-end_col; i++) message += ' '
            message += diff.substring(0,80)
        }
        else message += ' <no diff>'
        return message
    }
    function save_msg (obj, t, meth) {
        if (!honking_at(obj.key)) return
        var message = (t && t.m) || bus + "."+meth+"('"+obj.key+"')"
        message = add_diff_msg(message, obj)
        if (t.version) message += ' [' + t.version + ']'
        return message
    }


    // ******************
    // Fancy Stuff

    var uncallback_counter = 0
    function uncallback (f, options) {
        name = (options && options.name) || f.name || (uncallback_counter+'')
        if (!name) throw 'Uncallback function needs a name'
        var watching = {}
        var prefix = 'uncallback/' + name
        bus(prefix + '/*').to_fetch = function (key, json) {
            var args = json
            function cb (err, result) {
                if (err) {
                    console.trace('have err:', err, 'and result is', JSON.stringify(result))
                    throw err
                } else
                    bus.save.fire({key: key, _: result})
            }

            // Inject the callback into the right place
            args[options.callback_at || args.length] = cb

            // And call the underlying function
            f.apply({key:key}, args)
            if (options.start_watching && !watching[key]) {
                watching[key] = true
                options.start_watching(
                    args,
                    function () { bus.dirty(key) },
                    function () { bus.del(key) }
                )
            }
        }
        if (options.stop_watching)
            bus(prefix + '/*').to_forget = function (key, json) {
                console.assert(watching[key],
                               'Forgetting a watcher for ' + JSON.stringify(key)
                               + ' that is not enabled')
                delete watching[key]
                options.stop_watching(json)
            }
        return function () {
            var args = [].slice.call(arguments)
            return bus.fetch(prefix + '/' + JSON.stringify(args))._
        }
    }

    function unpromise (f) {
        // Doesn't work yet!  In progress.
        return uncallback(function () {
            var args = [].slice.call(arguments)
            var cb = args.pop()
            f.apply(null, args).then(cb)
        })
    }

    var sb = (function sb () {
        // I have the cache behind the scenes
        // Each proxy has a target object -- the raw data on cache
        // If we're proxying a {_: ...} singleton then ...

        function item_proxy (base, o) {
            if (typeof o === 'number'
                || typeof o === 'string'
                || typeof o === 'boolean'
                || o === undefined
                || o === null
                || typeof o === 'function') return o

            return new Proxy(o, {
                get: function get(o, k) {
                    if (k === 'inspect' || k === 'valueOf' || typeof k === 'symbol')
                        return undefined
                    k = encode_field(k)
                    return item_proxy(base, o[k])
                },
                set: function set(o, k, v) {
                    var result = o[encode_field(k)] = v
                    bus.save(base)
                    return result
                },
                has: function has(o, k) {
                    return o.hasOwnProperty(encode_field(k))
                },
                deleteProperty: function del (o, k) {
                    delete o[encode_field(k)]
                },
                apply: function apply (o, This, args) {
                    return o
                }
            })}

        return new Proxy(cache, {
            get: function get(o, k) {
                if (k in bogus_keys) return o[k]
                if (k === 'inspect' || k === 'valueOf' || typeof k === 'symbol')
                    return undefined
                var raw = bus.fetch(k),
                    obj = raw
                while (typeof obj == 'object' && '_' in obj) obj = obj._
                return item_proxy(raw, obj)
            },
            set: function set(o, k, v) {
                if (typeof v === 'number'
                    || typeof v === 'string'
                    || typeof v === 'boolean'
                    || v === undefined
                    || v === null
                    || typeof v === 'function'
                    || Array.isArray(v))
                    v = {_:v}
                else
                    v = bus.clone(v)
                v.key = k
                bus.save(v)
            },
            // In future, this might check if there's a .to_fetch function OR
            // something in the cache:
            //
            // has: function has(o, k) {
            //     return k in o
            // },
            // ... but I haven't had a need yet.
            deleteProperty: function del (o, k) {
                bus.delete(encode_field(k))
            }
        })
    })()


    // ******** State (Proxy) API *********
    //
    // The top-level state[..] object translates pointers of the
    // special form:
    //
    //    {key: <s>, _: *}
    //
    // Examples:
    //
    //    state['uninitialized']
    //    >> undefined
    //
    //    state['uninitialized'] = {}
    //    >> {key: 'uninitialized'}
    //
    //    state['uninitialized'] = {a: 3}
    //    >> {key: 'uninitialized', a: 3}
    //
    //    state['uninitialized'] = []
    //    >> {key: 'uninitialized', _: []}
    //
    //    delete state['uninitialized']
    //    state['uninitialized']
    //    >> undefined
    //
    // ** Rules
    //  Setting:
    //    - Escape-translate each field recursively
    //    - If setting an object, put each field directly on it
    //    - If setting anything else, put it into ._
    //
    //  Getting:
    //    - If it has unescaped fields other than ._, return object with them
    //    - Otherwise, return ._
    //    - Unescape all fields

    var strict_mode = (function () {return !this})()
    function pget (base, o, k) {
        // console.log('pget:', {base, o, k})

        if (base) {
            o = o[k]

            // If new base, update and subscribe
            if (typeof o == 'object' && 'key' in o) {
                base = o
                bus.fetch(o.key)
            }
        } else {
            // We are getting from the Root
            o = bus.fetch(k)
            // console.log('pget: fetched', k, 'and got', o)
            base = o
            if (bus.validate(o, {key: '*', '?_': '*'})) {
                // console.log('pget: jumping into the _')
                o = o._
            }
            if (typeof o === 'object' && o.key)
                base = o
        }

        // Follow symlinks
        if (typeof o == 'object' && 'key' in o && '_' in o) {
            // Note: I don't actually need this recursion here, because
            // recursively linked state cannot be created by the proxy API.
            // So it can be undefined behavior.
            var tmp = pget(base, o, '_')
            base = tmp[0]
            o = tmp[1]
        }

        return [base, o]
    }

    function proxy_encode_val (x) {
        // Arrays
        if (Array.isArray(x)) {
            var result = []
            for (var i=0; i < x.length; i++)
                result[i] = proxy_encode_val(x[i])
            return result
        }

        // Objects
        else if (typeof x === 'object') {
            // Actual objects need their keys translated
            var result = {}
            for (var k in x)
                result[encode_field(k)] = proxy_encode_val(x[k])
            return result
        }

        // Proxieds: already have JSON, stored inside. Return it.
        else if (typeof x === 'function' && x[symbols.is_proxy]) {
            return x()
        }

        // Everything else return
        return x
    }
    function proxy_decode_json (json) {
        // Returns data for proxies
        //  - Remove keys
        //  - Translate 

        // Root objects of special form
        if (bus.validate(json, {key: '*', '_': '*'}))
            return proxy_decode_json(json._)

        // Arrays
        if (Array.isArray(json)) {
            var arr = json.slice()
            for (var i=0; i<arr.length; i++)
                arr[i] = proxy_decode_json(arr[i])
            return arr
        }

        // Objects
        if (typeof json === 'object' && json !== null) {
            var obj = {}
            for (var k in json)
                if (k !== 'key')
                    obj[decode_field(k)] = proxy_decode_json(json[k])
            return obj
        }

        // Other primitives just return
        return json
    }

    if (nodejs) var util = require('util')
    function make_proxy (base, o) {
        if (!symbols)
            symbols = {is_proxy: Symbol('is_proxy'),
                       get_json: Symbol('get_json'),
                       get_base: Symbol('get_base')}

        if (typeof o !== 'object' || o === null) return o

        function get_json() {
            // Pop up to parent if this is a singleton array.
            // We know it's a singleton array if base._ === x(), and base is
            // of the form {key: *, _: x}
            if (base && base._ && Object.keys(base).length === 2
                && base._ === o)
                return base

            // Otherwise return x's JSON.
            return o
        }

        // Javascript won't let us function call a proxy unless the "target"
        // is a function.  So we make a dummy target, and don't use it.
        var dummy_obj = function () {}
        return new Proxy(dummy_obj, {
            get: function (dummy_obj, k) {
                // console.log('get:', k, '::'+typeof k, 'on', o)

                // Print something nice for Node console inspector
                if (nodejs && k === util.inspect.custom) {
                    if (o == bus.cache)
                        return function () {return 'state'+bus.toString().substr(3)}
                    return function () {return 'p: '+util.format(proxy_decode_json(o))}
                }
                if (k in bogus_keys) return o[k]
                // Proxies distinguish themselves via proxy.is_proxy == true
                if (k === symbols.is_proxy) return true
                if (k === symbols.get_json) return get_json()
                if (k === symbols.get_base) return base
                if (k === Symbol.isConcatSpreadable) return Array.isArray(o)
                if (k === Symbol.toPrimitive) return function () {
                    return JSON.stringify(proxy_decode_json(o))
                }
                if (typeof k === 'symbol') {
                    console.warn('Got request for weird symbol', k)
                    return undefined
                }

                var tmp2 = pget(base, o, encode_field(k))
                var base2 = tmp2[0]
                var o2 = tmp2[1]

                // console.log('returning proxy on', base2, o2)
                return make_proxy(base2, o2)
            },
            set: function (dummy_obj, k, v) {
                // console.log('set:', {base, o, k, v})

                if (base) {
                    var encoded_v = o[encode_field(k)] = proxy_encode_val(v)
                    // console.log('  set: saving', encoded_v, 'into', base)

                    // Collapse state of the form:
                    //    {key: '*', _: {foo: bar, ...}}
                    // down to:
                    //    {key: '*', foo: bar}
                    if (base._
                        && Object.keys(base).length === 2
                        && typeof base._ === 'object'
                        && base._ !== null
                        && !Array.isArray(base._)
                        && !base._.key
                        && Object.keys(base._).length !== 0) {
                        // console.log('Collapsing', JSON.stringify(base))
                        for (var k2 in base._)
                            base[k2] = base._[k2]
                        delete base._
                    }
                        
                    bus.save(base)
                }

                // Saving into top-level state
                else {
                    var encoded_v = proxy_encode_val(v)
                    // console.log('  set top-level:', {v, encoded_v})

                    // Setting a top-level object to undefined wipes it out
                    if (v === undefined)
                        encoded_v = {key: k}

                    // Prefix with _: anything that is:
                    else if (// A proxy to another state
                        (typeof v === 'object' && v[symbols.is_proxy])
                        // An empty {} object
                        || (typeof v === 'object' && Object.keys(v).length === 0)
                        // A number, bool, string, function, etc
                        || typeof v !== 'object' || v === null
                        // An array
                        || Array.isArray(v))
                        encoded_v = {_: encoded_v}
                    encoded_v.key = k

                    // console.log('  set top-level: now encoded_v is', encoded_v)
                    bus.save(encoded_v)
                }

                var newbase = (encoded_v && encoded_v.key) ? encoded_v : base
                return true
            },
            has: function has(O, k) {
                // XXX QUESTIONS:
                //
                //  - Do I want this to return true if there's a .to_fetch()
                //    function for this o, k?
                //
                //  - Does this need to do a fetch as well?
                //
                //  - For a keyed object, should this do a loading() check?
                return o.hasOwnProperty(encode_field(k))
            },
            deleteProperty: function del (O, k) {
                if (base) {
                    // console.log('  deleting:', encode_field(k), 'of', o)
                    delete o[encode_field(k)]   // Deleting innards
                    if (Object.keys(o).length === 1 && o.key)
                        o._ = {}
                    bus.save(base)
                }
                else
                    bus.delete(encode_field(k)) // Deleting top-level
            },
            apply: function apply (f, This, args) { return get_json() }
        })
    }
    if (nodejs || window.Proxy)
        var state = make_proxy(null, cache)

    // So chrome can print out proxy objects decently
    if (!nodejs)
        window.devtoolsFormatters = [{
            header: function (x) {
                return x[symbols.is_proxy] &&
                    ['span', {style: 'background-color: #feb; padding: 3px;'},
                     JSON.stringify(proxy_decode_json(x()))]
            },
            hasBody: function (x) {return false}
        }]

    // ******************
    // Network client
    function get_domain (key) { // Returns e.g. "state://foo.com"
        var m = key.match(/^i?statei?\:\/\/(([^:\/?#]*)(?:\:([0-9]+))?)/)
        return m && m[0]
    }
    function message_method (m) {
        return (m.fetch && 'fetch')
            || (m.save && 'save')
            || (m['delete'] && 'delete')
            || (m.forget && 'forget')
    }

    function net_mount (prefix, url, client_creds) {
        // Local: state://foo.com/* or /*
        var preprefix = prefix.slice(0,-1)
        var is_absolute = /^i?statei?:\/\//
        var has_prefix = new RegExp('^' + preprefix)
        var bus = this
        var sock
        var attempts = 0
        var outbox = []
        var client_fetched_keys = new bus.Set()
        var heartbeat
        if (url[url.length-1]=='/') url = url.substr(0,url.length-1)
        function nlog (s) {
            if (nodejs) {console.log(s)} else console.log('%c' + s, 'color: blue')
        }
        function send (o, pushpop) {
            pushpop = pushpop || 'push'
            o = rem_prefixes(o)
            var m = message_method(o)
            if (m == 'fetch' || m == 'delete' || m == 'forget')
                o[m] = rem_prefix(o[m])
            bus.log('net_mount.send:', JSON.stringify(o))
            outbox[pushpop](JSON.stringify(o))
            flush_outbox()
        }
        function flush_outbox() {
            if (sock.readyState === 1)
                while (outbox.length > 0)
                    sock.send(outbox.shift())
            else
                setTimeout(flush_outbox, 400)
        }
        function add_prefix (key) {
            return is_absolute.test(key) ? key : preprefix + key }
        function rem_prefix (key) {
            return has_prefix.test(key) ? key.substr(preprefix.length) : key }
        function add_prefixes (obj) {
            return bus.translate_keys(bus.clone(obj), add_prefix) }
        function rem_prefixes (obj) {
            return bus.translate_keys(bus.clone(obj), rem_prefix) }

        bus(prefix).to_save   = function (obj, t) {
            bus.save.fire(obj)
            var x = {save: obj}
            if (t.version) x.version = t.version
            if (t.parents) x.parents = t.parents
            if (t.patch)   x.patch   = t.patch
            if (t.patch)   x.save    = rem_prefix(x.save.key)
            send(x)
        }
        bus(prefix).to_fetch  = function (key) { send({fetch: key}),
                                                 client_fetched_keys.add(key) }
        bus(prefix).to_forget = function (key) { send({forget: key}),
                                                 client_fetched_keys.delete(key) }
        bus(prefix).to_delete = function (key) { send({'delete': key}) }

        function connect () {
            nlog('[ ] trying to open ' + url)
            sock = bus.make_websocket(url)
            sock.onopen = function()  {
                nlog('[*] opened ' + url)

                // Update state
                var peers = bus.fetch('peers')
                peers[url] = peers[url] || {}
                peers[url].connected = true
                save(peers)

                // Login
                var creds = client_creds || (bus.client_creds && bus.client_creds(url))
                if (creds) {
                    var i = []
                    function intro (o) {i.push(JSON.stringify({save: o}))}
                    if (creds.clientid)
                        intro({key: 'current_user', client: creds.clientid})
                    if (creds.name && creds.pass)
                        intro({key: 'current_user', login_as: {name: creds.name, pass: creds.pass}})
                    // Todo: make this kinda thing work:
                    if (creds.private_key && creds.public_key) {
                        // Send public_key... start waiting for a
                        // challenge... look up server's public key, verify
                        // signature from server's challenge, then respond to
                        // challenge.

                        // This will be used for mailbus
                    }
                    outbox = i.concat(outbox); flush_outbox()
                }

                // Reconnect
                if (attempts > 0) {
                    // Then we need to refetch everything, cause it
                    // might have changed
                    var keys = client_fetched_keys.values()
                    for (var i=0; i<keys.length; i++)
                        send({fetch: keys[i]})
                }

                attempts = 0
                //heartbeat = setInterval(function () {send({ping:true})}, 5000)
            }
            sock.onclose   = function()  {
                if (done) {
                    nlog('[*] closed ' + url + '. Goodbye!')
                    return
                }
                nlog('[*] closed ' + url)
                heartbeat && clearInterval(heartbeat); heartbeat = null
                setTimeout(connect, attempts++ < 3 ? 1500 : 5000)

                // Update state
                var peers = bus.fetch('peers')
                peers[url] = peers[url] || {}
                peers[url].connected = false
                save(peers)

                // Remove all fetches and forgets from queue
                var new_outbox = []
                var bad = {'fetch':1, 'forget':1}
                for (var i=0; i<outbox.length; i++)
                    if (!bad[JSON.parse(outbox[i]).method])
                        new_outbox.push(outbox[i])
                outbox = new_outbox
            }

            sock.onmessage = function(event) {
                // Todo: Perhaps optimize processing of many messages
                // in batch by putting new messages into a queue, and
                // waiting a little bit for more messages to show up
                // before we try to re-render.  That way we don't
                // re-render 100 times for a function that depends on
                // 100 items from server while they come in.  This
                // probably won't make things render any sooner, but
                // will probably save energy.

                //console.log('[.] message')
                try {
                    var message = JSON.parse(event.data)
                    var method = message_method(message)

                    // We only take saves from the server for now
                    if (method !== 'save' && method !== 'pong') throw 'barf'
                    bus.log('net client received', message)
                    var t = {version: message.version,
                             parents: message.parents,
                             patch: message.patch}
                    if (t.patch)
                        msg.save = apply_patch(bus.cache[msg.save] || {key: msg.save},
                                               message.patch[0])
                    if (!(t.version||t.parents||t.patch))
                        t = undefined
                    bus.save.fire(add_prefixes(message.save), t)
                } catch (err) {
                    console.error('Received bad network message from '
                                  +url+': ', event.data, err)
                    return
                }
            }

        }
        connect()

        var done = false

        // Note: this return value is probably not necessary anymore.
        return {send: send, sock: sock, close: function () {done = true; sock.close()}}
    }

    function net_automount () {
        var bus = this
        var old_route = bus.route
        var connections = {}
        bus.route = function (key, method, arg, opts) {
            var d = get_domain(key)
            if (d && !connections[d]) {
                bus.net_mount(d + '/*', d)
                connections[d] = true
            }

            return old_route(key, method, arg, opts)
        }
    }


    // ******************
    // Key translation
    function translate_keys (obj, f) {
        // Recurse through each element in arrays
        if (Array.isArray(obj))
            for (var i=0; i < obj.length; i++)
                translate_keys(obj[i], f)

        // Recurse through each property on objects
        else if (typeof obj === 'object')
            for (var k in obj) {
                if (k === 'key' || /.*_key$/.test(k))
                    if (typeof obj[k] == 'string')
                        obj[k] = f(obj[k])
                    else if (Array.isArray(obj[k]))
                        for (var i=0; i < obj[k].length; i++) {
                            if (typeof obj[k][i] === 'string')
                                obj[k][i] = f(obj[k][i])
                        }
                translate_keys(obj[k], f)
            }
        return obj
    }
    function encode_field(k) {
        return k.replace(/(_(keys?|time)?$|^key$)/, '$1_')
    }
    function decode_field (k) {
        return k.replace(/(_$)/, '')
    }


    // ******************
    // JSON encoding
    //  - Does both escape/unescape keys, and wraps/unwraps pointers
    //  - Will use in both network communication and file_store
    function json_encode (highlevel_obj) {
        // Encodes fields, and converts {_key: 's'} to pointer to {key: 's'...}
    }
    function json_decode (lowlevel_obj) {
        // Decodes fields, and converts pointer to {key: 's'...} to {_key: 's'}
    }


    function key_id(string) { return string.match(/\/?[^\/]+\/(\d+)/)[1] }
    function key_name(string) { return string.match(/\/?([^\/]+).*/)[1] }

    // ******************
    // Applying Patches, aka Diffs
    function apply_patch (obj, patch) {
        obj = bus.clone(obj)
        // Descend down a bunch of objects until we get to the final object
        // The final object can be a slice
        // Set the value in the final object

        var x = patch.match(/(.*) = (.*)/),
            path = x[1],
            new_stuff = JSON.parse(x[2])

        var path_segment = /^(\.([^\.\[]+))|(\[((-?\d+):)?(-?\d+)\])/
        var curr_obj = obj,
            last_obj = null
        function de_neg (x) {
            return x[0] === '-'
                ? curr_obj.length - parseInt(x.substr(1))
                : parseInt(x)
        }

        while (true) {
            var match = path_segment.exec(path),
                subpath = match[0],
                field = match[2],
                slice_start = match[5],
                slice_end = match[6]

            slice_start = slice_start && de_neg(slice_start)
            slice_end = slice_end && de_neg(slice_end)

            // console.log('Descending', {curr_obj, path, subpath, field, slice_start, slice_end, last_obj})

            // If it's the final item, set it
            if (path.length == subpath.length) {
                if (field)                               // Object
                    curr_obj[field] = new_stuff
                else if (typeof curr_obj == 'string') {  // String
                    console.assert(typeof new_stuff == 'string')
                    if (!slice_start) {slice_start = slice_end; slice_end = slice_end+1}
                    if (last_obj) {
                        var s = last_obj[last_field]
                        last_obj[last_field] = (s.slice(0, slice_start)
                                                + new_stuff
                                                + s.slice(slice_end))
                    } else
                        return obj.slice(0, slice_start) + new_stuff + obj.slice(slice_end)
                } else                                   // Array
                    if (slice_start)                     //  - Array splice
                        [].splice.apply(curr_obj, [slice_start, slice_end-slice_start]
                                        .concat(new_stuff))
                else {                                   //  - Array set
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
            last_field = field
            curr_obj = curr_obj[field || slice_end]
            path = path.substr(subpath.length)
        }
    }

    // ******************
    // Utility funcs
    function parse (s) {try {return JSON.parse(s)} catch (e) {return {}}}
    function One_To_Many() {
        var hash = this.hash = {}
        var counts = {}
        this.get = function (k) { return Object.keys(hash[k] || {}) }
        this.add = function (k, v) {
            if (hash[k] === undefined)   hash[k]   = {}
            if (counts[k] === undefined) counts[k] = 0
            if (!hash[k][v]) counts[k]++
            hash[k][v] = true
        }
        this.delete = function (k, v) { delete hash[k][v]; counts[k]-- }
        this.delete_all = function (k) { delete hash[k]; delete counts[k] }
        this.has = function (k, v) { return hash[k] && hash[k][v] }
        this.has_any = function (k) { return counts[k] }
        this.del = this.delete // for compatibility; remove this soon
    }
    function Set () {
        var hash = {}
        this.add = function (a) { hash[a] = true }
        this.has = function (a) { return a in hash }
        this.values = function () { return Object.keys(hash) }
        this.delete = function (a) { delete hash[a] }
        this.clear = function () { hash = {} }
        this.del = this.delete // for compatibility; remove this soon
        this.all = this.values // for compatibility; remove this soon
    }
    //Set = window.Set || Set
    // function clone(obj) {
    //     if (obj == null) return obj
    //     var copy = obj.constructor()
    //     for (var attr in obj)
    //         if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr]
    //     return copy
    // }
    function clone(item) {
        if (!item               // null, undefined values check
            || item instanceof Number
            || item instanceof String
            || item instanceof Boolean)
            return item

        if (Array.isArray(item)) {
            item = item.slice()
            for (var i=0; i<item.length; i++)
                item[i] = clone(item[i])
            return item
        }

        if (typeof item == "object") {
            // Is it DOM
            if (item.nodeType && typeof item.cloneNode == "function")
                return item.cloneNode(true)

            if (item instanceof Date)
                return new Date(item)
            else {
                var result = {}
                for (var i in item) result[i] = clone(item[i])
                return result
            }
        }

        // Give up on everything else...
        return item
    }

    function extend(obj, with_obj) {
        if (with_obj === undefined) return obj
        for (var attr in with_obj)
            if (obj.hasOwnProperty(attr)) obj[attr] = with_obj[attr]
        return obj
    }

    function deep_map (object, func) {
        object = func(object)

        // Recurse through each element in arrays
        if (Array.isArray(object))
            for (var i=0; i < object.length; i++)
                object[i] = deep_map(object[i], func)

        // Recurse through each property on objects
        else if (typeof(object) === 'object')
            for (var k in object)
                object[k] = deep_map(object[k], func)

        return object
    }
    function deep_equals (a, b) {
        // Equal Primitives?
        if (a === b
            // But because NaN === NaN returns false:
            || (isNaN(a) && isNaN(b)
                // And because isNaN(undefined) returns true:
                && typeof a === 'number' && typeof b === 'number'))
            return true

        // Equal Arrays?
        var a_array = Array.isArray(a), b_array = Array.isArray(b)
        if (a_array !== b_array) return false
        if (a_array) {
            if (a.length !== b.length) return false
            for (var i=0; i < a.length; i++)
                if (!deep_equals (a[i], b[i]))
                    return false
            return true
        }

        // Equal Objects?
        var a_obj = a && typeof a === 'object',  // Note: typeof null === 'object'
            b_obj = b && typeof b === 'object'
        if (a_obj !== b_obj) return false
        if (a_obj) {
            var a_length = 0, b_length = 0
            for (var k in a) {
                a_length++
                if (!deep_equals(a[k], b[k]))
                    return false
            }
            for (var k in b) b_length++
            if (a_length !== b_length)
                return false
            return true
        }

        // Then Not Equal.
        return false
    }
    function sorta_diff(a, b) {
        // Equal Primitives?
        if (a === b
            // But because NaN === NaN returns false:
            || (isNaN(a) && isNaN(b)
                // And because isNaN(undefined) returns true:
                && typeof a === 'number' && typeof b === 'number'))
            return null

        // Equal Arrays?
        var a_array = Array.isArray(a), b_array = Array.isArray(b)
        if (a_array !== b_array) return ' = ' + JSON.stringify(b)
        if (a_array) {
            if (a.length === b.length-1
                && !deep_equals(a[a.length], b[b.length])) {
                return '.push(' +JSON.stringify(b[b.length]) + ')'
            }
            for (var i=0; i < a.length; i++) {
                var tmp = sorta_diff (a[i], b[i])
                if (tmp)
                    return '['+i+'] = '+tmp
            }
            return null
        }

        // Equal Objects?
        var a_obj = a && typeof a === 'object',  // Note: typeof null === 'object'
            b_obj = b && typeof b === 'object'
        if (a_obj !== b_obj) return ' = ' + JSON.stringify(b)
        if (a_obj) {
            for (var k in a) {
                var tmp = sorta_diff(a[k], b[k])
                if (tmp)
                    return '.' + k + tmp
            }
            for (var k in b) {
                if (!a.hasOwnProperty(k))
                    return '.' + k +' = '+JSON.stringify(b[k])
            }
            return null
        }

        // Then Not Equal.
        return ' = ' + JSON.stringify(b)
    }

    // This prune() function is a temporary workaround for dealing with nested
    // objects in save() handlers, until we change statebus' behavior.  Right
    // now, it calls .to_save only on the top-level state.  But if that state
    // validates, it calls fire() on *every* level of state.  This means that
    // state changes can sneak inside.  Prune() will take out any changes from
    // the nested levels of state in a new object -- replacing them with the
    // existing state from this bus.
    function prune (obj) {
        var bus = this
        obj = bus.clone(obj)
        function recurse (o) {
            // Recurse through each element in arrays
            if (Array.isArray(o))
                for (var i=0; i < o.length; i++)
                    o[i] = recurse(o[i])

            // Recurse through each property on objects
            else if (typeof(o) === 'object')
                if (o !== null && o.key)
                    return bus.fetch(o.key)
                else
                    for (var k in o)
                        o[k] = recurse(o[k])

            return o
        }

        for (var k in obj)
            obj[k] = recurse(obj[k])
        return obj
    }

    function validate (obj, schema) {
        // XXX Warning:
        //
        // If the programmer plugs a variable in as validation schema type,
        // thinking it's ok cause he'll be seeking an exact match:
        //
        //    var thing // manipulable via user input
        //    bus.validate(obj, {a: thing})
        //
        // An attacker could set `thing' to 'string', 'number', or '*', and
        // suddenly get it to validate anything he wants.
        //
        // I *only* imagine this a tempting way to program if you are seeking
        // an exact match on schema.  So we should consider removing this
        // feature, 3 lines below.

        var optional = false
        if (schema === '*')              return true
        if (obj === schema)              return true  // DANGEROUS API!!!

        if (typeof obj === 'string')     return schema === 'string'
        if (typeof obj === 'number')     return schema === 'number'
        if (typeof obj === 'boolean')    return schema === 'boolean'
        if (       obj === null)         return schema === 'null'
        if (       obj === undefined)    return schema === 'undefined'

        if (Array.isArray(obj))          return schema === 'array'

        if (typeof obj === 'object') {
            if (schema === 'object')     return true

            if (typeof schema === 'object') {
                for (var k in obj) {
                    var sk
                    if (schema.hasOwnProperty(k))
                        sk = k
                    else if (schema.hasOwnProperty('?'+k))
                        sk = '?'+k
                    else if (schema.hasOwnProperty('*'))
                        sk = '*'
                    else                 return false

                    if (!validate(obj[k], schema[sk]))
                                         return false
                }
                for (var k in schema)
                    if (k[0] !== '?' && k !== '*')
                        if (!(obj.hasOwnProperty(k)))
                                         return false

                return true
            }

            return false
        }

        if (typeof obj == 'function')
            throw 'bus.validate() cannot validate functions'
        console.trace()
        throw "You hit a Statebus bug! Tell the developers!"
    }

    function funk_key (funk) {
        if (!funk.statebus_id) {
            funk.statebus_id = Math.random().toString(36).substring(7)
            funks[funk.statebus_id] = funk
        }
        return funk.statebus_id
    }
    function funk_keyr (funk) {
        while (funk.proxies_for) funk = funk.proxies_for
        return funk_key(funk)
    }
    function funk_name (f, char_limit) {
        char_limit = char_limit || 30

        // if (f.react)
        //     var arg = JSON.stringify((f.args && f.args[0] && (f.args[0].key || f.args[0])) || '').substring(0.30)
        // else
        //     var arg = ''
        var arg = f.react ? (f.args && f.args[0]) : ''
        arg = f.react ? (JSON.stringify(f.arg)||'').substring(0,30) : ''
        f = f.proxies_for || f
        var f_string = 'function ' + (f.name||'') + '(' + (arg||'') + ') {..}'
        // Or: f.toString().substr(0,char_limit) + '...'

        if (!f.defined) return f_string
        if (f.defined.length > 1) return '**' + f_string + '**'

        var def = f.defined[0]
        switch (def.as) {
        case 'handler':
            return def.bus+"('"+def.key+"')."+def.method+' = '+f_string
        case 'fetch callback':
                return 'fetch('+def.key+', '+f_string+')'
        case 'reactive':
            return "reactive('"+f_string+"')"
        default:
            return 'UNKNOWN Funky Definition!!!... ???'
        }
    }

    function deps (key) {
        // First print out everything waiting for it to pub
        var result = 'Deps: ('+key+') fires into:'
        var pubbers = bindings(key, 'on_save')
        if (pubbers.length === 0) result += ' nothing'
        for (var i=0; i<pubbers.length; i++)
            result += '\n  ' + funk_name(pubbers[i].func)
        return result
    }

    function log () {
        if (bus.honk === true) indented_log.apply(null, arguments)
    }
    function indented_log () {
        if (nodejs) {
            var indent = ''
            for (var i=0; i<statelog_indent; i++) indent += '   '
            console.log(indent+require('util').format.apply(null,arguments).replace(/\n/g,'\n'+indent))
        } else
            console.log.apply(console, arguments)
    }
    function statelog (key, color, icon, message) {
        if (honking_at(key))
            indented_log(color + icon + ' ' + message + normal)
    }
    function honking_at (key) {
        return (bus.honk instanceof RegExp
                ? bus.honk.test(key)
                : bus.honk)
    }
    var bogus_keys = {constructor:1, hasOwnProperty:1, isPrototypeOf:1,
                      propertyIsEnumerable:1, toLocaleString:1, toString:1, valueOf:1,
                      __defineGetter__:1, __defineSetter__:1,
                      __lookupGetter__:1, __lookupSetter__:1, __proto__:1}
    function bogus_check (key) {
        if (!(key in bogus_keys))
            return

        var msg = "Sorry, statebus.js currently prohibits use of the key \""+key+"\", and in fact all of these keys: " + Object.keys(bogus_keys).join(', ') + ".  This is because Javascript is kinda lame, and even empty objects like \"{}\" have the \""+key+"\" field defined on them.  Try typing this in your Javascript console: \"({}).constructor\" -- it returns a function instead of undefined!  We could work around it by meticulously replacing every \"obj[key]\" with \"obj.hasOwnProperty(key) && obj[key]\" in the statebus code, but that will make the source more difficult to understand.  So please contact us if this use-case is important for you, and we'll consider doing it.  We're hoping that, for now, our users don't need to use these keys."
        console.error(msg)
        throw 'Invalid key'
    }

    // Make these private methods accessible
    var api = ['cache backup_cache fetch save forget del fire dirty fetch_once',
               'subspace bindings run_handler bind unbind reactive uncallback',
               'versions new_version',
               'make_proxy state sb',
               'funk_key funk_name funks key_id key_name id',
               'pending_fetches fetches_in fetches_out loading_keys loading once',
               'global_funk busses rerunnable_funks',
               'encode_field decode_field translate_keys apply_patch',
               'net_mount net_automount message_method',
               'parse Set One_To_Many clone extend deep_map deep_equals prune validate sorta_diff log deps'
              ].join(' ').split(' ')
    for (var i=0; i<api.length; i++)
        bus[api[i]] = eval(api[i])

    bus.delete = bus.del
    bus.executing_funk = function () {return executing_funk}

    // Export globals
    function clientjs_option (option_name) {
        // This function is duplicated in client.js.  Be sure to clone all
        // edits there.
        var script_elem = (
            document.querySelector('script[src*="/client"][src$=".js"]') ||
            document.querySelector('script[src^="client"][src$=".js"]'))
        return script_elem && script_elem.getAttribute(option_name)
    }
    if (nodejs || clientjs_option('globals') !== 'false') {
        var globals = ['loading', 'clone', 'forget']
        var client_globals = ['fetch', 'save', 'del', 'state']
        if (!nodejs && Object.keys(busses).length == 0)
            globals = globals.concat(client_globals)

        this.og_fetch = this.fetch    // Cause fetch() is actually a browser API now
        for (var i=0; i<globals.length; i++)
            this[globals[i]] = eval(globals[i])
    }

    busses[bus.id] = bus

    if (nodejs)
        require('./server').import_server(bus, options)
    
    bus.render_when_loading = true
    return bus
}

if (nodejs) require('./server').import_module(make_bus)

return make_bus
}))
