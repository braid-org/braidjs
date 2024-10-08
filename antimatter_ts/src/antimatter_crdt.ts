/// # Software Architecture
/// The software is architected into three objects:
///
/// ``` js
/// let {create_antimatter_crdt, create_json_crdt, sequence_crdt} = require('@braidjs/antimatter') 
/// ```

import { create_json_crdt } from "./json_crdt.ts";

// v522

/// - *antimatter_crdt*: created using `create_antimatter_crdt`, this object is a json_crdt with antimatter algorithm methods added to it so that it can communicate with other peers to learn which history can be pruned, and tells the underlying json_crdt object to prune it.
export let create_antimatter_crdt;

/// # create_antimatter_crdt(send[, init])
///
/// Creates and returns a new antimatter_crdt object (or adds antimatter_crdt methods and properties to `init`).
///
/// * `send`: A callback function to be called whenever this antimatter_crdt wants to send a
///   message over a connection registered with `get` or `connect`. The sole
///   parameter to this function is a JSONafiable object that hopes to be passed to
///   the `receive` method on the antimatter_crdt object at the other end of the
///   connection specified in the `conn` key.
/// * `get_time`: function that returns a number representing time (e.g. `Date.now()`)
/// * `set_timeout`: function that takes a callback and timeout length, and calls that callback after that amount of time; also returns an identifier that can be passed to `clear_timeout` to cancel the timeout (e.g. wrapping the javascript setTimeout)
/// * `clear_timeout`: function that takes a timeout identifier an cancels it (e.g. wrapping the javascript clearTimeout)
/// * `init`: (optional) An antimatter_crdt object to start with, which we'll add any properties to that it doesn't have, and we'll add all the antimatter_crdt methods to it. This option exists so you can serialize an antimatter_crdt instance as JSON, and then restore it later. 
/// ``` js
/// let antimatter_crdt = create_antimatter_crdt(msg => {
///     websockets[msg.conn].send(JSON.stringify(msg))
///   },
///   () => Date.now(),
///   (func, t) => setTimeout(func, t),
///   (t) => clearTimeout(t)),
///.  JSON.parse(fs.readFileSync('./antimatter.backup'))
/// )
/// ```
create_antimatter_crdt = (
  send,
  get_time,
  set_timeout,
  clear_timeout,
  self
) => {
  self = create_json_crdt(self);
  self.send = send;

  self.id = self.id || Math.random().toString(36).slice(2);
  self.next_seq = self.next_seq || 0;

  self.conns = self.conns || {};
  self.proto_conns = self.proto_conns || {};
  self.conn_count = self.conn_count || 0;

  self.fissures = self.fissures || {};
  self.acked_boundary = self.acked_boundary || {};
  self.marcos = self.marcos || {};
  self.forget_cbs = self.forget_cbs || {};

  self.version_groups = self.version_groups || {};

  self.marco_map = self.marco_map || {};
  self.marco_time_est_1 = self.marco_time_est_1 || 1000;
  self.marco_time_est_2 = self.marco_time_est_2 || 1000;
  self.marco_current_wait_time = self.marco_current_wait_time || 1000;
  self.marco_increases_allowed = 1;
  self.marco_timeout = self.marco_timeout || null;

  function raw_add_version_group(version_array) {
    let version_map = {};
    for (let v of version_array) {
      if (version_map[v]) continue;
      version_map[v] = true;
      if (self.version_groups[v]) self.version_groups[v].forEach((v) => (version_map[v] = true));
    }
    let version_group = Object.keys(version_map).sort();
    version_group.forEach((v) => (self.version_groups[v] = version_group));
    return version_group;
  }

  function get_parent_and_child_sets(children) {
    let parent_sets = {};
    let child_sets = {};
    let done = {};
    function add_set_to_sets(s, sets, mark_done) {
      let container = { members: s };
      let array = Object.keys(s);
      if (array.length < 2) return;
      for (let v of array) {
        sets[v] = container;
        if (mark_done) done[v] = true;
      }
    }
    add_set_to_sets(self.current_version, parent_sets, true);
    for (let v of Object.keys(self.T)) {
      if (done[v]) continue;
      done[v] = true;
      if (!children[v]) continue;
      let first_child_set = children[v];
      let first_child_array = Object.keys(first_child_set);
      let first_parent_set = self.T[first_child_array[0]];
      let first_parent_array = Object.keys(first_parent_set);
      if (
        first_child_array.every((child) => {
          let parent_set = self.T[child];
          let parent_array = Object.keys(parent_set);
          return (
            parent_array.length == first_parent_array.length &&
            parent_array.every((parent) => first_parent_set[parent])
          );
        }) &&
        first_parent_array.every((parent) => {
          let child_set = children[parent];
          let child_array = Object.keys(child_set);
          return (
            child_array.length == first_child_array.length &&
            child_array.every((child) => first_child_set[child])
          );
        })
      ) {
        add_set_to_sets(first_parent_set, parent_sets, true);
        add_set_to_sets(first_child_set, child_sets);
      }
    }
    return { parent_sets, child_sets };
  }

  function find_one_bubble(bottom, children, child_sets, restricted) {
    let expecting = { ...bottom };
    let seen = {};
    Object.keys(bottom).forEach(
      (v) =>
        children[v] &&
        Object.keys(children[v]).forEach((v) => (seen[v] = true))
    );
    let q = Object.keys(expecting);
    let last_top = null;
    while (q.length) {
      cur = q.shift();
      if (!self.T[cur]) {
        if (!restricted) throw "bad";
        else return last_top;
      }
      if (restricted && restricted[cur]) return last_top;

      if (seen[cur]) continue;

      if (children[cur] && !Object.keys(children[cur]).every((c) => seen[c]))
        continue;
      seen[cur] = true;
      delete expecting[cur];

      if (!Object.keys(expecting).length) {
        last_top = { [cur]: true };
        if (!restricted) return last_top;
      }

      Object.keys(self.T[cur]).forEach((p) => {
        expecting[p] = true;
        q.push(p);
      });

      if (
        child_sets[cur] &&
        Object.keys(child_sets[cur].members).every((v) => seen[v])
      ) {
        let expecting_array = Object.keys(expecting);
        let parent_set = self.T[cur];
        let parent_array = Object.keys(parent_set);
        if (
          expecting_array.length == parent_array.length &&
          expecting_array.every((v) => parent_set[v])
        ) {
          last_top = child_sets[cur].members;
          if (!restricted) return last_top;
        }
      }
    }
    return last_top;
  }

  function add_version_group(version_array) {
    let version_group = raw_add_version_group(version_array);
    if (!version_array.some((x) => self.T[x])) return version_group[0];

    let children = self.get_child_map();
    let { parent_sets, child_sets } = get_parent_and_child_sets(children);

    let to_bubble = {};
    function mark_bubble(v, bubble) {
      if (to_bubble[v]) return;
      to_bubble[v] = bubble;
      for (let vv of Object.keys(self.T[v])) mark_bubble(vv, bubble);
    }

    let bottom = Object.fromEntries(
      version_group.filter((x) => self.T[x]).map((x) => [x, true])
    );
    let top = find_one_bubble(bottom, children, child_sets);
    let bubble = [Object.keys(bottom).sort()[0], Object.keys(top)[0]];
    for (let v of Object.keys(top)) to_bubble[v] = bubble;
    for (let v of Object.keys(bottom)) mark_bubble(v, bubble);

    self.apply_bubbles(to_bubble);
    return version_group[0];
  }

  let orig_send = send;
  send = (x) => {
    if (self.version_groups[x.version])
      x.version = self.version_groups[x.version];
    if (x.parents) {
      x.parents = { ...x.parents };
      Object.keys(x.parents).forEach((v) =>
        self.version_groups[v] && self.version_groups[v].forEach((v) => (x.parents[v] = true))
      );
    }
    if (Array.isArray(x.versions)) {
      x.versions = JSON.parse(JSON.stringify(x.versions));
      x.versions.forEach(
        (v) =>
          self.version_groups[v.version] &&
          (v.version = self.version_groups[v.version])
      );
      x.versions.forEach((v) => {
        Object.keys(v.parents).forEach((vv) =>
          self.version_groups[vv] && self.version_groups[vv].forEach((vv) => (v.parents[vv] = true))
        );
      });
    }

    orig_send(x);
  };

  /// # antimatter_crdt.receive(message)
  ///
  /// Let this antimatter object "receive" a message from another antimatter object, presumably from its `send` callback.
  /// ``` js
  /// websocket.on('message', data => {
  ///     antimatter_crdt.receive(JSON.parse(data)) });
  /// ```
  /// You generally do not need to mess with a message object directly, but below are the various message objects you might see, categorized by their `cmd` entry. Note that each object also
  ///   contains a `conn` entry with the id of the connection the message is sent
  ///   over.
  self.receive = (x) => {
    let {
      cmd,
      version,
      parents,
      patches,
      versions,
      fissure,
      fissures,
      seen,
      forget,
      marco,
      peer,
      conn,
    } = x;

    if (version && typeof version != "string") {
      if (!self.T[version[0]]) version = add_version_group(version);
      else version = version[0];
    }
    if (parents) {
      parents = { ...parents };
      Object.keys(parents).forEach((v) => {
        if (self.version_groups[v] && self.version_groups[v][0] != v)
          delete parents[v];
      });
    }

    if (versions && versions.forEach) versions.forEach((v) => {
      if (typeof v.version != "string") {
        if (!self.T[v.version[0]]) v.version = add_version_group(v.version);
        else v.version = v.version[0];
      }
      v.parents = { ...v.parents };
      Object.keys(v.parents).forEach((vv) => {
        if (self.version_groups[vv] && self.version_groups[vv][0] != vv)
          delete v.parents[vv];
      });
    });

    let marco_versions_array = version
      ? [version]
      : versions && !Array.isArray(versions)
        ? Object.keys(versions).sort()
        : null;
    let marco_versions =
      marco_versions_array &&
      Object.fromEntries(marco_versions_array.map((v) => [v, true]));

    if (versions && !Array.isArray(versions)) {
      versions = { ...versions };
      Object.keys(versions).forEach((v) => {
        if (self.version_groups[v] && self.version_groups[v][0] != v)
          delete versions[v];
      });
      if (!Object.keys(versions).length) return;
    }

    /// ## message `get`
    /// `get` is the first message sent over a connection, and the peer at the other end will respond with `welcome`.
    /// ``` js
    /// { cmd: 'get',
    ///   peer: 'SENDER_ID',
    ///   conn: 'CONN_ID',
    ///   parents: {'PARENT_VERSION_ID': true, ...} }
    /// ```
    /// The `parents` are optional, and describes which versions this peer already has. The other end will respond with versions since that set of parents.
    if (cmd == "get" || (cmd == "welcome" && peer != null)) {
      if (self.conns[conn] != null) throw Error("bad");
      self.conns[conn] = { peer, seq: ++self.conn_count };
    }

    /// ## message `fissure`
    ///
    /// Sent to alert peers about a fissure. The `fissure` entry contains information about the two peers involved in the fissure, the specific connection id that broke, the `versions` that need to be protected, and the `time` of the fissure (in case we want to ignore it after some time). It is also possible to send multiple `fissures` in an array.
    /// ``` js
    /// { cmd: 'fissure',
    ///   fissure: { // or fissures: [{...}, {...}, ...],
    ///     a: 'PEER_A_ID',
    ///     b:  'PEER_B_ID',
    ///     conn: 'CONN_ID',
    ///     versions: {'VERSION_ID': true, ...},
    ///     time: Date.now()
    ///   },
    ///   conn: 'CONN_ID' }
    /// ```
    /// Note that `time` isn't used for anything critical, as it's just wallclock time.
    if (fissure) fissures = [fissure];

    if (fissures) fissures.forEach((f) => (f.t = self.conn_count));

    if (versions && (cmd == "set" || cmd == "welcome"))
      versions = Object.fromEntries(versions.map((v) => [v.version, v]));
    if (version) versions = { [version]: true };

    let rebased_patches = [];

    let fissures_back = [];
    let fissures_forward = [];
    let fissures_done = {};

    function copy_fissures(fs) {
      return fs.map((f) => {
        f = JSON.parse(JSON.stringify(f));
        delete f.t;
        return f;
      });
    }

    if (fissures) {
      let fiss_map = Object.fromEntries(
        fissures.map((f) => [f.a + ":" + f.b + ":" + f.conn, f])
      );
      for (let [key, f] of Object.entries(fiss_map)) {
        if (fissures_done[f.conn]) continue;
        fissures_done[f.conn] = true;

        let our_f = self.fissures[key];
        let other_key = f.b + ":" + f.a + ":" + f.conn;
        let their_other = fiss_map[other_key];
        let our_other = self.fissures[other_key];

        if (!our_f) self.fissures[key] = f;
        if (their_other && !our_other) self.fissures[other_key] = their_other;

        if (!their_other && !our_other && f.b == self.id) {
          if (self.conns[f.conn]) delete self.conns[f.conn];
          our_other = self.fissures[other_key] = {
            ...f,
            a: f.b,
            b: f.a,
            t: self.conn_count,
          };
        }

        if (!their_other && our_other) {
          fissures_back.push(f);
          fissures_back.push(our_other);
        }

        if (!our_f || (their_other && !our_other)) {
          fissures_forward.push(f);
          if (their_other || our_other)
            fissures_forward.push(their_other || our_other);
        }
      }
    }

    /// ## message `welcome`
    /// Sent in response to a `get`, basically contains the initial state of the document; incoming `welcome` messages are also propagated over all our other connections but only with information that was new to us, so the propagation will eventually stop. When sent in response to a `get` (rather than being propagated), we include a `peer` entry with the id of the sending peer, so they know who we are, and to trigger them to send us their own  `welcome` message.
    ///
    /// ``` js
    /// {
    ///   cmd: 'welcome',
    ///   versions: [
    ///     //each version looks like a set message...
    ///   ],
    ///   fissures: [
    ///     //each fissure looks as it would in a fissure message...
    ///   ],
    ///   parents: 
    ///     {
    ///       //versions you must have before consuming these new versions
    ///       'PARENT_VERSION_ID': true,
    ///       ...
    ///     },
    ///   [peer: 'SENDER_ID'], // if responding to a get
    ///   conn: 'CONN_ID'
    /// } 
    /// ```
    let _T = {};
    let added_versions = [];
    if (cmd == "welcome") {
      let versions_to_add = {};
      let vs = Object.values(versions);
      vs.forEach((v) => (versions_to_add[v.version] = v.parents));
      vs.forEach((v) => {
        if (
          self.T[v.version] ||
          (self.version_groups[v.version] &&
            self.version_groups[v.version][0] != v.version)
        ) {
          remove_ancestors(v.version);
          function remove_ancestors(v) {
            if (versions_to_add[v]) {
              Object.keys(versions_to_add[v]).forEach(remove_ancestors);
              delete versions_to_add[v];
            }
          }
        }
      });

      for (let v of vs) _T[v.version] = v.parents;

      l1: for (let v of vs) {
        if (versions_to_add[v.version]) {
          let ps = Object.keys(v.parents);

          if (!ps.length && Object.keys(self.T).length) continue;
          for (p of ps) if (!self.T[p]) continue l1;

          rebased_patches = rebased_patches.concat(
            self.add_version(v.version, v.parents, v.patches, v.sort_keys)
          );

          added_versions.push(v);
          delete _T[v.version];
        }
      }
    }

    if (cmd == "get" || (cmd == "welcome" && peer != null)) {
      let fissures_back = Object.values(self.fissures);

      if (cmd == "welcome") {
        let leaves = { ..._T };
        Object.keys(_T).forEach((v) => {
          Object.keys(_T[v]).forEach((p) => delete leaves[p]);
        });

        let f = {
          a: self.id,
          b: peer,
          conn: "-" + conn,
          versions: Object.fromEntries(
            added_versions
              .concat(Object.keys(leaves).map((v) => versions[v]))
              .map((v) => [v.version, true])
          ),
          time: get_time(),
          t: self.conn_count,
        };
        if (Object.keys(f.versions).length) {
          let key = f.a + ":" + f.b + ":" + f.conn;
          self.fissures[key] = f;
          fissures_back.push(f);
          fissures_forward.push(f);
        }
      }

      send({
        cmd: "welcome",
        versions: self.generate_braid(parents || versions),
        fissures: copy_fissures(fissures_back),
        parents:
          parents &&
          Object.keys(parents).length &&
          self.get_leaves(self.ancestors(parents, true)),
        ...(cmd == "get" ? { peer: self.id } : {}),
        conn,
      });
    } else if (fissures_back.length) {
      send({
        cmd: "fissure",
        fissures: copy_fissures(fissures_back),
        conn,
      });
    }

    /// ## message `forget`
    /// Used to disconnect without creating a fissure, presumably meaning the sending peer doesn't plan to make any edits while they're disconnected.
    /// ``` js
    /// {cmd: 'forget', conn: 'CONN_ID'}
    /// ```
    if (cmd == "forget") {
      if (self.conns[conn] == null) throw Error("bad");
      send({ cmd: "ack", forget: true, conn });

      delete self.conns[conn];
      delete self.proto_conns[conn];
    }

    /// ## message forget `ack` 
    /// Sent in response to `forget`.. so they know we forgot them.
    /// ``` js
    /// {cmd: 'ack', forget: true, conn: 'CONN_ID'}
    /// ```
    if (cmd == "ack" && forget) {
      self.forget_cbs[conn]();
    }

    /// ## message `set`
    /// Sent to alert peers about a change in the document. The change is represented as a version, with a unique id, a set of parent versions (the most recent versions known before adding this version), and an array of patches, where the offsets in the patches do not take into account the application of other patches in the same array.
    /// ``` js
    /// { cmd: 'set',
    ///   version: 'VERSION_ID',
    ///   parents: {'PARENT_VERSION_ID': true, ...},
    ///   patches: [ {range: '.json.path.a.b', content: 42}, ... ],
    ///   conn: 'CONN_ID' }
    /// ```
    if (cmd == "set") {
      if (conn == null || !self.T[version]) {
        let ps = Object.keys(parents);

        if (!ps.length && Object.keys(self.T).length) return;
        for (p of ps) if (!self.T[p]) return;

        rebased_patches = self.add_version(version, parents, patches);

        for (let c of Object.keys(self.conns))
          if (c != conn)
            send({ cmd: "set", version, parents, patches, marco, conn: c });
      }
    }

    /// ## message `marco`
    /// Sent for pruning purposes, to try and establish whether everyone has seen the most recent versions. Note that a `set` message is treated as a `marco` message for the version being set.
    /// ``` js
    /// { cmd: 'marco',
    ///   version: 'MARCO_ID',
    ///   versions: {'VERSION_ID_A': true, ...},
    ///   conn: 'CONN_ID' }
    /// ```
    if (cmd == "marco" || cmd == "set") {
      if (!Object.keys(versions).every((v) => self.T[v])) return;

      if (
        self.marco_timeout &&
        marco_versions_array.length ==
        Object.keys(self.current_version).length &&
        marco_versions_array.every((x) => self.current_version[x])
      ) {
        clear_timeout(self.marco_timeout);
        self.marco_timeout = null;
      }

      let m = self.marcos[marco];
      if (!m) {
        m = self.marcos[marco] = {
          id: marco,
          origin: conn,
          count: Object.keys(self.conns).length - (conn != null ? 1 : 0),
          versions: marco_versions,
          seq: self.conn_count,
          time: get_time(),
        };
        m.orig_count = m.count;
        m.real_marco = cmd == "marco";
        m.key = JSON.stringify(Object.keys(m.versions).sort());
        self.marco_map[m.key] = self.marco_map[m.key] || {};
        let before = Object.keys(self.marco_map[m.key]).length;
        self.marco_map[m.key][m.id] = true;
        let after = Object.keys(self.marco_map[m.key]).length;
        if (before == 1 && after == 2 && self.marco_increases_allowed > 0) {
          self.marco_current_wait_time *= 2;
          self.marco_increases_allowed--;
        }

        if (cmd == "marco")
          for (let c of Object.keys(self.conns))
            if (c != conn)
              send({
                cmd: "marco",
                marco,
                versions: marco_versions,
                conn: c,
              });
      } else if (m.seq < self.conns[conn].seq) {
        send({
          cmd: "ack",
          seen: "local",
          marco,
          versions: marco_versions,
          conn,
        });
        return;
      } else m.count--;
      check_marco_count(marco);
    }

    /// ## message local `ack`
    /// Sent in response to `set`, but not right away; a peer will first send the `set` over all its other connections, and only after they have all responded with a local `ack` – and we didn't see a `fissure` message while waiting – will the peer send a local `ack` over the originating connection.
    /// ``` js
    /// {cmd: 'ack', seen: 'local', version: 'VERSION_ID', conn: 'CONN_ID'}
    /// ```
    if (cmd == "ack" && seen == "local") {
      let m = self.marcos[marco];
      if (!m || m.cancelled) return;
      m.count--;
      check_marco_count(marco);
    }
    function check_marco_count(marco) {
      let m = self.marcos[marco];
      if (m && m.count === 0 && !m.cancelled) {
        m.time2 = get_time();
        if (m.orig_count > 0) {
          let t = m.time2 - m.time;
          let weight = 0.1;
          self.marco_time_est_1 =
            weight * t + (1 - weight) * self.marco_time_est_1;
        }
        if (m.origin != null) {
          if (self.conns[m.origin])
            send({
              cmd: "ack",
              seen: "local",
              marco,
              versions: marco_versions,
              conn: m.origin,
            });
        } else add_full_ack_leaves(marco);
      }
    }

    /// ## message global `ack`
    /// Sent after an originating peer has received a local `ack` over all its connections, or after any peer receives a global `ack`, so that everyone may come to know that this version has been seen by everyone in this peer group.
    /// ``` js
    /// {cmd: 'ack', seen: 'global', version: 'VERSION_ID', conn: 'CONN_ID'}
    /// ```
    if (cmd == "ack" && seen == "global") {
      let m = self.marcos[marco];

      if (!m || m.cancelled) return;

      let t = get_time() - m.time2;
      let weight = 0.1;
      self.marco_time_est_2 =
        weight * t + (1 - weight) * self.marco_time_est_2;

      if (m.real_marco && Object.keys(self.marco_map[m.key]).length == 1) {
        self.marco_current_wait_time *= 0.8;
      }

      add_full_ack_leaves(marco, conn);
    }
    function add_full_ack_leaves(marco, conn) {
      let m = self.marcos[marco];
      if (!m || m.cancelled) return;
      m.cancelled = true;

      for (let [c, cc] of Object.entries(self.conns))
        if (c != conn && cc.seq <= m.seq)
          send({
            cmd: "ack",
            seen: "global",
            marco,
            versions: marco_versions,
            conn: c,
          });

      for (let v of Object.keys(m.versions)) {
        if (!self.T[v]) continue;
        let marks = {};
        let f = (v) => {
          if (!marks[v]) {
            marks[v] = true;
            delete self.acked_boundary[v];
            Object.keys(self.T[v]).forEach(f);
          }
        };
        f(v);
        self.acked_boundary[v] = true;
      }
      prune(false, m.seq);
    }

    if (added_versions.length || fissures_forward.length) {
      for (let c of Object.keys(self.conns))
        if (c != conn)
          send({
            cmd: added_versions.length ? "welcome" : "fissure",
            ...(added_versions.length ? { versions: added_versions } : {}),
            fissures: copy_fissures(fissures_forward),
            conn: c,
          });
    }

    if (fissures_forward.length) resolve_fissures();

    if (
      !self.marco_timeout &&
      cmd != "set" &&
      cmd != "marco" &&
      prune(true)
    ) {
      if (!self.marco_current_wait_time) {
        self.marco_current_wait_time =
          4 * (self.marco_time_est_1 + self.marco_time_est_2);
      }

      let t = Math.random() * self.marco_current_wait_time;

      self.marco_timeout = set_timeout(() => {
        self.marco_increases_allowed = 1;
        self.marco_timeout = null;
        if (prune(true)) self.marco();
      }, t);
    }

    if (cmd == "welcome" && peer == null && prune(true, null, true))
      self.marco();

    return rebased_patches;
  };

  /// # antimatter_crdt.get(conn) or connect(conn)
  ///
  /// Register a new connection with id `conn` – triggers this antimatter_crdt object to send a `get` message over the given connection. 
  ///
  /// ``` js
  /// alice_antimatter_crdt.get('connection_to_bob')
  /// ```
  self.get = (conn) => {
    self.proto_conns[conn] = true;
    send({ cmd: "get", peer: self.id, conn });
  };
  self.connect = self.get;

  /// # antimatter_crdt.forget(conn)
  ///
  /// Disconnect the given connection without creating a fissure – we don't need to reconnect with them.. it seems.. if we do, then we need to call `disconnect` instead, which will create a fissure allowing us to reconnect.
  ///
  /// ``` js
  /// alice_antimatter_crdt.forget('connection_to_bob')
  /// ```
  self.forget = async (conn) => {
    await new Promise((done) => {
      if (self.conns[conn] != null) {
        self.forget_cbs[conn] = done;
        send({ cmd: "forget", conn });
      }
      self.disconnect(conn, false);
    });
  };

  /// # antimatter_crdt.disconnect(conn)
  ///
  /// If we detect that a connection has closed, let the antimatter_crdt object know by calling this method with the given connection id – this will create a fissure so we can reconnect with whoever was on the other end of the connection later on. 
  ///
  /// ``` js
  /// alice_antimatter_crdt.disconnect('connection_to_bob')
  /// ```
  self.disconnect = (conn, fissure = true) => {
    if (self.conns[conn] == null && !self.proto_conns[conn]) return;
    delete self.proto_conns[conn];

    if (self.conns[conn]) {
      let peer = self.conns[conn].peer;
      delete self.conns[conn];

      if (fissure) {
        fissure = create_fissure(peer, conn);
        if (fissure) self.receive({ cmd: "fissure", fissure });
      }
    }
  };

  /// # antimatter_crdt.set(...patches)
  ///
  /// Modify this antimatter_crdt object by applying the given patches. Each patch looks like `{range: '.life.meaning', content: 42}`. Calling this method will trigger calling the `send` callback to let our peers know about this change. 
  ///
  /// ``` js
  /// antimatter_crdt.set({
  ///   range: '.life.meaning',
  ///   content: 42
  /// })
  /// ```
  self.set = (...patches) => {
    let version = `${self.next_seq++}@${self.id}`;
    self.receive({
      cmd: "set",
      version,
      parents: { ...self.current_version },
      patches,
      marco: Math.random().toString(36).slice(2),
    });
    return version;
  };

  /// # antimatter_crdt.marco()
  ///
  /// Initiate sending a `marco` message to try and establish whether certain versions can be pruned. 
  ///
  /// ``` js
  /// antimatter_crdt.marco()
  /// ```
  self.marco = () => {
    let versions = { ...self.current_version };
    Object.keys(versions).forEach((v) =>
      self.version_groups[v] && self.version_groups[v].forEach((v) => (versions[v] = true))
    );

    let marco = Math.random().toString(36).slice(2);
    self.receive({ cmd: "marco", marco, versions });
    return marco;
  };

  function cancel_marcos() {
    for (let m of Object.values(self.marcos)) m.cancelled = true;
  }

  function create_fissure(peer, conn) {
    let ack_versions = self.ancestors(self.acked_boundary);

    let entries = Object.keys(self.T)
      .filter((v) => !ack_versions[v] || self.acked_boundary[v])
      .map((v) => [v, true]);
    if (!entries.length) return;
    let versions = Object.fromEntries(entries);
    return { a: self.id, b: peer, conn, versions, time: get_time() };
  }

  function resolve_fissures() {
    let unfissured = {};

    Object.entries(self.fissures).forEach(([fk, f]) => {
      let other_key = f.b + ":" + f.a + ":" + f.conn;
      let other = self.fissures[other_key];
      if (other) {
        if (Object.keys(f.versions).length) {
          for (let v of Object.keys(f.versions)) unfissured[v] = true;
          self.fissures[fk] = { ...f, versions: {} };
        }
        if (Object.keys(other.versions).length) {
          for (let v of Object.keys(other.versions)) unfissured[v] = true;
          self.fissures[other_key] = { ...other, versions: {} };
        }
      }
    });

    if (Object.keys(unfissured).length) {
      cancel_marcos();

      let ack_versions = self.ancestors(self.acked_boundary);
      let unfissured_descendants = self.descendants(unfissured, true);
      for (let un of Object.keys(unfissured_descendants))
        if (ack_versions[un]) delete ack_versions[un];
      self.acked_boundary = self.get_leaves(ack_versions);
    }
  }

  function prune(just_checking, t, just_versions) {
    if (just_checking) t = Infinity;

    let fissures = just_checking ? { ...self.fissures } : self.fissures;

    Object.entries(fissures).forEach((x) => {
      let other_key = x[1].b + ":" + x[1].a + ":" + x[1].conn;
      let other = fissures[other_key];
      if (other && x[1].t <= t && other.t <= t) {
        delete fissures[x[0]];
        delete fissures[other_key];
      }
    });

    if (self.fissure_lifetime != null) {
      let now = get_time();
      Object.entries(fissures).forEach(([k, f]) => {
        if (f.time == null) f.time = now;
        if (f.time <= now - self.fissure_lifetime) {
          delete fissures[k];
        }
      });
    }

    if (
      just_checking &&
      !just_versions &&
      Object.keys(fissures).length < Object.keys(self.fissures).length
    )
      return true;

    let restricted = {};

    Object.values(fissures).forEach((f) => {
      Object.keys(f.versions).forEach((v) => (restricted[v] = true));
    });

    if (!just_checking) {
      let acked = self.ancestors(self.acked_boundary);
      Object.keys(self.T).forEach((x) => {
        if (!acked[x]) restricted[x] = true;
      });
    }

    let children = self.get_child_map();
    let { parent_sets, child_sets } = get_parent_and_child_sets(children);

    let to_bubble = {};
    function mark_bubble(v, bubble) {
      if (to_bubble[v]) return;
      to_bubble[v] = bubble;
      for (let vv of Object.keys(self.T[v])) mark_bubble(vv, bubble);
    }
    let visited = {};
    function f(cur) {
      if (!self.T[cur] || visited[cur]) return;
      visited[cur] = true;

      if (
        to_bubble[cur] == null &&
        parent_sets[cur] &&
        !parent_sets[cur].done
      ) {
        parent_sets[cur].done = true;
        let bottom = parent_sets[cur].members;
        let top = find_one_bubble(bottom, children, child_sets, restricted);
        if (top) {
          if (just_checking) return true;
          let bottom_array = Object.keys(bottom).sort();
          let top_array = Object.keys(top);
          raw_add_version_group(bottom_array);
          let bubble = [bottom_array[0], top_array[0]];
          for (let v of top_array) to_bubble[v] = bubble;
          for (let v of bottom_array) mark_bubble(v, bubble);
        }
      }
      if (to_bubble[cur] == null) {
        let top = find_one_bubble(
          { [cur]: true },
          children,
          child_sets,
          restricted
        );
        if (top && !top[cur]) {
          if (just_checking) return true;
          let bubble = [cur, Object.keys(top)[0]];
          for (let v of Object.keys(top)) to_bubble[v] = bubble;
          mark_bubble(bubble[0], bubble);
        } else {
          to_bubble[cur] = [cur, cur];
        }
      }
      return Object.keys(
        self.T[cur] || self.T[self.version_groups[cur][0]]
      ).some(f);
    }
    if (Object.keys(self.current_version).some(f) && just_checking)
      return true;

    self.apply_bubbles(to_bubble);

    for (let [k, m] of Object.entries(self.marcos)) {
      let vs = Object.keys(m.versions);
      if (
        !vs.length ||
        !vs.every((v) => self.T[v] || self.version_groups[v])
      ) {
        delete self.marcos[k];
        delete self.marco_map[m.key][m.id];
        if (!Object.keys(self.marco_map[m.key]).length)
          delete self.marco_map[m.key];
      }
    }

    for (let [v, vs] of Object.entries(self.version_groups)) {
      if (!self.T[vs[0]]) delete self.version_groups[v];
    }
  }

  return self;
};
