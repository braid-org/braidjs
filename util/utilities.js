// ===============================================
//
//   Utilities
//

is_browser = typeof process !== 'object' || typeof global !== 'object'
terminal_width = _ => (!is_browser && process.stdout.columns) || 80
nlogf = (protocol, from, symbol, to, msg) => {
    let stringy = JSON.stringify(msg, function(k, v) {
        if (k === 'method')
            return undefined;
        return v;
    });
    nlog(
        `${protocol}: ${from} ${symbol} ${to}`,
        msg.method.toUpperCase().padEnd(7),
        stringy.substr(0, terminal_width() - 30)
    )
}

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
                assert(value, "one-to-many.add() requires three parameters")
                if (  data[k1] === undefined)   data[k1] = dict()
                if (counts[k1] === undefined) counts[k1] = 0
                if (!data[k1][k2]) counts[k1]++
                data[k1][k2] = value
            },
            delete (k, k2) { delete data[k][k2]; counts[k]-- },
            delete_all (k) { delete data[k]; delete counts[k] },
            has (k, k2)    { return data[k] && k2 in data[k] },
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