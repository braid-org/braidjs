
var diffsync = (typeof(module) != 'undefined') ? module.exports : {}

diffsync.version = 1039
diffsync.port = 60607

// var client = diffsync.create_client({
//     ws_url : 'ws://invisible.college:' + diffsync.port,
//     channel : 'the_cool_room',
//     get_text : function () {
//         return current_text_displayed_to_user
//     },
//     get_range : function () {
//         return [selection_start, selection_end]
//     },
//     on_text : function (text, range) {
//         current_text_displayed_to_user = text
//         set_selection(range[0], range[1])
//     },
//     on_ranges : function (peer_ranges) {
//.        for (peer in peer_ranges) {
//             set_peer_selection(peer_ranges[peer][0], peer_ranges[peer][1])
//         }
//     }
// })
//
// client.on_change() <-- call this when the user changes the text or cursor/selection position
//
diffsync.create_client = function (options) {
    var self = {}
    self.on_change = null
    self.on_window_closing = null
    self.get_channels = null
    options.network_broke = options.network_broke || function () {}

    var on_channels = null

    var uid = guid()
    var minigit = diffsync.create_minigit()
    var unacknowledged_commits = {}

    var prev_range = [-1, -1]
    var peer_ranges = {}

    window.addEventListener('beforeunload', function () {
        if (self.on_window_closing) self.on_window_closing()
    })

    var connected = false
    function reconnect() {
        connected = false
        console.log('connecting...')
        var ws = new WebSocket(options.ws_url)

        function send(o) {
            o.v = diffsync.version
            o.uid = uid
            o.channel = options.channel
            try {
                ws.send(JSON.stringify(o))
            } catch (e) {}
        }

        self.on_window_closing = function () {
            send({ close : true })
        }

        self.get_channels = function (cb) {
            on_channels = cb
            send({ get_channels : true })
        }
    
        ws.onopen = function () {
            connected = true
            send({ join : true })
            options.network_broke(false)
            on_pong()
        }
    
        var pong_timer = null
        function on_pong() {
            clearTimeout(pong_timer)
            setTimeout(function () {
                send({ ping : true })
                pong_timer = setTimeout(function () {
                    console.log('no pong came!!')
                    if (ws) {
                        ws = null
                        options.network_broke(true)
                        reconnect()
                    }
                }, 4000)
            }, 3000)
        }

        ws.onclose = function () {
            console.log('connection closed...')
            options.network_broke(true)
            if (ws) {
                ws = null
                setTimeout(reconnect, 3000)
            }
        }

        var sent_unacknowledged_commits = false

        function adjust_range(range, patch) {
            return map_array(range, function (x) {
                each(patch, function (p) {
                    if (p[0] < x) {
                        if (p[0] + p[1] <= x) {
                            x += -p[1] + p[2].length
                        } else {
                            x = p[0] + p[2].length
                        }
                    } else return false
                })
                return x
            })
        }
    
        ws.onmessage = function (event) {
            if (!ws) { return }
            var o = JSON.parse(event.data)
            if (o.pong) { return on_pong() }

            console.log('message: ' + event.data)

            if (o.channels) {
                if (on_channels) on_channels(o.channels)
            }
            if (o.commits) {
                // self.on_change()
                minigit.merge(o.commits)

                var patch = get_diff_patch(options.get_text(), minigit.cache)
                each(peer_ranges, function (range, peer) {
                    peer_ranges[peer] = adjust_range(range, patch)
                })

                prev_range = adjust_range(options.get_range(), patch)
                options.on_text(minigit.cache, prev_range)

                if (o.welcome) {
                    each(extend(o.commits, minigit.get_ancestors(o.commits)), function (_, id) {
                        delete unacknowledged_commits[id]
                    })
                    if (Object.keys(unacknowledged_commits).length > 0) {
                        send({ commits : unacknowledged_commits })
                    }
                    sent_unacknowledged_commits = true
                }

                send({ leaves : minigit.leaves })
            }
            if (o.may_delete) {
                each(o.may_delete, function (_, id) {
                    delete unacknowledged_commits[id]
                    minigit.remove(id)
                })
            }
            if (o.range) {
                peer_ranges[o.uid] = o.range
            }
            if (o.close) {
                delete peer_ranges[o.uid]
            }
            if ((o.range || o.close || o.commits) && options.on_ranges) {
                options.on_ranges(peer_ranges)
            }
        }

        self.on_change = function () {
            // if (!connected) { return }

            var old_cache = minigit.cache
            var cs = minigit.commit(options.get_text())
            if (cs) {
                extend(unacknowledged_commits, cs)

                var patch = null
                var c = cs[Object.keys(cs)[0]]
                var parents = Object.keys(c.from_parents)
                if (parents.length == 1)
                    patch = c.from_parents[parents[0]]
                else
                    patch = get_diff_patch(old_cache, minigit.cache)

                each(peer_ranges, function (range, peer) {
                    peer_ranges[peer] = adjust_range(range, patch)
                })
                if (options.on_ranges) options.on_ranges(peer_ranges)
            }

            if (!sent_unacknowledged_commits) { return }

            var range = options.get_range()
            var range_changed = (range[0] != prev_range[0]) || (range[1] != prev_range[1])
            prev_range = range

            var msg = {}
            if (cs) msg.commits = cs

            if (range_changed) msg.range = range
            if (cs || range_changed) send(msg)
        }
    }
    reconnect()

    return self
}

// options is an object like this: {
//     wss : a websocket server from the 'ws' module,
//     initial_data : {
//         'some_channel_name' : {
//             commits : {
//                 'asdfasdf' : {
//                     to_parents : {},
//                     from_parents : {},
//                     text : 'hello'
//                 }
//             },
//             members : {
//                 'lkjlkjlkj' : {
//                     do_not_delete : {
//                         'asdfasdf' : true
//                     }
//                 },
//                 last_seen : 1510878755554,
//                 last_sent : 1510878755554
//             }
//         }
//     },
//     on_change : function (changes) {
//         changes contains commits and members that changed,
//         and looks like: {
//             channel : 'some_channel_name',
//             commits : {...},
//             members : {...}
//         }
//     }
// }
//
diffsync.create_server = function (options) {
    var self = {}
    self.channels = {}

    function new_channel(name) {
        return self.channels[name] = {
            name : name,
            minigit : diffsync.create_minigit(),
            members : {}
        }
    }
    function get_channel(name) {
        return self.channels[name] || new_channel(name)
    }

    var users_to_sockets = {}

    if (options.initial_data) {
        each(options.initial_data, function (data, channel) {
            var c = get_channel(channel)
            c.minigit.merge(data.commits)
            extend(c.members, data.members)
        })
    }

    options.wss.on('connection', function connection(ws) {
        console.log('new connection')
        var uid = null
        var channel_name = null

        function myClose() {
            if (!uid) { return }
            delete users_to_sockets[uid]
            each(users_to_sockets, function (_ws, _uid) {
                try {
                    _ws.send(JSON.stringify({
                        v : diffsync.version,
                        uid : uid,
                        channel : channel_name,
                        close : true
                    }))
                } catch (e) {}
            })
        }

        ws.on('close', myClose)
        ws.on('error', myClose)

        ws.on('message', function (message) {
            var o = JSON.parse(message)
            if (o.v != diffsync.version) { return }
            if (o.ping) { return try_send(ws, JSON.stringify({ pong : true })) }

            console.log('message: ' + message)

            uid = o.uid
            var channel = get_channel(o.channel)
            channel_name = channel.name
            users_to_sockets[uid] = ws
            
            var changes = { channel : channel.name, commits : {}, members : {} }

            if (!channel.members[uid]) channel.members[uid] = { do_not_delete : {}, last_sent : 0 }
            channel.members[uid].last_seen = Date.now()
            changes.members[uid] = channel.members[uid]

            function try_send(ws, message) {
                try {
                    ws.send(message)
                } catch (e) {}
            }
            function send_to_all_but_me(message) {
                each(channel.members, function (_, them) {
                    if (them != uid) {
                        try_send(users_to_sockets[them], message)
                    }
                })
            }

            if (o.get_channels) {
                try_send(ws, JSON.stringify({ channels : Object.keys(self.channels) }))
            }
            if (o.join) {
                try_send(ws, JSON.stringify({ commits : channel.minigit.commits, welcome : true }))
            }
            if (o.commits) {
                var new_commits = {}
                each(o.commits, function (c, id) {
                    if (!channel.minigit.commits[id]) {
                        new_commits[id] = c
                        changes.commits[id] = c
                    }
                })
                channel.minigit.merge(new_commits)

                var new_message = {
                    channel : channel.name,
                    commits : new_commits
                }
                if (o.range) {
                    new_message.uid = o.uid
                    new_message.range = o.range
                }
                new_message = JSON.stringify(new_message)

                leaves = channel.minigit.get_leaves(new_commits)
                var now = Date.now()
                each(channel.members, function (m, them) {
                    if (them != uid) {
                        if (m.last_seen > m.last_sent) {
                            m.last_sent = now
                            changes.members[them] = m
                        } else if (m.last_sent < now - 3000) {
                            return
                        }
                        extend(m.do_not_delete, leaves)
                        try_send(users_to_sockets[them], new_message)
                    }
                })
                if (!o.leaves) o.leaves = channel.minigit.get_leaves(o.commits)
            } else if (o.range) {
                send_to_all_but_me(message)
            }
            if (o.leaves) {
                extend(channel.members[uid].do_not_delete, o.leaves)
                each(channel.minigit.get_ancestors(o.leaves), function (_, id) {
                    delete channel.members[uid].do_not_delete[id]
                })

                var necessary = {}
                each(channel.members, function (m) {
                    extend(necessary, m.do_not_delete)
                })

                var affected = channel.minigit.remove_unnecessary(necessary)
                extend(changes.commits, affected)

                var new_message = {
                    channel : channel.name,
                    may_delete : {}
                }
                each(affected, function (c, id) {
                    if (c.delete_me) {
                        new_message.may_delete[id] = true
                    }
                })
                if (Object.keys(new_message.may_delete).length > 0) {
                    new_message = JSON.stringify(new_message)
                    each(channel.members, function (m, them) {
                        try_send(users_to_sockets[them], new_message)
                    })
                }
            }
            if (o.close) {
                channel.members[uid].delete_me = true
                delete channel.members[uid]
            }

            if (options.on_change) options.on_change(changes)
        })
    })

    return self
}

///////////////

diffsync.create_minigit = function () {
    var self = {
        commits : {},
        to_children : {},
        commit_cache : {},
        leaves : {},
        cache : ''
    }

    self.remove_unnecessary = function (spare_us) {
        var affected = {}
        while (true) {
            var found = false
            each(self.commits, function (c, id) {
                if (spare_us[id]) { return }
                var aff = self.remove(id)
                if (aff) {
                    extend(affected, aff)
                    found = true
                }
            })
            if (!found) break
        }
        return affected
    }

    self.remove = function (id) {
        var keys = Object.keys(self.to_children[id])
        if (keys.length == 1) {
            var affected = {}

            var being_removed = self.commits[id]
            var c_id = keys[0]
            var c = self.commits[c_id]

            self.get_text(c_id)
            each(being_removed.to_parents, function (_, id) {
                self.get_text(id)
            })

            delete self.commits[id]
            delete self.commit_cache[id]
            delete c.to_parents[id]
            delete c.from_parents[id]
            being_removed.delete_me = true
            affected[id] = being_removed

            each(being_removed.to_parents, function (_, id) {
                var x = get_diff_patch_2(self.get_text(c_id), self.get_text(id))
                c.to_parents[id] = x[0]
                c.from_parents[id] = x[1]
            })
            if (Object.keys(c.to_parents).length == 0) {
                c.text = self.get_text(c_id)
            }
            affected[c_id] = c

            self.calc_children()

            return affected
        }
    }

    self.commit = function (s) {
        if (s == self.cache) { return }

        var c = {
            to_parents : {},
            from_parents : {}
        }
        if (Object.keys(self.leaves).length == 0) {
            c.text = s
        } else {
            each(self.leaves, function (_, leaf) {
                var x = get_diff_patch_2(s, self.get_text(leaf))
                c.to_parents[leaf] = x[0]
                c.from_parents[leaf] = x[1]
            })
        }

        var id = guid()
        self.commits[id] = c
        self.calc_children()
        self.leaves = {}
        self.leaves[id] = true
        self.commit_cache[id] = s
        self.cache = s
        self.purge_cache()

        var cs = {}
        cs[id] = c
        return cs
    }

    self.merge = function (cs) {
        each(cs, function (c, id) {
            if (!self.commits[id]) {
                self.commits[id] = c
            } else {
                if (c.text) self.commits[id].text = c.text
                extend(self.commits[id].to_parents, c.to_parents)
                extend(self.commits[id].from_parents, c.from_parents)
            }
        })
        self.calc_children()
        self.leaves = self.get_leaves()
        self.cache = self.rec_merge(self.leaves)
        self.purge_cache()
        return self.cache
    }

    self.calc_children = function () {
        self.to_children = {}
        each(self.commits, function (c, id) {
            self.to_children[id] = {}
        })
        each(self.commits, function (c, id) {
            each(c.from_parents, function (d, p_id) {
                self.to_children[p_id][id] = d
            })
        })
    }

    self.purge_cache = function () {
        each(self.commits, function (c, id) {
            if (Object.keys(c.to_parents).length > 0 && !self.leaves[id]) {
                delete self.commit_cache[id]
            }
        })
    }

    self.get_text = function (id) {
        if (self.commit_cache[id] != null) return self.commit_cache[id]

        var frontier = [id]
        var back_pointers = {}
        back_pointers[id] = id
        while (true) {
            var next = frontier.shift()

            if (!next) { throw 'data structure corrupted' }
            var c_id = next
            var c = self.commits[c_id]
            var text = (c.text != null) ? c.text : self.commit_cache[c_id]
            if (text != null) {
                var snowball = text
                while (true) {
                    if (next == id) {
                        return self.commit_cache[id] = snowball
                    }
                    next = back_pointers[next]
                    snowball = apply_diff_patch(snowball, c.to_parents[next] || self.to_children[c_id][next])
                    c_id = next
                    c = self.commits[c_id]
                }
            }

            each(c.to_parents, function (_, id) {
                if (!back_pointers[id]) {
                    back_pointers[id] = next
                    frontier.push(id)
                }
            })
            each(self.to_children[c_id], function (_, id) {
                if (!back_pointers[id]) {
                    back_pointers[id] = next
                    frontier.push(id)
                }
            })
        }
    }

    self.rec_merge = function (these) {
        these = Object.keys(these)
        if (these.length == 0) { return '' }
        var r = self.get_text(these[0])
        if (these.length == 1) { return r }
        var r_ancestors = self.get_ancestors(these[0])
        for (var i = 1; i < these.length; i++) {
            var i_ancestors = self.get_ancestors(these[i])
            var o = self.rec_merge(self.get_leaves(intersection(r_ancestors, i_ancestors)))
            r = apply_diff_patch(o, get_merged_diff_patch(r, self.get_text(these[i]), o))
            extend(r_ancestors, i_ancestors)
        }
        return r
    }

    self.get_leaves = function (commits) {
        if (!commits) commits = self.commits
        var leaves = {}
        each(commits, function (_, id) { leaves[id] = true })
        each(commits, function (c) {
            each(c.to_parents, function (_, p) {
                delete leaves[p]
            })
        })
        return leaves
    }

    self.get_ancestors = function (id_or_set) {
        var frontier = null
        if (typeof(id_or_set) == 'object') {
            frontier = Object.keys(id_or_set)
        } else {
            frontier = [id_or_set]
        }
        var ancestors = {}
        while (frontier.length > 0) {
            var next = frontier.shift()
            each(self.commits[next].to_parents, function (_, p) {
                if (!ancestors[p]) {
                    ancestors[p] = self.commits[p]
                    frontier.push(p)
                }
            })
        }
        return ancestors
    }

    return self
}

///////////////

function guid() {
    var x = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    var s = []
    for (var i = 0; i < 15; i++) {
        s.push(x[Math.floor(Math.random() * x.length)])
    }
    return s.join('')
}

function each(o, cb) {
    if (o instanceof Array) {
        for (var i = 0; i < o.length; i++) {
            if (cb(o[i], i, o) == false)
                return false
        }
    } else {
        for (var k in o) {
            if (o.hasOwnProperty(k)) {
                if (cb(o[k], k, o) == false)
                    return false
            }
        }
    }
    return true
}

function map_array(a, f) {
    var b = []
    each(a, function (v, k) { b[k] = f(v) })
    return b
}

function extend(a, b) {
    each(b, function (x, key) { a[key] = x })
    return a
}

function intersection(a, b) {
    var common = {}
    each(a, function (_, x) {
        if (b[x]) {
            common[x] = a[x]
        }
    })
    return common
}

///////////////

var DIFF_DELETE = -1;
var DIFF_INSERT = 1;
var DIFF_EQUAL = 0;

function get_merged_diff_patch(a, b, o) {
    var a_diff = get_diff_patch(o, a)
    var b_diff = get_diff_patch(o, b)
    var ds = []
    var prev_d = null
    while (a_diff.length > 0 || b_diff.length > 0) {
        var d = a_diff.length == 0 ?
            b_diff.shift() :
            b_diff.length == 0 ?
                a_diff.shift() :
                a_diff[0][0] < b_diff[0][0] ?
                    a_diff.shift() :
                    a_diff[0][0] > b_diff[0][0] ?
                        b_diff.shift() :
                        a_diff[0][2] < b_diff[0][2] ?
                            a_diff.shift() :
                            b_diff.shift()
        if (prev_d && d[0] < prev_d[0] + prev_d[1]) {
            if (d[0] + d[1] > prev_d[0] + prev_d[1]) {
                prev_d[1] = d[0] + d[1] - prev_d[0]
            }
            prev_d[2] += d[2]
        } else {
            ds.push(d)
            prev_d = d
        }
    }
    return ds
}

function apply_diff_patch(s, diff) {
    var offset = 0
    for (var i = 0; i < diff.length; i++) {
        var d = diff[i]
        s = s.slice(0, d[0] + offset) + d[2] + s.slice(d[0] + offset + d[1])
        offset += d[2].length - d[1]
    }
    return s
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

function get_diff_patch(a, b) {
    return diff_convert_to_my_format(diff_main(a, b))
}

function get_diff_patch_2(a, b) {
    var x = diff_main(a, b)
    return [diff_convert_to_my_format(x),
        diff_convert_to_my_format(x, -1)]
}

diffsync.get_diff_patch = get_diff_patch
diffsync.get_diff_patch_2 = get_diff_patch_2

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
