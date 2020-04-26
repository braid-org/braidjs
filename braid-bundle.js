// These 8 lines let browsers import modules with require().
function require (thing) {
    thing = thing.split('/')
    thing = thing[thing.length-1].slice(0,-3)
    console.assert(require[thing], `require("${thing}") failed because <script src="${thing}"> is not working.`)
    return require[thing]
}
global = window
module = {exports: {}}

// ===============================================
//
//   Utilities
//

is_browser = typeof process !== 'object' || typeof global !== 'object'

// dict() is an alternative to {}.  It creates a clean hash table without any
// pre-existing keys, like .constructor or .prototype that are built into
// Javascript Objects.
var dict = () => Object.create(null)

module.exports = require.utilities = {
    dict: dict,
    random_id: () => Math.random().toString(36).substr(2),

    // Maps a key to a set of values.
    //
    // If the value is not hashable, you can provide its hash using k2.
    one_to_many: () => {
        var data   = dict()
        var counts = dict()
        return {
            get (k) { return Object.values(data[k] || dict()) },
            add (k1, k2, value) {
                if (  data[k1] === undefined)   data[k1] = dict()
                if (counts[k1] === undefined) counts[k1] = 0
                if (!data[k1][k2]) counts[k1]++
                data[k1][k2] = value
            },
            delete (k, k2) { delete data[k][k2]; counts[k]-- },
            delete_all (k) { delete data[k]; delete counts[k] },
            has (k, k2)    { return data[k] && data[k][k2] },
            count (k)      { return counts[k] || 0}
        }
    },
    deep_equals,
}

assert = function () {
    if (!arguments[0]) {
        console.trace.apply(console, ['-Assert-', ...[...arguments].slice(1)])
        // if (this.process)
        //     process.exit()
        // else
            throw 'Bad'
    }
}

show_debug = false
log = function () {
    if (show_debug)
        return console.log.apply(console, arguments)
}
print_network = !is_browser && process.argv.find(x => x === 'network')
nlog = function () {
    if (show_debug || print_network)
        return console.log.apply(console, arguments)
}

function deep_equals(a, b) {
    if (typeof(a) != 'object' || typeof(b) != 'object' || a == null || b == null) return a == b
    if (Array.isArray(a)) {
        if (!Array.isArray(b)) return false
        if (a.length != b.length) return false
        for (var i = 0; i < a.length; i++)
            if (!deep_equals(a[i], b[i])) return false
        return true
    }
    var ak = Object.keys(a).sort()
    var bk = Object.keys(b).sort()
    if (ak.length != bk.length) return false
    for (var k of ak)
        if (!deep_equals(a[k], b[k])) return false
    return true
}


// ===============================================
//
//   Random number generator
//
//     This customized random number generator can be seeded, to
//     produce deterministic results.
//
//     That way, we can reproduce test-cases, and debug them.
//
{
    // These two functions are added by Glittle.
    Math.create_rand = function (seed) {
        if (typeof(seed) == 'string') {
            var t = new MersenneTwister(0)
            var a = []
            for (var i = 0; i < seed.length; i++)
                a[i] = seed.charCodeAt(i)
            t.init_by_array(a, a.length)
        } else if (Array.isArray(seed)) {
            var t = new MersenneTwister(0)
            t.init_by_array(seed, seed.length)
        } else if (typeof(seed) == 'number') {
            var t = new MersenneTwister(seed)
        } else {
            var t = new MersenneTwister()
        }
        function func() {
            return t.random()
        }
        func.get_state = () => {
            var a = t.mt.slice(0)
            a.push(t.mti)
            return JSON.stringify(a)
        }
        func.set_state = s => {
            var a = JSON.parse(s)
            t.mt = a.slice(0, a.length - 1)
            t.mti = a[a.length - 1]
        }
        return func
    }
      
    Math.randomSeed = function (seed) {
        Math.random = Math.create_rand(seed)
    }
    // Those previous two functions added by Glittle


    /* The following piece of code is an implementation of MersenneTwister object
       taken from https://gist.github.com/banksean/300494, with one method 
       xor_array(array, size) added.
    */

    /*
      I've wrapped Makoto Matsumoto and Takuji Nishimura's code in a namespace
      so it's better encapsulated. Now you can have multiple random number generators
      and they won't stomp all over eachother's state.

      If you want to use this as a substitute for Math.random(), use the random()
      method like so:

      var m = new MersenneTwister();
      var randomNumber = m.random();

      You can also call the other genrand_{foo}() methods on the instance.

      If you want to use a specific seed in order to get a repeatable random
      sequence, pass an integer into the constructor:

      var m = new MersenneTwister(123);

      and that will always produce the same random sequence.

      Sean McCullough (banksean@gmail.com)
    */

    /* 
       A C-program for MT19937, with initialization improved 2002/1/26.
       Coded by Takuji Nishimura and Makoto Matsumoto.

       Before using, initialize the state by using init_genrand(seed)  
       or init_by_array(init_key, key_length).

       Copyright (C) 1997 - 2002, Makoto Matsumoto and Takuji Nishimura,
       All rights reserved.                          

       Redistribution and use in source and binary forms, with or without
       modification, are permitted provided that the following conditions
       are met:

       1. Redistributions of source code must retain the above copyright
       notice, this list of conditions and the following disclaimer.

       2. Redistributions in binary form must reproduce the above copyright
       notice, this list of conditions and the following disclaimer in the
       documentation and/or other materials provided with the distribution.

       3. The names of its contributors may not be used to endorse or promote 
       products derived from this software without specific prior written 
       permission.

       THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
       "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
       LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
       A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE COPYRIGHT OWNER OR
       CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
       EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
       PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
       PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
       LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
       NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
       SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


       Any feedback is very welcome.
       http://www.math.sci.hiroshima-u.ac.jp/~m-mat/MT/emt.html
       email: m-mat @ math.sci.hiroshima-u.ac.jp (remove space)
    */

    var MersenneTwister = function(seed) {
        if (seed == undefined) {
            seed = new Date().getTime();
        } 
        /* Period parameters */  
        this.N = 624;
        this.M = 397;
        this.MATRIX_A = 0x9908b0df;   /* constant vector a */
        this.UPPER_MASK = 0x80000000; /* most significant w-r bits */
        this.LOWER_MASK = 0x7fffffff; /* least significant r bits */

        this.mt = new Array(this.N); /* the array for the state vector */
        this.mti=this.N+1; /* mti==N+1 means mt[N] is not initialized */

        this.init_genrand(seed);
    }  

    /* initializes mt[N] with a seed */
    MersenneTwister.prototype.init_genrand = function(s) {
        this.mt[0] = s >>> 0;
        for (this.mti=1; this.mti<this.N; this.mti++) {
            var s = this.mt[this.mti-1] ^ (this.mt[this.mti-1] >>> 30);
            this.mt[this.mti] = (((((s & 0xffff0000) >>> 16) * 1812433253) << 16) + (s & 0x0000ffff) * 1812433253)
                + this.mti;
            /* See Knuth TAOCP Vol2. 3rd Ed. P.106 for multiplier. */
            /* In the previous versions, MSBs of the seed affect   */
            /* only MSBs of the array mt[].                        */
            /* 2002/01/09 modified by Makoto Matsumoto             */
            this.mt[this.mti] >>>= 0;
            /* for >32 bit machines */
        }
    }

    /* initialize by an array with array-length */
    /* init_key is the array for initializing keys */
    /* key_length is its length */
    /* slight change for C++, 2004/2/26 */
    MersenneTwister.prototype.init_by_array = function(init_key, key_length) {
        var i, j, k;
        this.init_genrand(19650218);
        i=1; j=0;
        k = (this.N>key_length ? this.N : key_length);
        for (; k; k--) {
            var s = this.mt[i-1] ^ (this.mt[i-1] >>> 30)
            this.mt[i] = (this.mt[i] ^ (((((s & 0xffff0000) >>> 16) * 1664525) << 16) + ((s & 0x0000ffff) * 1664525)))
                + init_key[j] + j; /* non linear */
            this.mt[i] >>>= 0; /* for WORDSIZE > 32 machines */
            i++; j++;
            if (i>=this.N) { this.mt[0] = this.mt[this.N-1]; i=1; }
            if (j>=key_length) j=0;
        }
        for (k=this.N-1; k; k--) {
            var s = this.mt[i-1] ^ (this.mt[i-1] >>> 30);
            this.mt[i] = (this.mt[i] ^ (((((s & 0xffff0000) >>> 16) * 1566083941) << 16) + (s & 0x0000ffff) * 1566083941))
                - i; /* non linear */
            this.mt[i] >>>= 0; /* for WORDSIZE > 32 machines */
            i++;
            if (i>=this.N) { this.mt[0] = this.mt[this.N-1]; i=1; }
        }

        this.mt[0] = 0x80000000; /* MSB is 1; assuring non-zero initial array */ 
    }

    /* XORs the mt array with a given array xor_key of length key_length */
    MersenneTwister.prototype.xor_array = function(xor_key, key_length) {
        var i, j;
        j = 0;
        for (i = 0; i < this.N; i++) {
            this.mt[i] ^= xor_key[j];
            this.mt[i] >>>= 0;
            j++;
            if (j >= key_length) j = 0;
        }
    }

    /* generates a random number on [0,0xffffffff]-interval */
    MersenneTwister.prototype.genrand_int32 = function() {
        var y;
        var mag01 = new Array(0x0, this.MATRIX_A);
        /* mag01[x] = x * MATRIX_A  for x=0,1 */

        if (this.mti >= this.N) { /* generate N words at one time */
            var kk;

            if (this.mti == this.N+1)   /* if init_genrand() has not been called, */
                this.init_genrand(5489); /* a default initial seed is used */

            for (kk=0;kk<this.N-this.M;kk++) {
                y = (this.mt[kk]&this.UPPER_MASK)|(this.mt[kk+1]&this.LOWER_MASK);
                this.mt[kk] = this.mt[kk+this.M] ^ (y >>> 1) ^ mag01[y & 0x1];
            }
            for (;kk<this.N-1;kk++) {
                y = (this.mt[kk]&this.UPPER_MASK)|(this.mt[kk+1]&this.LOWER_MASK);
                this.mt[kk] = this.mt[kk+(this.M-this.N)] ^ (y >>> 1) ^ mag01[y & 0x1];
            }
            y = (this.mt[this.N-1]&this.UPPER_MASK)|(this.mt[0]&this.LOWER_MASK);
            this.mt[this.N-1] = this.mt[this.M-1] ^ (y >>> 1) ^ mag01[y & 0x1];

            this.mti = 0;
        }

        y = this.mt[this.mti++];

        /* Tempering */
        y ^= (y >>> 11);
        y ^= (y << 7) & 0x9d2c5680;
        y ^= (y << 15) & 0xefc60000;
        y ^= (y >>> 18);

        return y >>> 0;
    }

    /* generates a random number on [0,0x7fffffff]-interval */
    MersenneTwister.prototype.genrand_int31 = function() {
        return (this.genrand_int32()>>>1);
    }

    /* generates a random number on [0,1]-real-interval */
    MersenneTwister.prototype.genrand_real1 = function() {
        return this.genrand_int32()*(1.0/4294967295.0); 
        /* divided by 2^32-1 */ 
    }

    /* generates a random number on [0,1)-real-interval */
    MersenneTwister.prototype.random = function() {
        return this.genrand_int32()*(1.0/4294967296.0); 
        /* divided by 2^32 */
    }

    /* generates a random number on (0,1)-real-interval */
    MersenneTwister.prototype.genrand_real3 = function() {
        return (this.genrand_int32() + 0.5)*(1.0/4294967296.0); 
        /* divided by 2^32 */
    }

    /* generates a random number on [0,1) with 53-bit resolution*/
    MersenneTwister.prototype.genrand_res53 = function() { 
        var a=this.genrand_int32()>>>5, b=this.genrand_int32()>>>6; 
        return(a*67108864.0+b)*(1.0/9007199254740992.0); 
    } 
    /* These real versions are due to Isaku Wada, 2002/01/09 added */
}
// Binding event handlers to a node

module.exports = require.events = function add_control(node) {
    var u = require('./utilities.js')

    // ===============================================
    //
    //   Bindings:
    //
    //         Attaching pipes to events
    //
    
    function pattern_matcher () {
        // The pipes attached to each key, maps e.g. 'get /point/3' to '/30'
        var handlers = u.one_to_many()
        var wildcard_handlers = []  // An array of {prefix, funk}

        var matcher = {
    // A set of timers, for keys to send forgets on
            bind (key, pipe, allow_wildcards) {
                allow_wildcards = true // temporarily
                if (allow_wildcards && key[key.length-1] === '*')
                    wildcard_handlers.push({prefix: key, pipe: pipe})
                else
                    handlers.add(key, pipe.id, pipe)

                // Now check if the method is a get and there's a gotton
                // key in this space, and if so call the handler.
            },

            unbind (key, pipe, allow_wildcards) {
                allow_wildcards = true // temporarily
                if (allow_wildcards && key[key.length-1] === '*')
                    // Delete wildcard connection
                    for (var i=0; i<wildcard_handlers.length; i++) {
                        var handler = wildcard_handlers[i]
                        if (handler.prefix === key && handler.pipe.id === pipe.id) {
                            wildcard_handlers.splice(i,1)  // Splice this element out of the array
                            i--                            // And decrement the counter while we're looping
                        }
                    }
                else
                    // Delete direct connection
                    handlers.delete(key, pipe.id)
            },

            bindings (key) {
                // Note:
                //
                // We need the bindings that persist state to the database to come
                // first.  In statebus we added a .priority flag to them, and
                // processed those priority handlers first.  We haven't implemented
                // that yet, and are just relying on setting these handlers first in
                // the array and hash, which makes them come first.  But we need to
                // make this more robust in the future.
                //
                // We might, instead of doing a .priority flag, have separate
                // .on_change and .on_change_sync handlers.  Then the database stuff
                // would go there.

                assert(typeof key === 'string',
                       'Error: "' + key + '" is not a string')

                var result = u.dict()

                // First get the exact key matches
                var pipes = handlers.get(key)
                for (var i=0; i < pipes.length; i++)
                    result[pipes[i].id] = pipes[i]

                // Now iterate through prefixes
                for (var i=0; i < wildcard_handlers.length; i++) {
                    var handler = wildcard_handlers[i]
                    var prefix = handler.prefix.slice(0, -1)       // Cut off the *

                    if (prefix === key.substr(0,prefix.length))
                        // If the prefix matches, add it to the list!
                        result[handler.pipe.id] = handler.pipe
                }
                return Object.values(result)
            }
        }
        return matcher
    }

    // Give the node all methods of a pattern matcher, to bind keys and pipes
    Object.assign(node, pattern_matcher())

    node.remotes = (key) => node.bindings(key).filter( pipe => pipe.remote )

    node.welcomed_peers = (key) => {
        var r = node.resource_at(key)
        return node.bindings(key).filter(pipe => pipe.remote && r.we_welcomed[pipe.id])
    }
}
// Adapted from https://github.com/dglittle/cdn/blob/gh-pages/sync9_047.html

module.exports = require.sync9 = function create (resource) {
    if (!resource.space_dag) resource.space_dag = null
    return {
        add_version: function (version, parents, patches, is_anc) {
            return add_version(resource, version, parents, patches, is_anc)
        },

        read: function (version) {
            return read(resource, version)
        },

        read_raw: function (version) {
            return read_raw(resource, version)
        },

        prune: function (has_everyone_whos_seen_a_seen_b, has_everyone_whos_seen_a_seen_b2, seen_annotations) {
            prune(resource, has_everyone_whos_seen_a_seen_b, has_everyone_whos_seen_a_seen_b2, seen_annotations)
        },

        change_names: function (name_changes) {
            change_names(resource, name_changes)
        },

        generate_braid: function(is_anc
                                   /*from_parents, to_parents*/) {
            return generate_braid(resource, is_anc)
        }
    }
}

function generate_braid(resource, is_anc) {
    if (Object.keys(resource.time_dag).length === 0) return []

    var is_lit = x => !x || typeof(x) != 'object' || x.t == 'lit'
    var get_lit = x => (x && typeof(x) == 'object' && x.t == 'lit') ? x.S : x
    
    var versions = [{
        version: null,
        parents: {},
        changes: [` = ${JSON.stringify(read_raw(resource, is_anc))}`]
    }]
    Object.keys(resource.time_dag).filter(x => !is_anc(x)).forEach(version => {
        var ancs = resource.ancestors({[version]: true})
        delete ancs[version]
        var is_anc = x => ancs[x]
        var path = []
        var changes = []
        recurse(resource.space_dag)
        function recurse(x) {
            if (is_lit(x)) {
            } else if (x.t == 'val') {
                space_dag_generate_braid(x.S, resource, version, is_anc).forEach(s => {
                    if (s[2].length) changes.push(`${path.join('')} = ${JSON.stringify(s[2][0])}`)
                })
                traverse_space_dag(x.S, is_anc, node => {
                    node.elems.forEach(recurse)
                })
            } else if (x.t == 'arr') {
                space_dag_generate_braid(x.S, resource, version, is_anc).forEach(s => {
                    changes.push(`${path.join('')}[${s[0]}:${s[0] + s[1]}] = ${JSON.stringify(s[2])}`)
                })
                var i = 0
                traverse_space_dag(x.S, is_anc, node => {
                    node.elems.forEach(e => {
                        path.push(`[${i++}]`)
                        recurse(e)
                        path.pop()
                    })
                })
            } else if (x.t == 'obj') {
                Object.entries(x.S).forEach(e => {
                    path.push('[' + JSON.stringify(e[0]) + ']')
                    recurse(e[1])
                    path.pop()
                })
            } else if (x.t == 'str') {
                space_dag_generate_braid(x.S, resource, version, is_anc).forEach(s => {
                    changes.push(`${path.join('')}[${s[0]}:${s[0] + s[1]}] = ${JSON.stringify(s[2])}`)
                })
            }
        }
        
        versions.push({
            version,
            parents: Object.assign({}, resource.time_dag[version]),
            changes
        })
    })
    return versions
}

function space_dag_generate_braid(S, resource, version, is_anc) {
    var splices = []
    
    function add_result(offset, del, ins) {
        if (typeof(ins) != 'string')
            ins = ins.map(x => read_raw(x, () => false))
        if (splices.length > 0) {
            var prev = splices[splices.length - 1]
            if (prev[0] + prev[1] == offset) {
                prev[1] += del
                prev[2] = prev[2].concat(ins)
                return
            }
        }
        splices.push([offset, del, ins])
    }
    
    var offset = 0
    function helper(node, _version) {
        if (_version == version) {
            add_result(offset, 0, node.elems.slice(0))
        } else if (node.deleted_by[version] && node.elems.length > 0) {
            add_result(offset, node.elems.length, node.elems.slice(0, 0))
        }
        
        if ((!_version || is_anc(_version)) && !Object.keys(node.deleted_by).some(is_anc)) {
            offset += node.elems.length
        }
        
        node.nexts.forEach(next => helper(next, next.version))
        if (node.next) helper(node.next, _version)
    }
    helper(S, null)
    return splices
}



function prune(x, has_everyone_whos_seen_a_seen_b, has_everyone_whos_seen_a_seen_b2, seen_annotations) {
    var seen_versions = {}
    var is_lit = x => !x || typeof(x) != 'object' || x.t == 'lit'
    var get_lit = x => (x && typeof(x) == 'object' && x.t == 'lit') ? x.S : x

    seen_annotations = seen_annotations || {}
    see_annotations(x.space_dag)
    function see_annotations(x, is_lit_override) {
        if (is_lit_override || is_lit(x)) {
            if (!is_lit_override && x && typeof(x) == 'object' && x.t == 'lit') x = x.S
            if (Array.isArray(x)) for (y of x) see_annotations(y, true)
            else if (x && typeof(x) == 'object') {
                if (x.type == 'location') seen_annotations[x.id] = true
                else for (y of Object.values(x)) see_annotations(y, true)
            }
        } else if (x.t == 'val') {
            traverse_space_dag(x.S, () => true, node => {
                node.elems.forEach(x => see_annotations(x))
            }, true)
        } else if (x.t == 'arr') {
            traverse_space_dag(x.S, () => true, node => {
                node.elems.forEach(x => see_annotations(x))
            }, true)
        } else if (x.t == 'obj') {
            Object.values(x.S).forEach(x => see_annotations(x))
        }
    }

    function recurse(x) {
        if (is_lit(x)) return x
        if (x.t == 'val') {
            space_dag_prune(x.S, has_everyone_whos_seen_a_seen_b, seen_versions)
            traverse_space_dag(x.S, () => true, node => {
                node.elems = node.elems.slice(0, 1).map(recurse)
            }, true)
            if (x.S.nexts.length == 0 && !x.S.next && x.S.elems.length == 1 && is_lit(x.S.elems[0])) return x.S.elems[0]
            return x
        }
        if (x.t == 'arr') {
            space_dag_prune(x.S, has_everyone_whos_seen_a_seen_b, seen_versions, seen_annotations)
            traverse_space_dag(x.S, () => true, node => {
                node.elems = node.elems.map(recurse)
            }, true)
            if (x.S.nexts.length == 0 && !x.S.next && x.S.elems.every(is_lit) && !Object.keys(x.S.deleted_by).length && !x.S.annotations) return {t: 'lit', S: x.S.elems.map(get_lit)}
            return x
        }
        if (x.t == 'obj') {
            Object.entries(x.S).forEach(e => {
                var y = x.S[e[0]] = recurse(e[1])
                if (is_lit(y) && y && typeof(y) == 'object' && y.S.type == 'deleted')
                    delete x.S[e[0]]
            })
            if (Object.values(x.S).every(is_lit)) {
                var o = {}
                Object.entries(x.S).forEach(e => o[e[0]] = get_lit(e[1]))
                return {t: 'lit', S: o}
            }
            return x
        }
        if (x.t == 'str') {
            space_dag_prune(x.S, has_everyone_whos_seen_a_seen_b, seen_versions, seen_annotations)
            if (x.S.nexts.length == 0 && !x.S.next && !Object.keys(x.S.deleted_by).length && !x.S.annotations) return x.S.elems
            return x
        }
    }
    x.space_dag = recurse(x.space_dag)

    var delete_us = {}
    var children = {}
    Object.keys(x.time_dag).forEach(y => {
        Object.keys(x.time_dag[y]).forEach(z => {
            if (!children[z]) children[z] = {}
            children[z][y] = true
        })
    })
    Object.keys(x.time_dag).forEach(y => {
        if (!seen_versions[y] && Object.keys(children[y] || {}).some(z => has_everyone_whos_seen_a_seen_b2(y, z))) delete_us[y] = true
    })

    var visited = {}
    var forwards = {}
    function g(version) {
        if (visited[version]) return
        visited[version] = true
        if (delete_us[version])
            forwards[version] = {}
        Object.keys(x.time_dag[version]).forEach(pid => {
            g(pid)
            if (delete_us[version]) {
                if (delete_us[pid])
                    Object.assign(forwards[version], forwards[pid])
                else
                    forwards[version][pid] = true
            } else if (delete_us[pid]) {
                delete x.time_dag[version][pid]
                Object.assign(x.time_dag[version], forwards[pid])
            }
        })
    }
    Object.keys(x.current_version).forEach(g)
    Object.keys(delete_us).forEach(version => delete x.time_dag[version])
    return delete_us
}

function space_dag_prune(S, has_everyone_whos_seen_a_seen_b, seen_versions, seen_annotations) {
    function set_nnnext(node, next) {
        while (node.next) node = node.next
        node.next = next
    }
    function process_node(node, offset, version, prev) {
        var nexts = node.nexts
        var next = node.next

        var did_something = false

        if (node.annotations) {
            for (k of Object.keys(node.annotations))
                if (!seen_annotations[k]) {
                    delete node.annotations[k]
                    did_something = true
                }
            if (Object.keys(node.annotations).length == 0) {
                delete node.annotations
                did_something = true
            }
        }
        
        var all_nexts_prunable = nexts.every(x => has_everyone_whos_seen_a_seen_b(version, x.version))
        if (nexts.length > 0 && all_nexts_prunable) {
            var first_prunable = 0
            var gamma = next
            if (first_prunable + 1 < nexts.length) {
                gamma = create_space_dag_node(null, typeof(node.elems) == 'string' ? '' : [])
                gamma.nexts = nexts.slice(first_prunable + 1)
                gamma.next = next
            }
            if (first_prunable == 0) {
                if (nexts[0].elems.length == 0 && !nexts[0].end_cap && nexts[0].nexts.length > 0) {
                    var beta = gamma
                    if (nexts[0].next) {
                        beta = nexts[0].next
                        set_nnnext(beta, gamma)
                    }
                    node.nexts = nexts[0].nexts
                    node.next = beta
                } else {
                    delete node.end_cap
                    node.nexts = []
                    node.next = nexts[0]
                    node.next.version = null
                    set_nnnext(node, gamma)
                }
            } else {
                node.nexts = nexts.slice(0, first_prunable)
                node.next = nexts[first_prunable]
                node.next.version = null
                set_nnnext(node, gamma)
            }
            return true
        }
        
        if (Object.keys(node.deleted_by).some(k => has_everyone_whos_seen_a_seen_b(version, k))) {
            if (!node.annotations) {
                node.deleted_by = {}
                node.elems = node.elems.slice(0, 0)
                delete node.gash
                return true
            } else {
                if (node.elems.length > 1) {
                    node.elems = node.elems.slice(0, 1)
                    did_something = true
                }
                Object.assign(seen_versions, node.deleted_by)
            }
        } else {
            Object.assign(seen_versions, node.deleted_by)
        }
        
        if (next && !next.nexts[0] && (Object.keys(next.deleted_by).some(k => has_everyone_whos_seen_a_seen_b(version, k)) || next.elems.length == 0)) {

            if (next.annotations) {
                node.annotations = node.annotations || {}
                Object.entries(next.annotations).forEach(e => {
                    node.annotations[e[0]] = node.elems.length
                })
            }

            node.next = next.next
            return true
        }
        
        if (nexts.length == 0 && next &&
            !(next.elems.length == 0 && !next.end_cap && next.nexts.length > 0) &&
            Object.keys(node.deleted_by).every(x => next.deleted_by[x]) &&
            Object.keys(next.deleted_by).every(x => node.deleted_by[x])) {

            if (next.annotations) {
                node.annotations = node.annotations || {}
                Object.entries(next.annotations).forEach(e => {
                    node.annotations[e[0]] = e[1] + node.elems.length
                })
            }

            node.elems = node.elems.concat(next.elems)
            node.end_cap = next.end_cap
            node.nexts = next.nexts
            node.next = next.next
            return true
        }

        return did_something
    }
    
    var did_something_ever = false
    var did_something_this_time = true
    while (did_something_this_time) {
        did_something_this_time = false
        traverse_space_dag(S, () => true, (node, offset, has_nexts, prev, version) => {
            if (process_node(node, offset, version, prev)) {
                did_something_this_time = true
                did_something_ever = true
            }
        }, true)
    }
    traverse_space_dag(S, () => true, (node, offset, has_nexts, prev, version) => {
        if (version) seen_versions[version] = true
    }, true)
    return did_something_ever
}

function change_names(resource, name_changes) {
    resource.time_dag = Object.assign({},
        ...Object.entries(resource.time_dag).map(([v, ps]) =>
            ({[name_changes[v] || v]: Object.assign({},
                ...Object.keys(ps).map(v =>
                    ({[name_changes[v] || v]: true})))})))

    var is_lit = x => !x || typeof(x) != 'object' || x.t == 'lit'

    function recurse(x) {
        if (is_lit(x)) return
        else if (x.t == 'val') {
            space_dag_change_names(x.S, name_changes)
            traverse_space_dag(x.S, () => true, node => {
                node.elems.forEach(recurse)
            }, true)
        } else if (x.t == 'arr') {
            space_dag_change_names(x.S, name_changes)
            traverse_space_dag(x.S, () => true, node => {
                node.elems.forEach(recurse)
            }, true)
        } else if (x.t == 'obj') {
            Object.values(x.S).forEach(recurse)
        } else if (x.t == 'str') {
            space_dag_change_names(x.S, name_changes)
        }
    }
    recurse(resource.space_dag)
}

function space_dag_change_names(S, name_changes) {
    traverse_space_dag(S, () => true, node => {
        var new_v = name_changes[node.version]
        if (new_v) node.version = new_v
        Object.keys(node.deleted_by).forEach(v => {
            var new_v = name_changes[v]
            if (new_v) {
                delete node.deleted_by[v]
                node.deleted_by[new_v] = true
            }
        })
    }, true)
}

function add_version(resource, version, parents, changes, is_anc) {
    let make_lit = x => (x && typeof(x) == 'object') ? {t: 'lit', S: x} : x
    
    if (!version && Object.keys(resource.time_dag).length == 0) {
        var parse = parse_change(changes[0])
        resource.space_dag = make_lit(parse.val)
        create_annotations(parse)
        return
    } else if (!version) return
    
    if (resource.time_dag[version]) return
    resource.time_dag[version] = Object.assign({}, parents)
    
    Object.keys(parents).forEach(k => {
        if (resource.current_version[k]) delete resource.current_version[k]
    })
    resource.current_version[version] = true
    
    if (!is_anc) {
        if (parents == resource.current_version)
            is_anc = (_version) => _version != version
        else {
            var ancs = resource.ancestors(parents)
            is_anc = _version => ancs[_version]
        }
    }

    function create_annotations(parse) {
        Object.entries(parse.annotations || {}).forEach(e => {
            e[1].range = [0, 0]
            var cur = resolve_path(e[1])
            function helper(node, offset) {
                if (offset <= e[1].pos && e[1].pos <= offset + node.elems.length) {
                    node.annotations = node.annotations || {}
                    node.annotations[e[0]] = e[1].pos - offset
                    return false
                }
            }
            if (e[1].pos == 0) helper(cur.S, 0)
            else traverse_space_dag(cur.S, is_anc, helper)
        })
    }
    
    changes.forEach(change => {
        var parse = parse_change(change)
        create_annotations(parse)
        var cur = resolve_path(parse)
        if (!parse.range) {
            if (cur.t != 'val') throw 'bad'
            var len = space_dag_length(cur.S, is_anc)
            space_dag_add_version(cur.S, version, [[0, len, [parse.delete ? make_lit({type: 'deleted'}) : make_lit(parse.val)]]], is_anc)
        } else {
            if (typeof parse.val === 'string' && cur.t !== 'str')
                throw `Cannot splice string ${JSON.stringify(parse.val)} into non-string`
            if (parse.val instanceof Array && cur.t !== 'arr')
                throw `Cannot splice array ${JSON.stringify(parse.val)} into non-array`
            if (parse.val instanceof Array) parse.val = parse.val.map(x => make_lit(x))
            space_dag_add_version(cur.S, version, [[parse.range[0], parse.range[1] - parse.range[0], parse.val]], is_anc)
        }
    })

    function resolve_path(parse) {
        var cur = resource.space_dag
        if (!cur || typeof(cur) != 'object' || cur.t == 'lit')
            cur = resource.space_dag = {t: 'val', S: create_space_dag_node(null, [cur])}
        var prev_S = null
        var prev_i = 0
        for (var i=0; i<parse.keys.length; i++) {
            var key = parse.keys[i]
            if (cur.t == 'val') cur = space_dag_get(prev_S = cur.S, prev_i = 0, is_anc)
            if (cur.t == 'lit') {
                var new_cur = {}
                if (cur.S instanceof Array) {
                    new_cur.t = 'arr'
                    new_cur.S = create_space_dag_node(null, cur.S.map(x => make_lit(x)))
                } else {
                    if (typeof(cur.S) != 'object') throw 'bad'
                    new_cur.t = 'obj'
                    new_cur.S = {}
                    Object.entries(cur.S).forEach(e => new_cur.S[e[0]] = make_lit(e[1]))
                }
                cur = new_cur
                space_dag_set(prev_S, prev_i, cur, is_anc)
            }
            if (cur.t == 'obj') {
                let x = cur.S[key]
                if (!x || typeof(x) != 'object' || x.t == 'lit')
                    x = cur.S[key] = {t: 'val', S: create_space_dag_node(null, [x == undefined ? {t: 'lit', S: {type: 'deleted'}} : x])}
                cur = x
            } else if (i == parse.keys.length - 1 && !parse.range) {
                parse.range = [key, key + 1]
                parse.val = (cur.t == 'str') ? parse.val : [parse.val]
            } else if (cur.t == 'arr') {
                cur = space_dag_get(prev_S = cur.S, prev_i = key, is_anc)
            } else throw 'bad'
        }
        if (parse.range) {
            if (cur.t == 'val') cur = space_dag_get(prev_S = cur.S, prev_i = 0, is_anc)
            if (typeof(cur) == 'string') {
                cur = {t: 'str', S: create_space_dag_node(null, cur)}
                space_dag_set(prev_S, prev_i, cur, is_anc)
            } else if (cur.t == 'lit') {
                if (!(cur.S instanceof Array)) throw 'bad'
                cur = {t: 'arr', S: create_space_dag_node(null, cur.S.map(x => make_lit(x)))}
                space_dag_set(prev_S, prev_i, cur, is_anc)
            }
        }
        return cur
    }
}

function read(x, is_anc) {
    if (!is_anc) is_anc = () => true
    var annotations = {}
    return finalize(read_raw(x, is_anc, annotations))
    function finalize(x) {
        if (Array.isArray(x))
            for (var i = 0; i < x.length; i++) x[i] = finalize(x[i])
        else if (x && typeof(x) == 'object') {
            if (x.type == 'location')
                return annotations[x.id]
            else {
                var y = {}
                Object.entries(x).forEach(e => {
                    if (e[1] && typeof(e[1]) == 'object' && e[1].type == 'deleted') return
                    var key = e[0].match(/^_+type$/) ? e[0].slice(1) : e[0]
                    y[key] = finalize(e[1])
                })
                return y
            }
        }
        return x
    }
}

function read_raw(x, is_anc, annotations) {
    if (!is_anc) is_anc = () => true
    else if (typeof(is_anc) == 'string') {
        var ancs = x.ancestors({[is_anc]: true})
        is_anc = v => ancs[v]
    } else if (typeof(is_anc) == 'object') {
        var ancs = x.ancestors(is_anc)
        is_anc = v => ancs[v]
    }

    return finalize(rec_read(x))
    function rec_read(x) {
        if (x && typeof(x) == 'object') {
            if (!x.t) return rec_read(x.space_dag, is_anc)
            if (x.t == 'lit') return JSON.parse(JSON.stringify(x.S))
            if (x.t == 'val') return rec_read(space_dag_get(x.S, 0, is_anc), is_anc)
            if (x.t == 'obj') {
                var o = {}
                Object.entries(x.S).forEach(([k, v]) => o[k] = rec_read(v, is_anc))
                return o
            }
            if (x.t == 'arr') {
                var a = []
                traverse_space_dag(x.S, is_anc, (node, _, __, ___, ____, deleted) => {
                    if (annotations && node.annotations) Object.entries(node.annotations).forEach(e => {
                        annotations[e[0]] = a.length + (deleted ? 0 : e[1])
                    })
                    if (!deleted) {
                        node.elems.forEach((e) => {
                            a.push(rec_read(e, is_anc))
                        })
                    }
                }, true)
                return a
            }
            if (x.t == 'str') {
                var s = []
                var len = 0
                traverse_space_dag(x.S, is_anc, (node, _, __, ___, ____, deleted) => {
                    if (annotations && node.annotations) Object.entries(node.annotations).forEach(e => {
                        annotations[e[0]] = len + (deleted ? 0 : e[1])
                    })
                    if (!deleted) {
                        s.push(node.elems)
                        len += node.elems.length
                    }
                }, true)
                return s.join('')
            }
            throw 'bad'
        } return x
    }
    function finalize(x) {
        if (Array.isArray(x)) x.forEach(x => finalize(x))
        else if (x && typeof(x) == 'object') {
            if (!annotations && x.type == 'location') delete x.id
            else Object.values(x).forEach(x => finalize(x))
        }
        return x
    }
}

function create_space_dag_node(version, elems, end_cap) {
    return {
        version : version,
        elems : elems,
        deleted_by : {},
        end_cap : end_cap,
        nexts : [],
        next : null
    }
}

function space_dag_get(S, i, is_anc) {
    var ret = null
    var offset = 0
    traverse_space_dag(S, is_anc ? is_anc : () => true, (node) => {
        if (i - offset < node.elems.length) {
            ret = node.elems[i - offset]
            return false
        }
        offset += node.elems.length
    })
    return ret
}

function space_dag_set(S, i, v, is_anc) {
    var offset = 0
    traverse_space_dag(S, is_anc ? is_anc : () => true, (node) => {
        if (i - offset < node.elems.length) {
            node.elems[i - offset] = v
            return false
        }
        offset += node.elems.length
    })
}

function space_dag_length(S, is_anc) {
    var count = 0
    traverse_space_dag(S, is_anc ? is_anc : () => true, node => {
        count += node.elems.length
    })
    return count
}

function space_dag_break_node(node, x, end_cap, new_next) {
    var tail = create_space_dag_node(null, node.elems.slice(x), node.end_cap)
    Object.assign(tail.deleted_by, node.deleted_by)
    tail.nexts = node.nexts
    tail.next = node.next
    
    node.elems = node.elems.slice(0, x)
    node.end_cap = end_cap
    if (end_cap) tail.gash = true
    node.nexts = new_next ? [new_next] : []
    node.next = tail

    var annotations = node.annotations || {}
    delete node.annotations
    Object.entries(annotations).forEach(e => {
        if (e[1] <= x) {
            node.annotations = node.annotations || {}
            node.annotations[e[0]] = e[1]
        } else {
            tail.annotations = tail.annotations || {}
            tail.annotations[e[0]] = e[1] - x
        }
    })
    
    return tail
}

function space_dag_add_version(S, version, splices, is_anc) {
    
    function add_to_nexts(nexts, to) {
        var i = binarySearch(nexts, function (x) {
            if (to.version < x.version) return -1
            if (to.version > x.version) return 1
            return 0
        })
        nexts.splice(i, 0, to)
    }
    
    var si = 0
    var delete_up_to = 0
    
    // `node` is a patch
    var process_patch = (node, offset, has_nexts, prev, _version, deleted) => {
        var s = splices[si]
        if (!s) return false
        
        if (deleted) {
            if (s[1] == 0 && s[0] == offset) {
                if (node.elems.length == 0 && !node.end_cap && has_nexts) return
                var new_node = create_space_dag_node(version, s[2])
                if (node.elems.length == 0 && !node.end_cap)
                    add_to_nexts(node.nexts, new_node)
                else
                    space_dag_break_node(node, 0, undefined, new_node)
                si++
            }
            return            
        }
        
        if (s[1] == 0) {
            var d = s[0] - (offset + node.elems.length)
            if (d > 0) return
            if (d == 0 && !node.end_cap && has_nexts) return
            var new_node = create_space_dag_node(version, s[2])
            if (d == 0 && !node.end_cap) {
                add_to_nexts(node.nexts, new_node)
            } else {
                space_dag_break_node(node, s[0] - offset, undefined, new_node)
            }
            si++
            return
        }
        
        if (delete_up_to <= offset) {
            var d = s[0] - (offset + node.elems.length)
            if (d >= 0) return
            delete_up_to = s[0] + s[1]
            
            if (s[2]) {
                var new_node = create_space_dag_node(version, s[2])
                if (s[0] == offset && node.gash) {
                    if (!prev.end_cap) throw 'no end_cap?'
                    add_to_nexts(prev.nexts, new_node)
                } else {
                    space_dag_break_node(node, s[0] - offset, true, new_node)
                    return
                }
            } else {
                if (s[0] == offset) {
                } else {
                    space_dag_break_node(node, s[0] - offset)
                    return
                }
            }
        }
        
        if (delete_up_to > offset) {
            if (delete_up_to <= offset + node.elems.length) {
                if (delete_up_to < offset + node.elems.length) {
                    space_dag_break_node(node, delete_up_to - offset)
                }
                si++
            }
            node.deleted_by[version] = true
            return
        }
    }
    
    var f = is_anc
    var exit_early = {}
    var offset = 0
    function traverse(node, prev, version) {
        var has_nexts = node.nexts.find(next => f(next.version))
        var deleted = Object.keys(node.deleted_by).some(version => f(version))
        if (process_patch(node, offset, has_nexts, prev, version, deleted) == false)
            throw exit_early
        if (!deleted) {
            offset += node.elems.length
        }
        for (var next of node.nexts)
            if (f(next.version)) traverse(next, null, next.version)
        if (node.next) traverse(node.next, node, version)
    }
    try {
        if (!S) debugger
        traverse(S, null, S.version)
    } catch (e) {
        if (e != exit_early) throw e
    }
    
}

function traverse_space_dag(S, f, cb, view_deleted, tail_cb) {
    var exit_early = {}
    var offset = 0
    function helper(node, prev, version) {
        var has_nexts = node.nexts.find(next => f(next.version))
        var deleted = Object.keys(node.deleted_by).some(version => f(version))
        if (view_deleted || !deleted) {
            if (cb(node, offset, has_nexts, prev, version, deleted) == false)
                throw exit_early
            offset += node.elems.length
        }
        for (var next of node.nexts)
            if (f(next.version)) helper(next, null, next.version)
        if (node.next) helper(node.next, node, version)
        else if (tail_cb) tail_cb(node)
    }
    try {
        helper(S, null, S.version)
    } catch (e) {
        if (e != exit_early) throw e
    }
}

function parse_change(change) {
    var ret = { keys : [] }
    var re = /^(delete)\s+|\.?([^\.\[ =]+)|\[((\-?\d+)(:\-?\d+)?|'(\\'|[^'])*'|"(\\"|[^"])*")\]|\s*=\s*([\s\S]*)/g
    var m
    while (m = re.exec(change)) {
        if (m[1])
            ret.delete = true
        else if (m[2])
            ret.keys.push(m[2])
        else if (m[3] && m[5])
            ret.range = [
                JSON.parse(m[4]),
                JSON.parse(m[5].substr(1))
            ]
        else if (m[3])
            ret.keys.push(JSON.parse(m[3]))
        else if (m[8]) {
            ret.val = JSON.parse(m[8])
            rec(ret.val)
            function rec(x) {
                if (x && typeof(x) == 'object') {
                    if (x instanceof Array) {
                        for (var i = 0; i < x.length; i++) rec(x[i])
                    } else {
                        if (Object.keys(x).find(k => k == 'type' && x[k] == 'location')) {
                            x.id = Math.random().toString(36).slice(2)

                            ret.annotations = ret.annotations || {}
                            var path = parse_change(x.path).keys
                            ret.annotations[x.id] = {
                                keys: path.slice(0, path.length - 1),
                                pos: path[path.length - 1]
                            }
                        } else for (let k of Object.keys(x)) rec(x[k])
                    }
                }
            }
        }
    }
    return ret
}


// modified from https://stackoverflow.com/questions/22697936/binary-search-in-javascript
function binarySearch(ar, compare_fn) {
    var m = 0;
    var n = ar.length - 1;
    while (m <= n) {
        var k = (n + m) >> 1;
        var cmp = compare_fn(ar[k]);
        if (cmp > 0) {
            m = k + 1;
        } else if(cmp < 0) {
            n = k - 1;
        } else {
            return k;
        }
    }
    return m;
}

u = require('./utilities.js')

module.exports = require.node = function create_node(node_data = {}) {
    var node = {}
    node.init = (node_data) => {
        node.pid = node_data.pid || u.random_id()
        node.resources = node_data.resources || {}
        for (var key of Object.keys(node.resources)) {
            node.resources[key] = require('./resource.js')(node.resources[key])
        }
        if (node_data.fissure_lifetime != null) node.fissure_lifetime = node_data.fissure_lifetime

        node.defaults = Object.assign(u.dict(), node.defaults || {})
        node.default_patterns = node.default_patterns || []

        node.ons = []
        node.on_errors = []
    
        node.gets_in      = u.one_to_many()  // Maps `key' to `pipes' subscribed to our key
        // var gets_out     = u.one_to_many()  // Maps `key' to `pipes' we get()ed `key' over
        // var pending_gets = u.one_to_many()  // Maps `key' to `pipes' that haven't responded    
    }
    node.init(node_data)

    node.resource_at = (key) => {
        if (typeof key !== 'string')
            throw (JSON.stringify(key) + ' is not a key!')
        if (!node.resources[key])
            node.resources[key] = require('./resource.js')()

        return node.resources[key]
    }

    function add_full_ack_leaf(resource, version) {

        // G: someone is telling us that "version" is fully (globally) acknowledged,
        // and this fact implies that every ancestor of version is also fully
        // acknowledged, which means that we don't need to keep certain information
        // about them, like "acks_in_process".. this next section simply
        // iterates over all the ancestors (including this version itself) and deletes
        // information we don't need anymore for each one..

        var marks = {}
        function f(v) {
            if (!marks[v]) {
                marks[v] = true
                delete resource.unack_boundary[v]
                delete resource.acked_boundary[v]
                delete resource.acks_in_process[v]
                delete resource.joiners[v]
                Object.keys(resource.time_dag[v]).forEach(f)
            }
        }
        f(version)

        // G: now that old information is gone, we need to add one bit of new
        // information, namely that this version is fully acknowledged,
        // which we express by putting it in the "acked_boundary" (and we hope
        // that nobody calls this function on a version which is already fully
        // acknowledged; you can check the two places where this function is called
        // to verify that they guard against calling this function on a version
        // which is already fully acknowledged.. note that one does so by noting
        // that "acks_in_process" will always be null for versions which are fully
        // acknowledged, because "acks_in_process" is deleted in section above
        // for all such versions)

        resource.acked_boundary[version] = true

        // G: next we're going to prune.. really we could call prune whenever we want,
        // this is just a somewhat reasonable time, since there is some chance
        // that with this new full acknowledgment, that we might be able to prune
        // more stuff than we could prune before (but we could also let the user
        // call "prune" explicitly at their leisure)

        node.prune(resource)
    }
    
    function check_ack_count(key, resource, version) {
        // TODO: could this only take key, instead of key and resource?  Or
        // perhaps a resource should know its key?
        assert(!resource.acks_in_process[version]
               || resource.acks_in_process[version].count >= 0,
               'Acks have gone below zero!',
               {key, version,
                acks_in_process: resource.acks_in_process[version]})

        // G: this function gets called from a couple of places, basically whenever
        // someone suspects that the "count" within "acks_in_process" may have changed,
        // since it might have gone all the way to zero, in which case we will act...
        // of course, in some such instances, acks_in_process may have been removed
        // entirely for a version, so we guard against that here, too..

        if (resource.acks_in_process[version]
            && resource.acks_in_process[version].count == 0) {

            // G: sweet, the count has gone to zero, that means all the acks we were
            // waiting for have arrived, now there are a couple possibilities..

            if (resource.acks_in_process[version].origin) {

                // G: in this case, we have an "origin", which means we didn't create
                // this version ourselves, and "origin" tells us who we first heard
                // about it from, and so now, as per the ack-algorithm, we're going
                // to send an ack back to that person (because the algorithm tells us
                // to only send an ack after we have received acks from everyone
                // we forwarded the information to)

                let p = resource.acks_in_process[version].origin
                p.send && p.send({
                    method: 'ack', key, seen:'local', version,
                    joiner_num: resource.joiners[version]
                })

            } else {

                // G: in this case, we have no "origin", which means we created
                // this version ourselves, and now the fact that all our peers
                // have acknowledged it means that all of their peers have also
                // acknowledged. In fact, everyone in the network must have
                // acknowledged it (or else we would have received a fissure
                // before receiving this acknowledgment, and that fissure would
                // have wiped away "acks_in_process" for this version), so that
                // means this version is "fully (globally) acknowledged",
                // so we'll call add_full_ack_leaf for this version..

                add_full_ack_leaf(resource, version)

                // G: but "add_full_ack_leaf" just modifies our own datastructure,
                // and we must also give the good news to everyone else, so
                // we send a "global" ack to all our peers (and they'll forward it
                // to their peers)

                node.bindings(key).forEach( pipe => {
                    pipe.send && pipe.send({method: 'ack', key, seen:'global', version})
                })
            }
        }
    }

    var default_pipe = {id: 'null-pipe'}

    // Can be called as:
    //  - get(key)
    //  - get(key, cb)
    //  - get({key, origin, ...})
    node.get = (...args) => {
        node.ons.forEach(on => on('get', args))

        var key, version, parents, subscribe, origin
        // First rewrite the arguments if called as get(key) or get(key, cb)
        if (typeof args[0] === 'string') {
            key = args[0]
            var cb = args[1]
            origin = (cb
                      ? {id: u.random_id(), send(args) {
                          // We have new data with every 'set' or 'welcome message
                          if ((args.method === 'set' || args.method === 'welcome')
                              && (node.resource_at(key).weve_been_welcomed
                                  // But we only wanna return once we have
                                  // applied any relevant default.  We know
                                  // the default has been applied because
                                  // there will be at least one version.
                                  && !(default_val_for(key) && !node.current_version(key)))) {
                              // Let's also ensure this doesn't run until
                              // (weve_been_welcomed || zero get handlers are registered)

                              // And if there is a .default out there, then
                              // make sure the state has at least one version
                              // before calling.
                              cb(node.resource_at(key).mergeable.read())}}}
                      : default_pipe)
            if (cb) cb.pipe = origin
        }
        else {
            // Else each parameter is passed explicitly
            ({key, version, parents, subscribe, origin} = args[0])
        }
      
        // Set defaults
        if (!version)
            // We might default keep_alive to false in a future version
            subscribe = subscribe || {keep_alive: true}

        if (!origin)
            origin = {id: u.random_id()}

        log('get:', node.pid, key)
        assert(key)
        var resource = node.resource_at(key)

        // Now record this subscription to the bus
        node.gets_in.add(key, origin.id)
        // ...and bind the origin pipe to future sets
        node.bind(key, origin)

        // If this is the first subscription, fire the .on_get handlers
        if (node.gets_in.count(key) === 1) {
            log('node.get:', node.pid, 'firing .on_get for',
                node.bindings(key).length, 'pipes!')
            // This one is getting called afterward
            node.bindings(key).forEach(pipe => {
                pipe.send && pipe.send({
                    method:'get', key, version, parents, subscribe, origin
                })
            })
        }

        // // G: now if the person connecting with us wants to be a citizen, they'll
        // // set "pid", and we'll want to send them a "get" as well so that we
        // // can learn about their updates -- of course, when they get that get,
        // // we don't want an echo war of gets begetting gets, so when someone sends
        // // the initial get, they set "initial" to true, but we respond with a get
        // // with initial not set to true

        // if (origin.them && initial)
        //     origin.send({method: 'get', key, initial: false})

        // G: ok, now if we're going to be sending this person updates,
        // we should start by catching them up to our current state,
        // which we'll do by sending a "welcome". "generate_braid" calculates
        // the versions comprising this welcome (we need to calculate them because
        // we store the versions inside a space dag, and we need to pull them out...
        // note that it wouldn't work to just keep the versions around on the side,
        // because we also prune the space dag, meaning that the versions generated
        // here may be different than the version we originally received, though
        // hopefully no versions already known to this incoming peer will have been
        // modified, or if they have been, hopefully those versions are deep enough
        // in the incoming peer's version dag that they are not the direct parents
        // of any new edits made by them... we strive to enforce this fact with
        // the pruning algorithm)

        var versions = resource.mergeable.generate_braid(x => false)

        // G: oh yes, we also send them all of our fissures, so they can know to keep
        // those versions alive

        var fissures = Object.values(resource.fissures)

        // G: ok, here we actually send out the welcome

        if (origin.remote) resource.we_welcomed[origin.id] = {id: origin.id, connection: origin.connection, them: origin.them, remote: origin.remote}
        origin.send && origin.send({method: 'welcome', key, versions, fissures})

        return resource.mergeable.read()
    }
    
    node.error = ({key, type, in_response_to, origin}) => {
        node.on_errors.forEach(f => f(key, origin))
    }

    // Can be called as:
    //  - set(key, val)                     // Set key to val
    //  - set(key, null, '= "foo"')         // Patch with a patch
    //  - set(key, null, ['= "foo"', ...])  // Patch with multiple patches
    //  - set({key, patches, origin, ...})
    node.set = (...args) => {
        var key, patches, version, parents, origin, joiner_num

        // First rewrite the arguments if called as set(key, ...)
        if (typeof args[0] === 'string') {
            key = args[0]
            patches = args[2]
            if (typeof patches === 'string')
                patches = [patches]
            if (!patches)
                patches = ['= ' + JSON.stringify(args[1])]
        }
        else {
            // Else each parameter is passed explicitly
            ({key, patches, version, parents, origin, joiner_num} = args[0])
        }

        assert(key && patches)
        var resource = node.resource_at(key)

        if (!version) version = u.random_id()
        if (!parents) parents = {...resource.current_version}
        log('set:', {key, version, parents, patches, origin, joiner_num})

        for (p in parents) {
            if (!resource.time_dag[p]) {
                origin.send && origin.send({
                    method: 'error',
                    key,
                    type: 'cannot merge: missing parents',
                    in_response_to: {
                        method: 'set',
                        key, patches, version, parents, joiner_num
                    }
                })
                node.on_errors.forEach(f => f(key, origin))
                return                    
            }
        }

        node.ons.forEach(on => on('set', [{key, patches, version, parents, origin, joiner_num}]))

        // G: cool, someone is giving us a new version to add to our datastructure.
        // it might seem like we would just go ahead and add it, but instead
        // we only add it under certain conditions, namely one of the following
        // must be true:
        //
        // !origin : in this case there is no origin, meaning the version was
        // created locally, so we definitely want to add it.
        //
        // !resource.time_dag[version] : in this case the version must have come
        // from someone else (or !origin would be true), but we don't have
        // the version ourselves (otherwise it would be inside our time_dag),
        // so we want to add this new version we haven't seen before.
        //
        // (joiner_num > resource.joiners[version]) : even if we already have
        // this version, we might want to, in some sense, add it again,
        // in the very special case where this version is a joiner,
        // and its joiner_num is bigger than the version of this joiner that we
        // already have.. the issue with joiners is that they can be created
        // on multiple peers simultaneously, and they share the same version id,
        // and in that case, it would be unclear who should send the "global"
        // acknowledgment for the joiner, so we use this "joiner_num" to
        // distinguish the otherwise identical looking joiners for the purposes
        // of electing a particular joiner to handle the full acknowledgment.

        if (!origin                                         // Was created locally
            || !resource.time_dag[version]                  // We don't have it yet
            || (joiner_num > resource.joiners[version])) {  // It's a dominant joiner

            // console.log('Branch •A• happened')

            // G: so we're going to go ahead and add this version to our
            // datastructure, step 1 is to call "add_version" on the underlying
            // mergeable..

            // console.log('Adding version', {version, parents, patches},
            //             'to', Object.keys(resource.time_dag))
            resource.mergeable.add_version(version, parents, patches)

            // G: next, we want to remember some information for the purposes
            // of acknowledgments, namely, we'll remember how many people
            // we forward this version along to (we'll actually do the forwarding
            // right after this), and we also remember whether or not
            // we are the originators of this version (if we originated the version,
            // then we'll be responsible for sending the "global" ack when
            // the time is right)..

            resource.acks_in_process[version] = {
                origin: origin,
                count: node.welcomed_peers(key).length - (origin ? 1 : 0)
            }

            // log('node.set:', node.pid, 'Initializing ACKs for', version, 'to',
            //     `${node.joined_peers(key).length}-${(origin ? 1 : 0)}=${resource.acks_in_process[version].count}`)

            // log('node.set: we will want',
            //             node.citizens(key).length - (origin ? 1 : 0),
            //             'acks, because we have citizens', node.citizens(key))

            assert(resource.acks_in_process[version].count >= 0,
                   node.pid, 'Acks have below zero! Proof:',
                   {origin, key, version,
                    acks_in_process: resource.acks_in_process[version]})

            // console.log('Initialized acks to', resource.acks_in_process[version])
            
            // G: well, I said forwarding the version would be next, but here
            // is this line of code to remember the joiner_num of this
            // version, in case it is a joiner (we store the joiner_num for
            // each version in a auxiliary hashmap called joiners)..

            if (joiner_num) resource.joiners[version] = joiner_num

            // G: and now for the forwarding of the version to all our peers,
            // (unless we received this "set" from one of our peers,
            // in which case we don't want to send it back to them)

            log('set: broadcasting to',
                node.bindings(key)
                   .filter(p => p.send && (!origin || p.id !== origin.id))
                   .map   (p => p.id),
                'pipes from', origin && origin.id)
            // console.log('Now gonna send a set on', node.bindings(key))
            node.bindings(key).forEach(pipe => {
                if (pipe.send && (!origin || (pipe.id !== origin.id))) {
                    log('set: sending now from', node.pid, pipe.type)
                    pipe.send({method: 'set',
                               key, patches, version, parents, joiner_num})
                }
            })
            
        } else if (resource.acks_in_process[version]
                   // Greg: In what situation is acks_in_process[version] false?

                   // G: good question; the answer is that in some cases
                   // we will delete acks_in_process for a version if,
                   // say, we receive a global ack for a descendant of this version,
                   // or if we receive a fissure.. in such cases, we simply
                   // ignore the ack process for that version, and rely
                   // on a descendant version getting globally acknowledged.

                   && joiner_num == resource.joiners[version])

            // G: now if we're not going to add the version, most commonly because
            // we already possess the version, there is another situation that
            // can arise, namely, someone that we forwarded the version to
            // sends it back to us... How could that happen? Well, they may have
            // heard about this version from someone we sent it to, before
            // hearing about it from us (assuming some pretty gross latency)..
            // anyway, if it happens, we can treat it like an ACK for the version,
            // which is why we decrement "count" for acks_in_process for this version;
            // a similar line of code exists inside "node.ack"

            // console.log('Branch •B• happened',
            //             joiner_num,
            //             resource.joiners[version],
            //             resource.acks_in_process[version].count)

            resource.acks_in_process[version].count--

        // G: since we may have messed with the ack count, we check it
        // to see if it has gone to 0, and if it has, take the appropriate action
        // (which is probably to send a global ack)


        check_ack_count(key, resource, version)

        return version
    }
    
    node.welcome = ({key, versions, fissures, unack_boundary, min_leaves, origin}) => {
        node.ons.forEach(on => on('welcome', [{key, versions, fissures, unack_boundary, min_leaves, origin}]))

        assert(key && versions && fissures,
               'Missing some variables:',
               {key, versions, fissures})
        // console.log('welcome:', key, 'versions:', versions.length,
        //             'unacking:', Object.keys(unack_boundary))
        var resource = node.resource_at(key)
        
        // `versions` is actually array of set messages. Each one has a version.
        var new_versions = []
        
        // G: this next section deals with the special case of information
        // that is so acknowledged by everyone, and so pruned, that it
        // has no version -- it sort of exists as a background version.
        // we can identify such a version because it will have no version id,
        // and if it exists, it will always be the first version in the list;
        // however, even if it does exist, we may not want to actually apply
        // it to our datastructure -- we only apply it to our datastructure
        // if we have absolutely nothing else in it (if we already have some
        // "background" version, then we just ignore this new "background" version,
        // in the hopes that it doesn't tell us anything new, which it shouldn't
        // if our protocol is working correctly)

        var v = versions[0]
        if (v && !v.version) {
            // G: so we get rid of this "background" version..

            var null_version = versions.shift()

            // G: ..but we only add it to our datastructure if we don't
            // already have a "background" version (namely any version information at all)

            if (!Object.keys(resource.time_dag).length) {
                new_versions.push(v)
                resource.mergeable.add_version(v.version, v.parents, v.changes)
            }
        }
        
        // G: now that the "background" version is out of the way,
        // the rest of the version are real.. but that doesn't mean we
        // want to add them all. Some of them we may already have.
        // So one might ask, why don't we just filter the versions
        // according to which ones we already have? why this versions_T
        // nonsense? The issue is that there may be versions which
        // we don't have, but that we don't want to add either,
        // presumably because we pruned them, and this code seeks
        // to filter out such versions. The basic strategy is that
        // for each incoming version, if we already have that version,
        // not only do we want to not add it, but we don't want
        // to add any incoming ancestors of that version either (because
        // we must already have them, or else we did have them,
        // and pruned them)

        var versions_T = {}
        versions.forEach(v => versions_T[v.version] = v.parents)
        versions.forEach(v => {
            if (resource.time_dag[v.version]) {
                function f(v) {
                    if (versions_T[v]) {
                        Object.keys(versions_T[v]).forEach(f)
                        delete versions_T[v]
                    }
                }
                f(v.version)
            }
        })

        // G: now versions_T will only contain truthy values for versions
        // which we really do want to add (they are new to us, and they
        // are not repeats of some version we had in the past, but pruned away)

        for (var v of versions) {
            if (versions_T[v.version]) {
                new_versions.push(v)

                var bad = false
                if (Object.keys(v.parents).length == 0) {
                    bad = new_versions[0].version
                } else for (p in v.parents) {
                    bad = !resource.time_dag[p]
                    if (bad) break
                }
                if (bad) return send_error()

                resource.mergeable.add_version(v.version, v.parents, v.changes)
            }
        }

        function send_error() {
            versions.unshift(null_version)
            origin.send && origin.send({
                method: 'error',
                key,
                type: 'cannot merge: missing necessary versions',
                in_response_to: {
                    method: 'welcome',
                    key, versions, fissures, unack_boundary, min_leaves
                }
            })
            node.on_errors.forEach(f => f(key, origin))
        }

        // let's also check to make sure we have the min_leaves and unack_boundary,
        // if they are specified..
        if ((min_leaves && Object.keys(min_leaves).some(k => !resource.time_dag[k])) || (unack_boundary && Object.keys(unack_boundary).some(k => !resource.time_dag[k]))) return send_error()
        
        // G: next we process the incoming fissures, and like before,
        // we only want to add new ones, and there's also this gen_fissures
        // variable which is short of "generated_fissures", and records
        // fissures which we created just now as part of a special case
        // where we receive a fissure that we were supposedly involved with,
        // but we don't have a fissure record for (this can happen when someone
        // tries to connect with us, but the connection is broken even before
        // we knew they were trying to connect)

        var new_fissures = []
        var gen_fissures = []
        fissures.forEach(f => {
            var key = f.a + ':' + f.b + ':' + f.conn
            if (!resource.fissures[key]) {

                // G: so we don't have this fissure.. let's add it..

                new_fissures.push(f)
                resource.fissures[key] = f

                // G: now let's check for that special case where we don't
                // have the fissure, but we're one of the ends of the fissure
                // (note that we don't check for f.a == node.pid because that
                // would be a fissure created by us -- we're looking for
                // fissures not created by us, but that we are the other end
                // of).  We just add these fissures to gen_fissures for now,
                // and later in this function we'll iterate over gen_fissures
                // and actually add these fissures to our data structure (as
                // well as tell them to our peers)
                //
                // If we don't do this, then this fissure will never get pruned,
                // because it will never find its "other half"

                if (f.b == node.pid) gen_fissures.push({
                    a:        node.pid,
                    b:        f.a,
                    conn:     f.conn,
                    versions: f.versions,
                    parents:  {},
                    time:     Date.now()
                })
            }
        })

        // G: there is this thing called the unack_boundary, which defines
        // a set of nodes (namely everything on the boundary, and any ancestors
        // of anything on the boundary), and these nodes should exhibit the
        // behavior that even if a global acknowledgment is received for them,
        // it should be ignored.
        //
        // why should we ignore them? well, this welcome message we've received
        // is kindof like an anti-fissure -- it is a new citizen in the network,
        // and the whole idea of a "global ack" is that all citizens connected
        // directly or transitively to ourselves have seen this version,
        // but imagine that there is a "global ack" sitting the our message queue,
        // but it was created before this new connection, meaning that it's
        // claim has been violated (in particular, this new citizen may not
        // have seen the version, and this new citizen may bring in transitive
        // access to even more citizens, which also may not have seen the version),
        // so rather than trying to figure out who has seen what when a new
        // connection is established, we sortof blacklist global acknowledgments
        // for all versions in both our, and the new citizens current versions,
        // and we wait for a version created after this connection event
        // to get globally acknowledged (note that this involves un-globally
        // acknowledging things that we had thought were globally acknowledged,
        // but not everything -- if a version is globally acknowledged by us,
        // and also by the incoming citizen, then we keep that version as
        // globally acknowledged)

        // G: this next if statement deals with two cases of the welcome message.
        // in one case, the welcome is sent as a response to a get,
        // in which case unack_boundary is null (and you can see that we just
        // set it to be absolutely all of the versions we currently know about,
        // both in our own version set, and the incoming version set, since
        // we already added the incoming versions to our set). If it isn't null,
        // then we don't need to give it a value here (and this message must be
        // a case of propoagating a welcome around the network)
        //
        // So conceptually, we establish the unack_boundary on the initial
        // welcome (and we can't know it before then, because the person
        // sending us this welcome doesn't know which versions we have),
        // and then once it is established, we hardcode the result into
        // the welcome messages that we send to our peers

        if (!unack_boundary)
            unack_boundary = Object.assign({}, resource.current_version)

        // G: to understand this next bit of code,
        // first know that these "boundary" variables are really just
        // trying to be more effecient ways of storing sets of versions (which
        // include everything on the boundary, as well as all the ancestors
        // of those versions). If we were using sets, our code would
        // be doing this:
        //
        // resource.unack_set = union(resource.unack_set, unack_set)
        //
        // that is, we want to union our pre-existing unacked stuff with
        // the new incoming unacked stuff. But since our implementation
        // uses boundaries rather than sets, we get the code that follows
        // (you can see that the only modifications being made are to
        // resource.unack_boundary, where we delete some stuff, and add
        // some stuff, so that it represents the new boundary)

        // console.log('processing1:', resource.unack_boundary)
        var our_conn_versions = resource.ancestors(resource.unack_boundary)
        // console.log('processing2:', unack_boundary)

        var new_conn_versions = resource.ancestors(unack_boundary)

        Object.keys(resource.unack_boundary).forEach(x => {
            if (new_conn_versions[x] && !unack_boundary[x]) {
                delete resource.unack_boundary[x]
            }
        })
        Object.keys(unack_boundary).forEach(x => {
            if (!our_conn_versions[x]) resource.unack_boundary[x] = true
        })

        // G: so that was dealing with the unack_boundary stuff... now
        // we want to deal with the globally acknowledged stuff. Basically,
        // anything that is globally acknowledged by both us, and the incoming
        // citizen, will remain globally acknowledged. We'll compute these
        // versions as the intersection of ours and their acknowledged set,
        // and then store just the boundary of the intersection set
        // and call it "min_leaves" (where "min" basically means "intersection"
        // in this case, and used to be paired with "max_leaves", which
        // meant "union", and was used to represent the unack_boundary above)
        //
        // As before, min_leaves will be null on the initial welcome,
        // and we'll compute it, and then subsequent welcomes will have this
        // result included...
        
        if (!min_leaves) {
            min_leaves = {}

            // G: this next line of code computes the intersection of
            // our versions, and the incoming versions. It does this by
            // starting with "versions" (which is the incoming versions),
            // and filtering away anything in versions_T, which happens
            // to contain only versions which are new to us,
            // leaving us with all the versions in the incoming versions
            // that we already know about (which is the intersection we seek)

            var min = versions.filter(v => !versions_T[v.version])

            // G: now "min" is correct, but we really want "min_leaves",
            // which is the so-called "boundary" of the "min" set,
            // so we start by adding everything to it,
            // and then removing anything in it which is really
            // an ancestor of something else in the set

            min.forEach(v => min_leaves[v.version] = true)
            min.forEach(v =>
                        Object.keys(v.parents).forEach(p => {
                            delete min_leaves[p]
                        })
                       )
        }

        // G: we are now armed with this "min_leaves" variable,
        // either because we computed it, or it was given to us...
        // what do we do with it? well, we want to roll-back our
        // boundary of globally acknowledged stuff so that it only
        // includes stuff within "min_leaves" (that is, we only want
        // to keep stuff as globally acknowledged if it was already
        // globally acknowledged, and also it is already known to this
        // incoming citizen)
        //
        // As before, we're really doing a set intersection (in this case
        // an intersection between min_leaves and our own acked_boundary),
        // but the code looks wonkier because all our variables store
        // the boundaries of sets, rather than the sets themselves

        var min_versions = resource.ancestors(min_leaves)
        var ack_versions = resource.ancestors(resource.acked_boundary)
        Object.keys(resource.acked_boundary).forEach(x => {
            if (!min_versions[x])
                delete resource.acked_boundary[x]
        })
        Object.keys(min_leaves).forEach(x => {
            if (ack_versions[x]) resource.acked_boundary[x] = true
        })

        // G: this next line of code is pretty drastic.. it says: "If we're
        // connecting to someone new, then all our hard work keeping track
        // of acknowledgments is now useless, since it relies on an algorithm
        // that assumes there will be no changes in the network topology
        // whilst the algorithm is being carried out -- and the network topology
        // just changed, because now there's this new guy"
        //
        // Fortunately, once a new version is globally acknowledged within the new
        // topology, it's acknowledgment will extend to these versions as well,
        // because global acknowledgments apply to all ancestors of a version,
        // and any new versions will include all existing versions as ancestors.
        
        resource.acks_in_process = {}

        // G: ok, we're pretty much done. We've made all the changes to our
        // own data structure (except for the gen_fissures, which will happen next),
        // and now we're ready to propogate the information to our peers.
        //
        // So, up above, when we added new versions and fissures to ourselves,
        // we marked each such instance in new_versions or new_fissures,
        // and if we got any new versions or fissures, then we want to
        // tell our peers about it (if we didn't, then we don't need to tell anyone,
        // since there's nothing new to hear about)
        
        assert(unack_boundary && min_leaves && fissures && new_versions)
        if (new_versions.length > 0 || new_fissures.length > 0 || !resource.weve_been_welcomed) {
            // Now record that we've seen a welcome
            resource.weve_been_welcomed = true

            // And tell everyone about it!
            node.bindings(key).forEach(pipe => {
                if (pipe.send && (pipe.id !== origin.id))
                    pipe.send({method: 'welcome',
                               key, versions: new_versions, unack_boundary, min_leaves,
                               fissures: new_fissures})
            })
        }

        // G: now we finally add the fissures we decided we need to create
        // in gen_fissures... we add them now, after the code above,
        // so that these network messages appear after the welcome (since
        // they may rely on information which is in the welcome for other
        // people to understand them)

        gen_fissures.forEach(f => node.fissure({key, fissure:f}))

        // Now that we processed the welcome, set defaults if we have one
        if (default_val_for(key) && !node.current_version(key))
            node.set(key, default_val_for(key))
    }
    
    // Can be called as:
    //  - forget(key, cb), with the same cb passed to get(key, cb)
    //  - forget({key, origin})
    node.forget = (...args) => {
        node.ons.forEach(on => on('forget', args))

        var key, origin, cb
        if (typeof(args[0]) === 'string') {
            key = args[0]
            cb = args[1]
            origin = cb.pipe
        } else {
            ({key, origin} = args[0])
        }

        assert(key)

        var resource = node.resource_at(key)
        delete resource.we_welcomed[origin.id]
        node.unbind(key, origin)
        node.gets_in.delete(key, origin.id)

        // todo: what are the correct conditions to send the forget?
        // for now, we just support the hub-spoke model, where only clients
        // send forget.
        // here is what the todo said before:
        // TODO: if this is the last subscription, send forget to all gets_out
        // origin.send({method: 'forget', key})        
        if (cb) {
            node.bindings(key).forEach(pipe => {
                pipe.send && pipe.send({
                    method:'forget', key, origin
                })
            })
        }
    }

    node.ack = ({key, valid, seen, version, origin, joiner_num}) => {
        node.ons.forEach(on => on('ack', [{key, valid, seen, version, origin, joiner_num}]))

        log('node.ack: Acking!!!!', {key, seen, version, origin})
        assert(key && version && origin)
        var resource = node.resource_at(key)

        if (seen == 'local') {
            if (resource.acks_in_process[version]
                && (joiner_num == resource.joiners[version])) {
                log('node.ack: Got a local ack! Decrement count to',
                    resource.acks_in_process[version].count - 1)
                resource.acks_in_process[version].count--
                check_ack_count(key, resource, version)
            }
        } else if (seen == 'global') {
            if (!resource.time_dag[version]) return
            
            var ancs = resource.ancestors(resource.unack_boundary)
            if (ancs[version]) return
            
            ancs = resource.ancestors(resource.acked_boundary)
            if (ancs[version]) return
            
            add_full_ack_leaf(resource, version)
            node.bindings(key).forEach(pipe => {
                if (pipe.send && (pipe.id != origin.id))
                    pipe.send({method: 'ack', key, version, seen: 'global'})
            })
        }
    }
    
    node.fissure = ({key, fissure, origin}) => {
        node.ons.forEach(on => on('fissure', [{key, fissure, origin}]))

        assert(key && fissure,
               'Missing some variables',
               {key, fissure})
        var resource = node.resource_at(key)

        var fkey = fissure.a + ':' + fissure.b + ':' + fissure.conn
        if (!resource.fissures[fkey]) {
            resource.fissures[fkey] = fissure
            
            resource.acks_in_process = {}
            
            // First forward this fissure along
            node.bindings(key).forEach(pipe => {
                if (pipe.send && (!origin || (pipe.id != origin.id)))
                    pipe.send({method: 'fissure',
                               key,
                               fissure})
            })
            
            // And if this fissure matches us, then send the anti-fissure for
            // it
            if (fissure.b == node.pid)
                node.fissure({key,
                              fissure: {
                                  a:        node.pid,
                                  b:        fissure.a,
                                  conn:     fissure.conn,
                                  versions: fissure.versions,
                                  parents:  {},
                                  time:     Date.now()
                              }
                             })
        }
    }

    node.disconnected = ({key, name, versions, parents, time, origin}) => {
        if (time == null) time = Date.now()
        node.ons.forEach(on => on('disconnected', [{key, name, versions, parents, time, origin}]))

        // unbind them (but only if they are bound)
        if (node.bindings(key).some(p => p.id == origin.id)) node.unbind(key, origin)

        // if we haven't sent them a welcome (or they are not remote), then no need to create a fissure
        if (!origin.remote || !node.resource_at(key).we_welcomed[origin.id]) return

        // now since we're disconnecting, we reset the we_welcomed flag
        delete node.resource_at(key).we_welcomed[origin.id]

        assert(key && origin)
        // To do:
        //  - make this work for read-only connections
        //  - make this work for multiple keys (a disconnection should
        //    affect all of its keys)
        var resource = node.resource_at(key),
            fissure

        assert(!(name || versions || parents), 'Surprise!')

        // Generate the fissure
        if (name) {
            // Create fissure from name
            var [a, b, conn] = name.split(/:/)
            fissure = {
                a, b, conn,
                versions,
                parents,
                time
            }
        } else {
            // Create fissure from scratch

            // assert(resource.subscriptions[origin.id],
            //        `This pipe ${origin.id} is not on the resource for ${node.pid}'s ${key}`,
            //        resource.subscriptions)
            
            assert(origin.id,   'Need id on the origin', origin)
            assert(origin.them, 'Need a peer on origin', origin)

            var versions = {}
            var ack_versions = resource.ancestors(resource.acked_boundary)
            Object.keys(resource.time_dag).forEach(v => {
                if (!ack_versions[v] || resource.acked_boundary[v])
                    versions[v] = true
            })
            
            var parents = {}
            Object.keys(resource.fissures).forEach(x => parents[x] = true )
            
            fissure = {
                a: node.pid,
                b: origin.them,
                conn: origin.connection,
                versions,
                parents,
                time
            }

            // delete resource.subscriptions[origin.id]
        }

        node.fissure({key, origin, fissure})
    }
    
    node.delete = () => {
        // work here: idea: use "undefined" to represent deletion
    }

    node.prune = (resource) => {
        if (node.fissure_lifetime != null) {
            var now = Date.now()
            Object.entries(resource.fissures).forEach(([k, f]) => {
                if (f.time == null) f.time = now
                if (f.time <= now - node.fissure_lifetime)
                    delete resource.fissures[k]
            })
        }

        var unremovable = {}
        Object.entries(resource.fissures).forEach(x => {
            if (!resource.fissures[x[1].b + ':' + x[1].a + ':' + x[1].conn]) {
                function f(y) {
                    if (!unremovable[y.a + ':' + y.b + ':' + y.conn]) {
                        unremovable[y.a + ':' + y.b + ':' + y.conn] = true
                        unremovable[y.b + ':' + y.a + ':' + y.conn] = true
                        Object.keys(y.parents).forEach(p => {
                            if (resource.fissures[p]) f(resource.fissures[p])
                        })
                    }
                }
                f(x[1])
            }
        })
        
        var acked = resource.ancestors(resource.acked_boundary)
        var done = {}
        Object.entries(resource.fissures).forEach(x => {
            var other_key = x[1].b + ':' + x[1].a + ':' + x[1].conn
            var other = resource.fissures[other_key]
            if (other && !done[x[0]] && !unremovable[x[0]]) {
                done[x[0]] = true
                done[other_key] = true
                
                if (Object.keys(x[1].versions).every(x => acked[x] || !resource.time_dag[x])) {
                    delete resource.fissures[x[0]]
                    delete resource.fissures[other_key]
                }
            }
        })
        
        var tags = {'null': {tags: {}}}
        var frozen = {}
        var maintain = {}
        Object.keys(resource.time_dag).forEach(version => {
            tags[version] = {tags: {}}
        })
        function tag(version, t) {
            if (!tags[version].tags[t]) {
                tags[version].tags[t] = true
                Object.keys(resource.time_dag[version]).forEach(version => tag(version, t))
                tags[null].tags[t] = true
            }
        }
        Object.entries(resource.fissures).forEach(x => {
            Object.keys(x[1].versions).forEach(v => {
                if (!resource.time_dag[v]) return
                tag(v, v)
                frozen[v] = true
                maintain[v] = true
                Object.keys(resource.time_dag[v]).forEach(v => {
                    tag(v, v)
                    frozen[v] = true
                })
            })
        })
        var acked = resource.ancestors(resource.acked_boundary)
        Object.keys(resource.time_dag).forEach(x => {
            if (!acked[x] || resource.acked_boundary[x]) {
                tag(x, x)
                frozen[x] = true
                maintain[x] = true
                Object.keys(resource.time_dag[x]).forEach(v => {
                    tag(v, v)
                    frozen[v] = true
                })
            }
        })
        Object.entries(tags).forEach(x => {
            var keys = Object.keys(x[1].tags)
            if (keys.length == 0) {
                frozen[x[0]] = true
            } else if (!frozen[x[0]]) {
                x[1].tag = keys.sort().join(',')
            }
        })
        var q = (a, b) => {
            // This code assumes there is a God (a single first version adder)
            if (!a) a = 'null'
            return a && b && !frozen[a] && !frozen[b] && (tags[a].tag == tags[b].tag)
        }
        var seen_annotations = {}
        resource.mergeable.prune(q, q, seen_annotations)

        // here we change the name of all the versions which are not frozen,
        // meaning they might have changed,
        // so we want to give them different names to avoid the confusion of
        // thinking that they possess the same information as before
        var name_changes = {}
        Object.keys(resource.time_dag).forEach(v => {
            if (!maintain[v]) {
                var m = v.match(/^([^\-]+)\-/)
                if (m) {
                    name_changes[v] = m[1] + '-' + Math.random().toString(36).slice(2)
                } else {
                    name_changes[v] = v + '-' + Math.random().toString(36).slice(2)
                }
            }
        })
        resource.mergeable.change_names(name_changes)

        // todo: this code can maybe be moved into the resource.mergeable.prune function
        //       (this code also assumes there is a God (a single first version adder))
        var leaves = Object.keys(resource.current_version)
        var acked_boundary = Object.keys(resource.acked_boundary)
        var fiss = Object.keys(resource.fissures)
        if (leaves.length == 1 && acked_boundary.length == 1 && leaves[0] == acked_boundary[0] && fiss.length == 0 && !Object.keys(seen_annotations).length) {
            resource.time_dag = {
                [leaves[0]]: {}
            }
            var val = resource.mergeable.read_raw()
            resource.space_dag = (val && typeof(val) == 'object') ? {t: 'lit', S: val} : val
        }
    }

    node.create_joiner = (key) => {
        var resource = node.resource_at(key),
            // version = sjcl.codec.hex.fromBits(
            //     sjcl.hash.sha256.hash(
            //         Object.keys(resource.current_version).sort().join(':')))
            version = 'joiner:' + Object.keys(resource.current_version).sort().join(':')
        var joiner_num = Math.random()
        node.set({key, patches: [], version,
                  parents: Object.assign(u.dict(), resource.current_version),
                  joiner_num})
    }        

    node.current_version = (key) =>
        Object.keys(node.resource_at(key).current_version).join('-') || null

    node.default = (key, val) => {
        var is_wildcard = key[key.length-1] === '*'
        var v = val
        if (is_wildcard) {
            // Wildcard vals must be functions
            if (typeof val !== 'function')
                v = () => val
            node.default_patterns[key.substr(0,key.length-1)] = v
        }
        else
            node.defaults[key] = val
    }
    function default_val_for (key) {
        if (key in node.defaults) {
            // console.log('Default('+key+') is', node.defaults[key])
            return node.defaults[key]
        }

        for (pattern in node.default_patterns)
            if (pattern === key.substr(0, pattern.length)) {
                // console.log('Default('+key+') is', node.default_patterns[pattern])
                return node.default_patterns[pattern](key)
            }
    }

    // Install handlers and bindings
    require('./events.js')(node)

    return node
}

// A pipe is a network connection that can get disconnected and reconnected.
//
// A pipe can send and receive.  The user supplies a `send_function` that:
//
//   • will be called from pipe.send(), and
//   • will return a result to pipe.recv().
//
// When a pipe disconnects, it will automatically send out fissures.  When it
// re-connects, it will automatically re-establish connections.
//
// Todo:
//   • Describe the connect process and connect() function
//
module.exports = require.pipe = function create_pipe({node, id, send, connect, type}) {
    assert(node && send && connect, {node,send,connect})
    id = id || u.random_id()

    // The Pipe Object!
    var pipe = {

        // A pipe holds some state:
        id: id,
        type: type, // Only used for debugging
        connection: null,
        connecting: false,
        them: null,
        subscribed_keys: u.dict(),
        remote: true,

        // It can Send and Receive messages
        send (args) {
            var we_welcomed = args.key && node.resource_at(args.key).we_welcomed[this.id]
            log('pipe.send:', args.method, 'welcomed:', !!we_welcomed)
            assert(args.method !== 'hello')
            log('...')

            // Record new keys
            if (args.method === 'get') {
                assert(!this.connection
                       || !this.subscribed_keys[args.key]
                       || !this.subscribed_keys[args.key].we_requested,
                       'Duplicate get 1:', args,
                       {connection: this.connection,
                        subscription: this.subscribed_keys[args.key]})

                assert(args.key, node.resource_at(args.key).mergeable)

                // Initialize subscribed_keys
                this.subscribed_keys[args.key] =
                    this.subscribed_keys[args.key] || {}

                // Remember that we requested this subscription
                this.subscribed_keys[args.key].we_requested = args.subscribe

                // If this is the first message, let's try to connect the pipe.
                if ( this.connecting) return
                if (!this.connection) {
                    this.connecting = true

                    // Run the programmer's connect function
                    connect.apply(this)

                    // Don't run the send code below, since we'll send this
                    // get when the connection completes
                    return
                }
            }

            else if (args.method === 'forget') {
                // Record forgotten keys
                delete this.subscribed_keys[args.key].we_requested
                node.unbind(args.key, this)
            }

            else if (args.method === 'welcome' && !args.unack_boundary) {
                // If we haven't welcomed them yet, ignore this message
            }

            else if (!we_welcomed) {
                // Oh shit, I think this is a bug.  Cause if they welcomed us,
                // we wanna send them shit too... but maybe we need to start
                // by welcoming them.
                log('gooooo away', we_welcomed)
                return
            }

            // Clean out the origin... because we don't use that.
            delete args.origin

            // And now send the message
            log('pipe.send:', (this.id || node.pid), args.method,
                args.version || '')

            if (this.connection)
                send.call(this, args)
            else
                log('FAILED to send, because pipe not yet connected..')
        },
        recv (args) {
            var we_welcomed = args.key && node.resource_at(args.key).we_welcomed[this.id]
            log(`pipe.RECV:`,
                node.pid + '-' + (this.them || '?'),
                args.method,
                args.version || '')

            // The hello method is only for pipes
            if (args.method === 'hello') {
                this.connection = (this.connection < args.connection
                                   ? this.connection : args.connection)
                this.them = args.my_name_is

                // hello messages don't do anything else (they are just for
                // the pipe)
                return
            }

            if (args.method === 'welcome'
                && !we_welcomed
                /*&& !this.subscribed_keys[args.key].we_requested*/) {
                // Then we need to welcome them too
                var resource = node.resource_at(args.key)
                var versions = resource.mergeable.generate_braid(x => false)
                var fissures = Object.values(resource.fissures)
                this.send({method: 'welcome', key: args.key, versions, fissures})

                // Now we store a subset of this pipe in a place that will
                // eventually be saved to disk.  When a node comes up after a
                // crash, it'll need to create and send fissures for everyone
                // it's welcomed.  So right here we store the info necessary
                // to fissure.
                resource.we_welcomed[this.id] = {id: this.id,
                                                 connection: this.connection,
                                                 them: this.them}
            }

            // Remember new subscriptions from them
            if (args.method === 'get') {
                // assert(!(this.subscribed_keys[args.key]
                //          && this.subscribed_keys[args.key].they_requested),
                //        'Duplicate get 2:', args,
                //        {subscription: this.subscribed_keys[args.key]})

                // Initialize subscribed_keys
                this.subscribed_keys[args.key] =
                    this.subscribed_keys[args.key] || {}

                // Record their subscription
                this.subscribed_keys[args.key].they_requested = args.subscribe
            }

            args.origin = this
            node[args.method](args)

            if (args.method === 'get')
                log('pipe.recv: New remote!', this.id,
                    'Now we have', node.remotes(args.key).length)

        },

        // It can Connect and Disconnect
        connected () {
            // console.log('pipe.connect:', this.id, this.connection || '')

            if (this.connection) {
                log('pipe.connect:', this.id, 'already exists! abort!')
                return
            }

            this.connecting = false

            // Create a new connection ID
            this.connection = u.random_id()

            // Initiate connection with peer
            log('sending hello..')

            send.call(this, {method: 'hello',
                             connection: this.connection,
                             my_name_is: node.pid})

            // Send gets for all the subscribed keys again
            for (k in this.subscribed_keys) {
                // This one is getting called earlier.
                //
                // The send() function wants to make sure this isn't a
                // duplicate request, so let's delete the old one now so
                // that we can recreate it.

                var subscribe = this.subscribed_keys[k].we_requested
                delete this.subscribed_keys[k].we_requested

                this.send({
                    key: k,
                    subscribe: subscribe,
                    method: 'get',
                })
            }
        },
        disconnected () {
            for (var k in this.subscribed_keys) {

                if (this.keep_alive(k))
                    // Tell the node.  It'll make fissures.
                    node.disconnected({key:k, origin: this})

                // Drop all subscriptions not marked keep_alive
                var s = this.subscribed_keys[k]
                if (!(s.we_requested   && s.we_requested.keep_alive  ))
                    delete s.we_requested
                if (!(s.they_requested && s.they_requested.keep_alive))
                    delete s.they_requested

                // If both are gone, remove the whole subscription
                if (!(s.we_requested || s.they_requested))
                    delete this.subscribed_keys[k]
            }

            this.connecting = false
            this.connection = null
            this.them = null
        },

        keep_alive (key) {
            var s = this.subscribed_keys[key]
            return ((s.we_requested && s.we_requested.keep_alive)
                    ||
                    (s.they_requested && s.they_requested.keep_alive))
        },

        printy_stuff (key) {
            return {id: this.id,
                    w: !!node.resource_at(key).we_welcomed[this.id],
                    k_a: this.keep_alive(key),
                    peer: this.them,
                    c: !!this.connection,
                    r: this.remote
                   }
        }
    }

    return pipe
}


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

// Example braid-peer as a web browser client
w = 70

module.exports = require['websocket-client'] = function add_websocket_client({node, url, prefix}) {
    url = url       || 'ws://localhost:3007/'
    prefix = prefix || '/*'

    var client_creds = null
    var enabled = true
    var sock

    function create_websocket() {
        if (typeof(debug_WS) != 'undefined') {
            return new debug_WS(node.pid)
        } else {
            return new WebSocket(url + '.braid-websocket')
        }
    }

    var connect = () => {
        sock           = create_websocket()
        sock.onopen    = ()  => pipe.connected()
        sock.onmessage = msg => {
            nlog('ws:',
                 node.pid,
                 ' Recvs',
                 JSON.parse(msg.data).method.toUpperCase().padEnd(7),
                 '   ',
                 msg.data.substr(0,w))
            pipe.recv(JSON.parse(msg.data))
        }
        sock.onclose   = ()  => {
            pipe.disconnected()
            if (enabled) {
                if (typeof(g_debug_WS_messages_delayed) != 'undefined')
                    g_debug_WS_messages_delayed.push(connect)
                else setTimeout(connect, 5000)
            }
        }
        sock.onerror = () => {}
    }
    var pipe = require('../pipe.js')({
        id: node.pid,
        type: 'ws-client',
        node,
        connect,
        send: (msg) => {
            nlog('ws:',
                 node.pid,
                 ' Sends',
                 msg.method.toUpperCase().padEnd(7),
                 '   ',
                 JSON.stringify(msg).substr(0,w))
            sock.send(JSON.stringify(msg))
        }
    })
    node.bind(prefix, pipe)

    return {
        pipe,
        enabled() {return enabled},
        enable()  {nlog('ENABLING PIPE', pipe.id);enabled = true; connect()},
        disable() {nlog('DISABLING PIPE',pipe.id);enabled = false;
                   try { sock.terminate() } catch (e) {}},
        toggle()  {if (enabled) {disable()} else enable()}
    }
}


function diff_convert_to_my_format(d, factor) {
    if (factor === undefined) factor = 1
    var x = []
    var ii = 0
    for (var i = 0; i < d.length; i++) {
        var dd = d[i]
        if (dd[0] == DIFF_EQUAL) {
            ii += dd[1].length
            continue
        }
        var xx = [ii, 0, '']
        if (dd[0] == DIFF_INSERT * factor) {
            xx[2] = dd[1]
        } else if (dd[0] == DIFF_DELETE * factor) {
            xx[1] = dd[1].length
            ii += xx[1]
        }
        if (i + 1 < d.length) {
            dd = d[i + 1]
            if (dd[0] != DIFF_EQUAL) {
                if (dd[0] == DIFF_INSERT * factor) {
                    xx[2] = dd[1]
                } else if (dd[0] == DIFF_DELETE * factor) {
                    xx[1] = dd[1].length
                    ii += xx[1]
                }
                i++
            }
        }
        x.push(xx)
    }
    return x
}

/**
 * This library modifies the diff-patch-match library by Neil Fraser
 * by removing the patch and match functionality and certain advanced
 * options in the diff function. The original license is as follows:
 *
 * ===
 *
 * Diff Match and Patch
 *
 * Copyright 2006 Google Inc.
 * http://code.google.com/p/google-diff-match-patch/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


/**
 * The data structure representing a diff is an array of tuples:
 * [[DIFF_DELETE, 'Hello'], [DIFF_INSERT, 'Goodbye'], [DIFF_EQUAL, ' world.']]
 * which means: delete 'Hello', add 'Goodbye' and keep ' world.'
 */
var DIFF_DELETE = -1;
var DIFF_INSERT = 1;
var DIFF_EQUAL = 0;


/**
 * Find the differences between two texts.  Simplifies the problem by stripping
 * any common prefix or suffix off the texts before diffing.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {Int} cursor_pos Expected edit position in text1 (optional)
 * @return {Array} Array of diff tuples.
 */
function diff_main(text1, text2, cursor_pos) {
  // Check for equality (speedup).
  if (text1 == text2) {
    if (text1) {
      return [[DIFF_EQUAL, text1]];
    }
    return [];
  }

  // Check cursor_pos within bounds
  if (cursor_pos < 0 || text1.length < cursor_pos) {
    cursor_pos = null;
  }

  // Trim off common prefix (speedup).
  var commonlength = diff_commonPrefix(text1, text2);
  var commonprefix = text1.substring(0, commonlength);
  text1 = text1.substring(commonlength);
  text2 = text2.substring(commonlength);

  // Trim off common suffix (speedup).
  commonlength = diff_commonSuffix(text1, text2);
  var commonsuffix = text1.substring(text1.length - commonlength);
  text1 = text1.substring(0, text1.length - commonlength);
  text2 = text2.substring(0, text2.length - commonlength);

  // Compute the diff on the middle block.
  var diffs = diff_compute_(text1, text2);

  // Restore the prefix and suffix.
  if (commonprefix) {
    diffs.unshift([DIFF_EQUAL, commonprefix]);
  }
  if (commonsuffix) {
    diffs.push([DIFF_EQUAL, commonsuffix]);
  }
  diff_cleanupMerge(diffs);
  if (cursor_pos != null) {
    diffs = fix_cursor(diffs, cursor_pos);
  }
  return diffs;
};


/**
 * Find the differences between two texts.  Assumes that the texts do not
 * have any common prefix or suffix.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @return {Array} Array of diff tuples.
 */
function diff_compute_(text1, text2) {
  var diffs;

  if (!text1) {
    // Just add some text (speedup).
    return [[DIFF_INSERT, text2]];
  }

  if (!text2) {
    // Just delete some text (speedup).
    return [[DIFF_DELETE, text1]];
  }

  var longtext = text1.length > text2.length ? text1 : text2;
  var shorttext = text1.length > text2.length ? text2 : text1;
  var i = longtext.indexOf(shorttext);
  if (i != -1) {
    // Shorter text is inside the longer text (speedup).
    diffs = [[DIFF_INSERT, longtext.substring(0, i)],
             [DIFF_EQUAL, shorttext],
             [DIFF_INSERT, longtext.substring(i + shorttext.length)]];
    // Swap insertions for deletions if diff is reversed.
    if (text1.length > text2.length) {
      diffs[0][0] = diffs[2][0] = DIFF_DELETE;
    }
    return diffs;
  }

  if (shorttext.length == 1) {
    // Single character string.
    // After the previous speedup, the character can't be an equality.
    return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
  }

  // Check to see if the problem can be split in two.
  var hm = diff_halfMatch_(text1, text2);
  if (hm) {
    // A half-match was found, sort out the return data.
    var text1_a = hm[0];
    var text1_b = hm[1];
    var text2_a = hm[2];
    var text2_b = hm[3];
    var mid_common = hm[4];
    // Send both pairs off for separate processing.
    var diffs_a = diff_main(text1_a, text2_a);
    var diffs_b = diff_main(text1_b, text2_b);
    // Merge the results.
    return diffs_a.concat([[DIFF_EQUAL, mid_common]], diffs_b);
  }

  return diff_bisect_(text1, text2);
};


/**
 * Find the 'middle snake' of a diff, split the problem in two
 * and return the recursively constructed diff.
 * See Myers 1986 paper: An O(ND) Difference Algorithm and Its Variations.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @return {Array} Array of diff tuples.
 * @private
 */
function diff_bisect_(text1, text2) {
  // Cache the text lengths to prevent multiple calls.
  var text1_length = text1.length;
  var text2_length = text2.length;
  var max_d = Math.ceil((text1_length + text2_length) / 2);
  var v_offset = max_d;
  var v_length = 2 * max_d;
  var v1 = new Array(v_length);
  var v2 = new Array(v_length);
  // Setting all elements to -1 is faster in Chrome & Firefox than mixing
  // integers and undefined.
  for (var x = 0; x < v_length; x++) {
    v1[x] = -1;
    v2[x] = -1;
  }
  v1[v_offset + 1] = 0;
  v2[v_offset + 1] = 0;
  var delta = text1_length - text2_length;
  // If the total number of characters is odd, then the front path will collide
  // with the reverse path.
  var front = (delta % 2 != 0);
  // Offsets for start and end of k loop.
  // Prevents mapping of space beyond the grid.
  var k1start = 0;
  var k1end = 0;
  var k2start = 0;
  var k2end = 0;
  for (var d = 0; d < max_d; d++) {
    // Walk the front path one step.
    for (var k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      var k1_offset = v_offset + k1;
      var x1;
      if (k1 == -d || (k1 != d && v1[k1_offset - 1] < v1[k1_offset + 1])) {
        x1 = v1[k1_offset + 1];
      } else {
        x1 = v1[k1_offset - 1] + 1;
      }
      var y1 = x1 - k1;
      while (x1 < text1_length && y1 < text2_length &&
             text1.charAt(x1) == text2.charAt(y1)) {
        x1++;
        y1++;
      }
      v1[k1_offset] = x1;
      if (x1 > text1_length) {
        // Ran off the right of the graph.
        k1end += 2;
      } else if (y1 > text2_length) {
        // Ran off the bottom of the graph.
        k1start += 2;
      } else if (front) {
        var k2_offset = v_offset + delta - k1;
        if (k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] != -1) {
          // Mirror x2 onto top-left coordinate system.
          var x2 = text1_length - v2[k2_offset];
          if (x1 >= x2) {
            // Overlap detected.
            return diff_bisectSplit_(text1, text2, x1, y1);
          }
        }
      }
    }

    // Walk the reverse path one step.
    for (var k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      var k2_offset = v_offset + k2;
      var x2;
      if (k2 == -d || (k2 != d && v2[k2_offset - 1] < v2[k2_offset + 1])) {
        x2 = v2[k2_offset + 1];
      } else {
        x2 = v2[k2_offset - 1] + 1;
      }
      var y2 = x2 - k2;
      while (x2 < text1_length && y2 < text2_length &&
             text1.charAt(text1_length - x2 - 1) ==
             text2.charAt(text2_length - y2 - 1)) {
        x2++;
        y2++;
      }
      v2[k2_offset] = x2;
      if (x2 > text1_length) {
        // Ran off the left of the graph.
        k2end += 2;
      } else if (y2 > text2_length) {
        // Ran off the top of the graph.
        k2start += 2;
      } else if (!front) {
        var k1_offset = v_offset + delta - k2;
        if (k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] != -1) {
          var x1 = v1[k1_offset];
          var y1 = v_offset + x1 - k1_offset;
          // Mirror x2 onto top-left coordinate system.
          x2 = text1_length - x2;
          if (x1 >= x2) {
            // Overlap detected.
            return diff_bisectSplit_(text1, text2, x1, y1);
          }
        }
      }
    }
  }
  // Diff took too long and hit the deadline or
  // number of diffs equals number of characters, no commonality at all.
  return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
};


/**
 * Given the location of the 'middle snake', split the diff in two parts
 * and recurse.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {number} x Index of split point in text1.
 * @param {number} y Index of split point in text2.
 * @return {Array} Array of diff tuples.
 */
function diff_bisectSplit_(text1, text2, x, y) {
  var text1a = text1.substring(0, x);
  var text2a = text2.substring(0, y);
  var text1b = text1.substring(x);
  var text2b = text2.substring(y);

  // Compute both diffs serially.
  var diffs = diff_main(text1a, text2a);
  var diffsb = diff_main(text1b, text2b);

  return diffs.concat(diffsb);
};


/**
 * Determine the common prefix of two strings.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {number} The number of characters common to the start of each
 *     string.
 */
function diff_commonPrefix(text1, text2) {
  // Quick check for common null cases.
  if (!text1 || !text2 || text1.charAt(0) != text2.charAt(0)) {
    return 0;
  }
  // Binary search.
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/
  var pointermin = 0;
  var pointermax = Math.min(text1.length, text2.length);
  var pointermid = pointermax;
  var pointerstart = 0;
  while (pointermin < pointermid) {
    if (text1.substring(pointerstart, pointermid) ==
        text2.substring(pointerstart, pointermid)) {
      pointermin = pointermid;
      pointerstart = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }
  return pointermid;
};


/**
 * Determine the common suffix of two strings.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {number} The number of characters common to the end of each string.
 */
function diff_commonSuffix(text1, text2) {
  // Quick check for common null cases.
  if (!text1 || !text2 ||
      text1.charAt(text1.length - 1) != text2.charAt(text2.length - 1)) {
    return 0;
  }
  // Binary search.
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/
  var pointermin = 0;
  var pointermax = Math.min(text1.length, text2.length);
  var pointermid = pointermax;
  var pointerend = 0;
  while (pointermin < pointermid) {
    if (text1.substring(text1.length - pointermid, text1.length - pointerend) ==
        text2.substring(text2.length - pointermid, text2.length - pointerend)) {
      pointermin = pointermid;
      pointerend = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }
  return pointermid;
};


/**
 * Do the two texts share a substring which is at least half the length of the
 * longer text?
 * This speedup can produce non-minimal diffs.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {Array.<string>} Five element Array, containing the prefix of
 *     text1, the suffix of text1, the prefix of text2, the suffix of
 *     text2 and the common middle.  Or null if there was no match.
 */
function diff_halfMatch_(text1, text2) {
  var longtext = text1.length > text2.length ? text1 : text2;
  var shorttext = text1.length > text2.length ? text2 : text1;
  if (longtext.length < 4 || shorttext.length * 2 < longtext.length) {
    return null;  // Pointless.
  }

  /**
   * Does a substring of shorttext exist within longtext such that the substring
   * is at least half the length of longtext?
   * Closure, but does not reference any external variables.
   * @param {string} longtext Longer string.
   * @param {string} shorttext Shorter string.
   * @param {number} i Start index of quarter length substring within longtext.
   * @return {Array.<string>} Five element Array, containing the prefix of
   *     longtext, the suffix of longtext, the prefix of shorttext, the suffix
   *     of shorttext and the common middle.  Or null if there was no match.
   * @private
   */
  function diff_halfMatchI_(longtext, shorttext, i) {
    // Start with a 1/4 length substring at position i as a seed.
    var seed = longtext.substring(i, i + Math.floor(longtext.length / 4));
    var j = -1;
    var best_common = '';
    var best_longtext_a, best_longtext_b, best_shorttext_a, best_shorttext_b;
    while ((j = shorttext.indexOf(seed, j + 1)) != -1) {
      var prefixLength = diff_commonPrefix(longtext.substring(i),
                                           shorttext.substring(j));
      var suffixLength = diff_commonSuffix(longtext.substring(0, i),
                                           shorttext.substring(0, j));
      if (best_common.length < suffixLength + prefixLength) {
        best_common = shorttext.substring(j - suffixLength, j) +
            shorttext.substring(j, j + prefixLength);
        best_longtext_a = longtext.substring(0, i - suffixLength);
        best_longtext_b = longtext.substring(i + prefixLength);
        best_shorttext_a = shorttext.substring(0, j - suffixLength);
        best_shorttext_b = shorttext.substring(j + prefixLength);
      }
    }
    if (best_common.length * 2 >= longtext.length) {
      return [best_longtext_a, best_longtext_b,
              best_shorttext_a, best_shorttext_b, best_common];
    } else {
      return null;
    }
  }

  // First check if the second quarter is the seed for a half-match.
  var hm1 = diff_halfMatchI_(longtext, shorttext,
                             Math.ceil(longtext.length / 4));
  // Check again based on the third quarter.
  var hm2 = diff_halfMatchI_(longtext, shorttext,
                             Math.ceil(longtext.length / 2));
  var hm;
  if (!hm1 && !hm2) {
    return null;
  } else if (!hm2) {
    hm = hm1;
  } else if (!hm1) {
    hm = hm2;
  } else {
    // Both matched.  Select the longest.
    hm = hm1[4].length > hm2[4].length ? hm1 : hm2;
  }

  // A half-match was found, sort out the return data.
  var text1_a, text1_b, text2_a, text2_b;
  if (text1.length > text2.length) {
    text1_a = hm[0];
    text1_b = hm[1];
    text2_a = hm[2];
    text2_b = hm[3];
  } else {
    text2_a = hm[0];
    text2_b = hm[1];
    text1_a = hm[2];
    text1_b = hm[3];
  }
  var mid_common = hm[4];
  return [text1_a, text1_b, text2_a, text2_b, mid_common];
};


/**
 * Reorder and merge like edit sections.  Merge equalities.
 * Any edit section can move as long as it doesn't cross an equality.
 * @param {Array} diffs Array of diff tuples.
 */
function diff_cleanupMerge(diffs) {
  diffs.push([DIFF_EQUAL, '']);  // Add a dummy entry at the end.
  var pointer = 0;
  var count_delete = 0;
  var count_insert = 0;
  var text_delete = '';
  var text_insert = '';
  var commonlength;
  while (pointer < diffs.length) {
    switch (diffs[pointer][0]) {
      case DIFF_INSERT:
        count_insert++;
        text_insert += diffs[pointer][1];
        pointer++;
        break;
      case DIFF_DELETE:
        count_delete++;
        text_delete += diffs[pointer][1];
        pointer++;
        break;
      case DIFF_EQUAL:
        // Upon reaching an equality, check for prior redundancies.
        if (count_delete + count_insert > 1) {
          if (count_delete !== 0 && count_insert !== 0) {
            // Factor out any common prefixies.
            commonlength = diff_commonPrefix(text_insert, text_delete);
            if (commonlength !== 0) {
              if ((pointer - count_delete - count_insert) > 0 &&
                  diffs[pointer - count_delete - count_insert - 1][0] ==
                  DIFF_EQUAL) {
                diffs[pointer - count_delete - count_insert - 1][1] +=
                    text_insert.substring(0, commonlength);
              } else {
                diffs.splice(0, 0, [DIFF_EQUAL,
                                    text_insert.substring(0, commonlength)]);
                pointer++;
              }
              text_insert = text_insert.substring(commonlength);
              text_delete = text_delete.substring(commonlength);
            }
            // Factor out any common suffixies.
            commonlength = diff_commonSuffix(text_insert, text_delete);
            if (commonlength !== 0) {
              diffs[pointer][1] = text_insert.substring(text_insert.length -
                  commonlength) + diffs[pointer][1];
              text_insert = text_insert.substring(0, text_insert.length -
                  commonlength);
              text_delete = text_delete.substring(0, text_delete.length -
                  commonlength);
            }
          }
          // Delete the offending records and add the merged ones.
          if (count_delete === 0) {
            diffs.splice(pointer - count_insert,
                count_delete + count_insert, [DIFF_INSERT, text_insert]);
          } else if (count_insert === 0) {
            diffs.splice(pointer - count_delete,
                count_delete + count_insert, [DIFF_DELETE, text_delete]);
          } else {
            diffs.splice(pointer - count_delete - count_insert,
                count_delete + count_insert, [DIFF_DELETE, text_delete],
                [DIFF_INSERT, text_insert]);
          }
          pointer = pointer - count_delete - count_insert +
                    (count_delete ? 1 : 0) + (count_insert ? 1 : 0) + 1;
        } else if (pointer !== 0 && diffs[pointer - 1][0] == DIFF_EQUAL) {
          // Merge this equality with the previous one.
          diffs[pointer - 1][1] += diffs[pointer][1];
          diffs.splice(pointer, 1);
        } else {
          pointer++;
        }
        count_insert = 0;
        count_delete = 0;
        text_delete = '';
        text_insert = '';
        break;
    }
  }
  if (diffs[diffs.length - 1][1] === '') {
    diffs.pop();  // Remove the dummy entry at the end.
  }

  // Second pass: look for single edits surrounded on both sides by equalities
  // which can be shifted sideways to eliminate an equality.
  // e.g: A<ins>BA</ins>C -> <ins>AB</ins>AC
  var changes = false;
  pointer = 1;
  // Intentionally ignore the first and last element (don't need checking).
  while (pointer < diffs.length - 1) {
    if (diffs[pointer - 1][0] == DIFF_EQUAL &&
        diffs[pointer + 1][0] == DIFF_EQUAL) {
      // This is a single edit surrounded by equalities.
      if (diffs[pointer][1].substring(diffs[pointer][1].length -
          diffs[pointer - 1][1].length) == diffs[pointer - 1][1]) {
        // Shift the edit over the previous equality.
        diffs[pointer][1] = diffs[pointer - 1][1] +
            diffs[pointer][1].substring(0, diffs[pointer][1].length -
                                        diffs[pointer - 1][1].length);
        diffs[pointer + 1][1] = diffs[pointer - 1][1] + diffs[pointer + 1][1];
        diffs.splice(pointer - 1, 1);
        changes = true;
      } else if (diffs[pointer][1].substring(0, diffs[pointer + 1][1].length) ==
          diffs[pointer + 1][1]) {
        // Shift the edit over the next equality.
        diffs[pointer - 1][1] += diffs[pointer + 1][1];
        diffs[pointer][1] =
            diffs[pointer][1].substring(diffs[pointer + 1][1].length) +
            diffs[pointer + 1][1];
        diffs.splice(pointer + 1, 1);
        changes = true;
      }
    }
    pointer++;
  }
  // If shifts were made, the diff needs reordering and another shift sweep.
  if (changes) {
    diff_cleanupMerge(diffs);
  }
};


/*
 * Modify a diff such that the cursor position points to the start of a change:
 * E.g.
 *   cursor_normalize_diff([[DIFF_EQUAL, 'abc']], 1)
 *     => [1, [[DIFF_EQUAL, 'a'], [DIFF_EQUAL, 'bc']]]
 *   cursor_normalize_diff([[DIFF_INSERT, 'new'], [DIFF_DELETE, 'xyz']], 2)
 *     => [2, [[DIFF_INSERT, 'new'], [DIFF_DELETE, 'xy'], [DIFF_DELETE, 'z']]]
 *
 * @param {Array} diffs Array of diff tuples
 * @param {Int} cursor_pos Suggested edit position. Must not be out of bounds!
 * @return {Array} A tuple [cursor location in the modified diff, modified diff]
 */
function cursor_normalize_diff (diffs, cursor_pos) {
  if (cursor_pos === 0) {
    return [DIFF_EQUAL, diffs];
  }
  for (var current_pos = 0, i = 0; i < diffs.length; i++) {
    var d = diffs[i];
    if (d[0] === DIFF_DELETE || d[0] === DIFF_EQUAL) {
      var next_pos = current_pos + d[1].length;
      if (cursor_pos === next_pos) {
        return [i + 1, diffs];
      } else if (cursor_pos < next_pos) {
        // copy to prevent side effects
        diffs = diffs.slice();
        // split d into two diff changes
        var split_pos = cursor_pos - current_pos;
        var d_left = [d[0], d[1].slice(0, split_pos)];
        var d_right = [d[0], d[1].slice(split_pos)];
        diffs.splice(i, 1, d_left, d_right);
        return [i + 1, diffs];
      } else {
        current_pos = next_pos;
      }
    }
  }
  throw new Error('cursor_pos is out of bounds!')
}

/*
 * Modify a diff such that the edit position is "shifted" to the proposed edit location (cursor_position).
 *
 * Case 1)
 *   Check if a naive shift is possible:
 *     [0, X], [ 1, Y] -> [ 1, Y], [0, X]    (if X + Y === Y + X)
 *     [0, X], [-1, Y] -> [-1, Y], [0, X]    (if X + Y === Y + X) - holds same result
 * Case 2)
 *   Check if the following shifts are possible:
 *     [0, 'pre'], [ 1, 'prefix'] -> [ 1, 'pre'], [0, 'pre'], [ 1, 'fix']
 *     [0, 'pre'], [-1, 'prefix'] -> [-1, 'pre'], [0, 'pre'], [-1, 'fix']
 *         ^            ^
 *         d          d_next
 *
 * @param {Array} diffs Array of diff tuples
 * @param {Int} cursor_pos Suggested edit position. Must not be out of bounds!
 * @return {Array} Array of diff tuples
 */
function fix_cursor (diffs, cursor_pos) {
  var norm = cursor_normalize_diff(diffs, cursor_pos);
  var ndiffs = norm[1];
  var cursor_pointer = norm[0];
  var d = ndiffs[cursor_pointer];
  var d_next = ndiffs[cursor_pointer + 1];

  if (d == null) {
    // Text was deleted from end of original string,
    // cursor is now out of bounds in new string
    return diffs;
  } else if (d[0] !== DIFF_EQUAL) {
    // A modification happened at the cursor location.
    // This is the expected outcome, so we can return the original diff.
    return diffs;
  } else {
    if (d_next != null && d[1] + d_next[1] === d_next[1] + d[1]) {
      // Case 1)
      // It is possible to perform a naive shift
      ndiffs.splice(cursor_pointer, 2, d_next, d)
      return merge_tuples(ndiffs, cursor_pointer, 2)
    } else if (d_next != null && d_next[1].indexOf(d[1]) === 0) {
      // Case 2)
      // d[1] is a prefix of d_next[1]
      // We can assume that d_next[0] !== 0, since d[0] === 0
      // Shift edit locations..
      ndiffs.splice(cursor_pointer, 2, [d_next[0], d[1]], [0, d[1]]);
      var suffix = d_next[1].slice(d[1].length);
      if (suffix.length > 0) {
        ndiffs.splice(cursor_pointer + 2, 0, [d_next[0], suffix]);
      }
      return merge_tuples(ndiffs, cursor_pointer, 3)
    } else {
      // Not possible to perform any modification
      return diffs;
    }
  }

}

/*
 * Try to merge tuples with their neigbors in a given range.
 * E.g. [0, 'a'], [0, 'b'] -> [0, 'ab']
 *
 * @param {Array} diffs Array of diff tuples.
 * @param {Int} start Position of the first element to merge (diffs[start] is also merged with diffs[start - 1]).
 * @param {Int} length Number of consecutive elements to check.
 * @return {Array} Array of merged diff tuples.
 */
function merge_tuples (diffs, start, length) {
  // Check from (start-1) to (start+length).
  for (var i = start + length - 1; i >= 0 && i >= start - 1; i--) {
    if (i + 1 < diffs.length) {
      var left_d = diffs[i];
      var right_d = diffs[i+1];
      if (left_d[0] === right_d[1]) {
        diffs.splice(i, 2, [left_d[0], left_d[1] + right_d[1]]);
      }
    }
  }
  return diffs;
}


exports.diff_convert_to_my_format = diff_convert_to_my_format
exports.diff_main = diff_main
