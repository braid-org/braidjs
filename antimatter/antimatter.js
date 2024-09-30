/// # Software Architecture
/// The software is architected into three objects:
///
/// ``` js
/// var {create_antimatter_crdt, create_json_crdt, sequence_crdt} = require('@braidjs/antimatter') 
/// ```

// v522

/// - *antimatter_crdt*: created using `create_antimatter_crdt`, this object is a json_crdt with antimatter algorithm methods added to it so that it can communicate with other peers to learn which history can be pruned, and tells the underlying json_crdt object to prune it.
var create_antimatter_crdt;

/// - *json_crdt*: created using `create_json_crdt`, this object is a pruneable
///   JSON CRDT — "JSON" meaning it represents an arbitrary JSON datstructure, and
///   "CRDT" and "pruneable" having the same meaning as for sequence_crdt below. The
///   json_crdt makes recursive use of sequence_crdt structures to represent
///   arbitrary JSON (for instance, a map is represented with a sequence_crdt
///   structure for each value, where the first element in the sequence is the
///   value).
var create_json_crdt;

/// - *sequence_crdt*: methods to manipulate a pruneable sequence CRDT —
///   "sequence" meaning it represents a javascript string or array, "CRDT" meaning
///   this structure can be merged with other ones, and "pruneable" meaning that it
///   supports an operation to remove meta-data when it is no longer needed (whereas
///   CRDT's often keep track of this meta-data forever).
var sequence_crdt = {};

(() => {
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
  /// var antimatter_crdt = create_antimatter_crdt(msg => {
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
        var versions_to_add = {};
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

        l1: for (var v of vs) {
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
          var leaves = { ..._T };
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
      var version = `${self.next_seq++}@${self.id}`;
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
        var other_key = f.b + ":" + f.a + ":" + f.conn;
        var other = self.fissures[other_key];
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
        var other_key = x[1].b + ":" + x[1].a + ":" + x[1].conn;
        var other = fissures[other_key];
        if (other && x[1].t <= t && other.t <= t) {
          delete fissures[x[0]];
          delete fissures[other_key];
        }
      });

      if (self.fissure_lifetime != null) {
        var now = get_time();
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

      var restricted = {};

      Object.values(fissures).forEach((f) => {
        Object.keys(f.versions).forEach((v) => (restricted[v] = true));
      });

      if (!just_checking) {
        var acked = self.ancestors(self.acked_boundary);
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

  /// ## create_json_crdt([init])
  ///
  /// Create a new `json_crdt` object (or start with `init`, and add stuff to that). 
  ///
  /// ``` js
  /// var json_crdt = create_json_crdt()
  /// ``` 
  create_json_crdt = (self) => {
    self = self || {};
    self.S = self.S || null;
    self.T = self.T || {};
    self.root_version = null;
    self.current_version = self.current_version || {};
    self.version_cache = self.version_cache || {};

    let is_lit = (x) => !x || typeof x != "object" || x.t == "lit";
    let get_lit = (x) => (x && typeof x == "object" && x.t == "lit" ? x.S : x);
    let make_lit = (x) => (x && typeof x == "object" ? { t: "lit", S: x } : x);
    self = self || {};

    /// # json_crdt.read()
    ///
    /// Returns an instance of the `json` object represented by this json_crdt data-structure. 
    ///
    /// ``` js
    /// console.log(json_crdt.read())
    /// ```
    self.read = (is_anc) => {
      if (!is_anc) is_anc = () => true;

      return raw_read(self.S, is_anc);
    };

    function raw_read(x, is_anc) {
      if (x && typeof x == "object") {
        if (x.t == "lit") return JSON.parse(JSON.stringify(x.S));
        if (x.t == "val")
          return raw_read(sequence_crdt.get(x.S, 0, is_anc), is_anc);
        if (x.t == "obj") {
          var o = {};
          Object.entries(x.S).forEach(([k, v]) => {
            var x = raw_read(v, is_anc);
            if (x != null) o[k] = x;
          });
          return o;
        }
        if (x.t == "arr") {
          var a = [];
          sequence_crdt.traverse(
            x.S,
            is_anc,
            (node, _, __, ___, ____, deleted) => {
              if (!deleted)
                node.elems.forEach((e) => a.push(raw_read(e, is_anc)));
            },
            true
          );
          return a;
        }
        if (x.t == "str") {
          var s = [];
          sequence_crdt.traverse(
            x.S,
            is_anc,
            (node, _, __, ___, ____, deleted) => {
              if (!deleted) s.push(node.elems);
            },
            true
          );
          return s.join("");
        }
        throw Error("bad");
      }
      return x;
    }

    /// # json_crdt.generate_braid(versions)
    ///
    /// Returns an array of `set` messages that each look like this: `{version, parents, patches, sort_keys}`, such that if we pass all these messages to `antimatter_crdt.receive()`, we'll reconstruct the data in this `json_crdt` data-structure, assuming the recipient already has the given `versions` (each version is represented as an object with a version, and each value is `true`).
    ///
    /// ``` js
    /// json_crdt.generate_braid({
    ///   alice2: true, 
    ///   bob3: true
    /// })
    /// ```
    self.generate_braid = (versions) => {
      var anc =
        versions && Object.keys(versions).length
          ? self.ancestors(versions, true)
          : {};
      var is_anc = (x) => anc[x];

      if (Object.keys(self.T).length === 0) return [];

      return Object.entries(self.version_cache)
        .filter((x) => !is_anc(x[0]))
        .map(([version, set_message]) => {
          return (self.version_cache[version] =
            set_message || generate_set_message(version));
        });

      function generate_set_message(version) {
        if (!Object.keys(self.T[version]).length) {
          return {
            version,
            parents: {},
            patches: [{ range: "", content: self.read((v) => v == version) }],
          };
        }

        var is_lit = (x) => !x || typeof x !== "object" || x.t === "lit";
        var get_lit = (x) =>
          x && typeof x === "object" && x.t === "lit" ? x.S : x;

        var ancs = self.ancestors({ [version]: true });
        delete ancs[version];
        var is_anc = (x) => ancs[x];
        var path = [];
        var patches = [];
        var sort_keys = {};
        recurse(self.S);
        function recurse(x) {
          if (is_lit(x)) {
          } else if (x.t === "val") {
            sequence_crdt
              .generate_braid(x.S, version, is_anc, raw_read)
              .forEach((s) => {
                if (s[2].length) {
                  patches.push({ range: path.join(""), content: s[2][0] });
                  if (s[3]) sort_keys[patches.length - 1] = s[3];
                }
              });
            sequence_crdt.traverse(x.S, is_anc, (node) => {
              node.elems.forEach(recurse);
            });
          } else if (x.t === "arr") {
            sequence_crdt.generate_braid(x.S, version, is_anc).forEach((s) => {
              patches.push({
                range: `${path.join("")}[${s[0]}:${s[0] + s[1]}]`,
                content: s[2],
              });
              if (s[3]) sort_keys[patches.length - 1] = s[3];
            });
            var i = 0;
            sequence_crdt.traverse(x.S, is_anc, (node) => {
              node.elems.forEach((e) => {
                path.push(`[${i++}]`);
                recurse(e);
                path.pop();
              });
            });
          } else if (x.t === "obj") {
            Object.entries(x.S).forEach((e) => {
              path.push("[" + JSON.stringify(e[0]) + "]");
              recurse(e[1]);
              path.pop();
            });
          } else if (x.t === "str") {
            sequence_crdt.generate_braid(x.S, version, is_anc).forEach((s) => {
              patches.push({
                range: `${path.join("")}[${s[0]}:${s[0] + s[1]}]`,
                content: s[2],
              });
              if (s[3]) sort_keys[patches.length - 1] = s[3];
            });
          }
        }

        return {
          version,
          parents: { ...self.T[version] },
          patches,
          sort_keys,
        };
      }
    };

    /// # json_crdt.apply_bubbles(to_bubble)
    ///
    /// This method helps prune away meta data and compress stuff when we have determined that certain versions can be renamed to other versions – these renamings are expressed in `to_bubble`, where keys are versions and values are "bubbles", each bubble is represented with an array of two elements, the first element is the "bottom" of the bubble, and the second element is the "top" of the bubble. We will use the "bottom" as the new name for the version, and we'll use the "top" as the new parents.
    ///
    /// ``` js 
    /// json_crdt.apply_bubbles({
    ///   alice4: ['bob5', 'alice4'], 
    ///   bob5: ['bob5', 'alice4']
    /// }) 
    /// ```
    self.apply_bubbles = (to_bubble) => {
      function recurse(x) {
        if (is_lit(x)) return x;
        if (x.t == "val") {
          sequence_crdt.apply_bubbles(x.S, to_bubble);
          sequence_crdt.traverse(
            x.S,
            () => true,
            (node) => {
              node.elems = node.elems.slice(0, 1).map(recurse);
            },
            true
          );
          if (
            x.S.nexts.length == 0 &&
            !x.S.next &&
            x.S.elems.length == 1 &&
            is_lit(x.S.elems[0])
          )
            return x.S.elems[0];
          return x;
        }
        if (x.t == "arr") {
          sequence_crdt.apply_bubbles(x.S, to_bubble);
          sequence_crdt.traverse(
            x.S,
            () => true,
            (node) => {
              node.elems = node.elems.map(recurse);
            },
            true
          );
          if (
            x.S.nexts.length == 0 &&
            !x.S.next &&
            x.S.elems.every(is_lit) &&
            !Object.keys(x.S.deleted_by).length
          )
            return { t: "lit", S: x.S.elems.map(get_lit) };
          return x;
        }
        if (x.t == "obj") {
          Object.entries(x.S).forEach((e) => {
            var y = (x.S[e[0]] = recurse(e[1]));
            if (y == null) delete x.S[e[0]];
          });
          if (Object.values(x.S).every(is_lit)) {
            var o = {};
            Object.entries(x.S).forEach((e) => (o[e[0]] = get_lit(e[1])));
            return { t: "lit", S: o };
          }
          return x;
        }
        if (x.t == "str") {
          sequence_crdt.apply_bubbles(x.S, to_bubble);
          if (
            x.S.nexts.length == 0 &&
            !x.S.next &&
            !Object.keys(x.S.deleted_by).length
          )
            return x.S.elems;
          return x;
        }
      }
      self.S = recurse(self.S);

      Object.entries(to_bubble).forEach(([version, bubble]) => {
        if (!self.T[version]) return;

        self.my_where_are_they_now[version] = bubble[0];

        if (version === bubble[1]) self.T[bubble[0]] = self.T[bubble[1]];

        if (version !== bubble[0]) {
          if (self.root_version == version) self.root_version = bubble[0];
          delete self.T[version];
          delete self.version_cache[version];
          delete self.acked_boundary[version];
          delete self.current_version[version];
          if (
            self.version_groups[version] &&
            self.version_groups[version][0] == version
          ) {
            for (let v of self.version_groups[version]) {
              delete self.version_groups[v];
            }
          }
          for (let [k, parents] of Object.entries(self.T)) {
            self.T[k] = parents = { ...parents };
            for (let p of Object.keys(parents)) {
              if (p == version) delete parents[p];
            }
          }
        } else self.version_cache[version] = null;
      });

      var leaves = Object.keys(self.current_version);
      var acked_boundary = Object.keys(self.acked_boundary);
      var fiss = Object.keys(self.fissures);
      if (
        leaves.length == 1 &&
        acked_boundary.length == 1 &&
        leaves[0] == acked_boundary[0] &&
        fiss.length == 0
      ) {
        self.T = { [leaves[0]]: {} };
        self.S = make_lit(self.read());
      }
    };

    /// # json_crdt.add_version(version, parents, patches[, sort_keys])
    ///
    /// The main method for modifying a `json_crdt` data structure. 
    ///
    /// * `version`: Unique string associated with this edit. 
    /// * `parents`: A set of versions that this version is aware of, represented as a map with versions as keys, and values of `true`. 
    /// * `patches`: An array of patches, each patch looks like this `{range: '.life.meaning', content: 42}`. 
    /// * `sort_keys`: (optional) An object where each key is an index, and the value is a sort_key to use with the patch at the given index in the `patches` array – a sort_key overrides the version for a patch for the purposes of sorting. This can be useful after doing some pruning. 
    ///
    /// ``` js
    /// json_crdt.add_version(
    ///   'alice6', 
    ///   {
    ///     alice5: true, 
    ///     bob7: true
    ///   }, 
    ///   [
    ///     {
    ///       range: '.a.b', 
    ///       content: 'c'
    ///     }
    ///   ]
    /// )
    /// ``` 
    self.add_version = (version, parents, patches, sort_keys) => {
      if (self.T[version]) return;

      if (self.root_version == null) self.root_version = version;

      self.T[version] = { ...parents };

      self.version_cache[version] = JSON.parse(
        JSON.stringify({
          version,
          parents,
          patches,
          sort_keys,
        })
      );

      Object.keys(parents).forEach((k) => {
        if (self.current_version[k]) delete self.current_version[k];
      });
      self.current_version[version] = true;

      if (!sort_keys) sort_keys = {};

      if (!Object.keys(parents).length) {
        var parse = self.parse_patch(patches[0]);
        self.S = make_lit(parse.value);
        return patches;
      }

      let is_anc;
      if (parents == self.current_version) {
        is_anc = (_version) => _version != version;
      } else {
        let ancs = self.ancestors(parents);
        is_anc = (_version) => ancs[_version];
      }

      var rebased_patches = [];
      patches.forEach((patch, i) => {
        var sort_key = sort_keys[i];
        var parse = self.parse_patch(patch);
        var cur = resolve_path(parse);
        if (!parse.slice) {
          if (cur.t != "val") throw Error("bad");
          var len = sequence_crdt.length(cur.S, is_anc);
          sequence_crdt.add_version(
            cur.S,
            version,
            [[0, len, [parse.delete ? null : make_lit(parse.value)], sort_key]],
            is_anc
          );
          rebased_patches.push(patch);
        } else {
          if (typeof parse.value === "string" && cur.t !== "str")
            throw Error(
              `Cannot splice string ${JSON.stringify(
                parse.value
              )} into non-string`
            );
          if (parse.value instanceof Array && cur.t !== "arr")
            throw Error(
              `Cannot splice array ${JSON.stringify(
                parse.value
              )} into non-array`
            );
          if (parse.value instanceof Array)
            parse.value = parse.value.map((x) => make_lit(x));

          var r0 = parse.slice[0];
          var r1 = parse.slice[1];
          if (r0 < 0 || Object.is(r0, -0) || r1 < 0 || Object.is(r1, -0)) {
            let len = sequence_crdt.length(cur.S, is_anc);
            if (r0 < 0 || Object.is(r0, -0)) r0 = len + r0;
            if (r1 < 0 || Object.is(r1, -0)) r1 = len + r1;
          }

          var rebased_splices = sequence_crdt.add_version(
            cur.S,
            version,
            [[r0, r1 - r0, parse.value, sort_key]],
            is_anc
          );
          for (let rebased_splice of rebased_splices)
            rebased_patches.push({
              range: `${parse.path
                .map((x) => `[${JSON.stringify(x)}]`)
                .join("")}[${rebased_splice[0]}:${
                rebased_splice[0] + rebased_splice[1]
              }]`,
              content: rebased_splice[2],
            });
        }
      });

      function resolve_path(parse) {
        var cur = self.S;
        if (!cur || typeof cur != "object" || cur.t == "lit")
          cur = self.S = {
            t: "val",
            S: sequence_crdt.create_node(self.root_version, [cur]),
          };
        var prev_S = null;
        var prev_i = 0;
        for (var i = 0; i < parse.path.length; i++) {
          var key = parse.path[i];
          if (cur.t == "val")
            cur = sequence_crdt.get((prev_S = cur.S), (prev_i = 0), is_anc);
          if (cur.t == "lit") {
            var new_cur = {};
            if (cur.S instanceof Array) {
              new_cur.t = "arr";
              new_cur.S = sequence_crdt.create_node(
                self.root_version,
                cur.S.map((x) => make_lit(x))
              );
            } else {
              if (typeof cur.S != "object") throw Error("bad");
              new_cur.t = "obj";
              new_cur.S = {};
              Object.entries(cur.S).forEach(
                (e) => (new_cur.S[e[0]] = make_lit(e[1]))
              );
            }
            cur = new_cur;
            sequence_crdt.set(prev_S, prev_i, cur, is_anc);
          }
          if (cur.t == "obj") {
            let x = cur.S[key];
            if (!x || typeof x != "object" || x.t == "lit")
              x = cur.S[key] = {
                t: "val",
                S: sequence_crdt.create_node(self.root_version, [
                  x == null ? null : x,
                ]),
              };
            cur = x;
          } else if (i == parse.path.length - 1 && !parse.slice) {
            parse.slice = [key, key + 1];
            parse.value = cur.t == "str" ? parse.value : [parse.value];
          } else if (cur.t == "arr") {
            cur = sequence_crdt.get((prev_S = cur.S), (prev_i = key), is_anc);
          } else throw Error("bad");
        }
        if (parse.slice) {
          if (cur.t == "val")
            cur = sequence_crdt.get((prev_S = cur.S), (prev_i = 0), is_anc);
          if (typeof cur == "string") {
            cur = {
              t: "str",
              S: sequence_crdt.create_node(self.root_version, cur),
            };
            sequence_crdt.set(prev_S, prev_i, cur, is_anc);
          } else if (cur.t == "lit") {
            if (!(cur.S instanceof Array)) throw Error("bad");
            cur = {
              t: "arr",
              S: sequence_crdt.create_node(
                self.root_version,
                cur.S.map((x) => make_lit(x))
              ),
            };
            sequence_crdt.set(prev_S, prev_i, cur, is_anc);
          }
        }
        return cur;
      }

      return rebased_patches;
    };

    /// # json_crdt.get_child_map()
    ///
    /// Returns a map where each key is a version, and each value is a set of child versions, represented as a map with versions as keys, and values of `true`.
    ///
    /// ``` js
    /// json_crdt.get_child_map()
    /// ``` 
    self.get_child_map = () => {
      let children = {};
      Object.entries(self.T).forEach(([v, parents]) => {
        Object.keys(parents).forEach((parent) => {
          if (!children[parent]) children[parent] = {};
          children[parent][v] = true;
        });
      });
      return children;
    };

    /// # json_crdt.ancestors(versions, ignore_nonexistent=false)
    ///
    /// Gather `versions` and all their ancestors into a set. `versions` is a set of versions, i.e. a map with version-keys and values of true – we'll basically return a larger set. If `ignore_nonexistent` is `true`, then we won't throw an exception if we encounter a version that we don't have in our data-structure.
    ///
    /// ``` js
    /// json_crdt.ancestors({
    ///   alice12: true, 
    ///   bob10: true
    /// }) 
    /// ``` 
    self.ancestors = (versions, ignore_nonexistent) => {
      var result = {};
      function recurse(version) {
        if (result[version]) return;
        if (!self.T[version]) {
          if (ignore_nonexistent) return;
          throw Error(`The version ${version} no existo`);
        }
        result[version] = true;
        Object.keys(self.T[version]).forEach(recurse);
      }
      Object.keys(versions).forEach(recurse);
      return result;
    };

    /// # json_crdt.descendants(versions, ignore_nonexistent=false)
    ///
    /// Gather `versions` and all their descendants into a set. `versions` is a set of versions, i.e. a map with version-keys and values of true – we'll basically return a larger set. If `ignore_nonexistent` is `true`, then we won't throw an exception if we encounter a version that we don't have in our data-structure.
    ///
    /// ``` js
    /// json_crdt.descendants({
    ///   alice12: true, 
    ///   bob10: true
    /// }) 
    /// ``` 
    self.descendants = (versions, ignore_nonexistent) => {
      let children = self.get_child_map();
      var result = {};
      function recurse(version) {
        if (result[version]) return;
        if (!self.T[version]) {
          if (ignore_nonexistent) return;
          throw Error(`The version ${version} no existo`);
        }
        result[version] = true;
        Object.keys(children[version] || {}).forEach(recurse);
      }
      Object.keys(versions).forEach(recurse);
      return result;
    };

    /// # json_crdt.get_leaves(versions)
    ///
    /// Returns a set of versions from `versions` which don't also have a child in `versions`. `versions` is itself a set of versions, represented as an object with version keys and `true` values, and the return value is represented the same way.
    self.get_leaves = (versions) => {
      var leaves = { ...versions };
      Object.keys(versions).forEach((v) => {
        Object.keys(self.T[v]).forEach((p) => delete leaves[p]);
      });
      return leaves;
    };

    /// # json_crdt.parse_patch(patch)
    ///
    /// Takes a patch in the form `{range, content}`, and returns an object of the form `{path: [...], [slice: [...]], [delete: true], content}`; basically calling `parse_json_path` on `patch.range`, and adding `patch.content` along for the ride.
    self.parse_patch = (patch) => {
      let x = self.parse_json_path(patch.range);
      x.value = patch.content;
      return x;
    };

    /// # json_crdt.parse_json_path(json_path)
    ///
    /// Parses the string `json_path` into an object like: `{path: [...], [slice: [...]], [delete: true]}`. 
    ///
    /// * `a.b[3]` --> `{path: ['a', 'b', 3]}`
    /// * `a.b[3:5]` --> `{path: ['a', 'b'], slice: [3, 5]}`
    /// * `delete a.b` --> `{path: ['a', 'b'], delete: true}`
    ///
    /// ``` js
    /// console.log(json_crdt.parse_json_path('a.b.c'))
    /// ```
    self.parse_json_path = (json_path) => {
      var ret = { path: [] };
      var re =
        /^(delete)\s+|\.?([^\.\[ =]+)|\[((\-?\d+)(:\-?\d+)?|"(\\"|[^"])*")\]/g;
      var m;
      while ((m = re.exec(json_path))) {
        if (m[1]) ret.delete = true;
        else if (m[2]) ret.path.push(m[2]);
        else if (m[3] && m[5])
          ret.slice = [JSON.parse(m[4]), JSON.parse(m[5].substr(1))];
        else if (m[3]) ret.path.push(JSON.parse(m[3]));
      }
      return ret;
    };

    return self;
  };

  /// # sequence_crdt.create_node(version, elems, [end_cap, sort_key])
  ///
  /// Creates a node for a `sequence_crdt` sequence CRDT with the given properties. The resulting node will look like this:
  ///
  /// ``` js
  /// {
  ///   version, // globally unique string
  ///   elems, // a string or array representing actual data elements of the underlying sequence
  ///   end_cap, // this is useful for dealing with replace operations
  ///   sort_key, // version to pretend this is for the purposes of sorting
  ///   deleted_by : {}, // if this node gets deleted, we'll mark it here
  ///   nexts : [], // array of nodes following this one
  ///   next : null // final node following this one (after all the nexts)
  /// } 
  ///
  /// var sequence_node = sequence_crdt.create_node('alice1', 'hello')
  /// ```
  sequence_crdt.create_node = (version, elems, end_cap, sort_key) => ({
    version,
    sort_key,
    elems,
    end_cap,
    deleted_by: {},
    nexts: [],
    next: null,
  });

  /// # sequence_crdt.generate_braid(root_node, version, is_anc)
  ///  
  /// Reconstructs an array of splice-information which can be passed to `sequence_crdt.add_version` in order to add `version` to another `sequence_crdt` instance – the returned array looks like: `[[insert_pos, delete_count, insert_elems, sort_key], ...]`. `is_anc` is a function which accepts a version string and returns `true` if and only if the given version is an ancestor of `version` (i.e. a version which the author of `version` knew about when they created that version).
  ///
  /// ``` js
  /// var root_node = sequence_crdt.create_node('alice1', 'hello')
  /// console.log(sequence_crdt.generate_braid(root_node, 'alice1', x => false)) // outputs [[0, 0, "hello"]]
  /// ```
  sequence_crdt.generate_braid = (S, version, is_anc, read_array_elements) => {
    if (!read_array_elements) read_array_elements = (x) => x;
    var splices = [];

    function add_ins(offset, ins, sort_key, end_cap, is_row_header) {
      if (typeof ins !== "string")
        ins = ins.map((x) => read_array_elements(x, () => false));
      if (splices.length > 0) {
        var prev = splices[splices.length - 1];
        if (
          prev[0] + prev[1] === offset &&
          !end_cap &&
          (!is_row_header || prev[3] == sort_key) &&
          (prev[4] === "i" || (prev[4] === "r" && prev[1] === 0))
        ) {
          prev[2] = prev[2].concat(ins);
          return;
        }
      }
      splices.push([offset, 0, ins, sort_key, end_cap ? "r" : "i"]);
    }

    function add_del(offset, del, ins) {
      if (splices.length > 0) {
        var prev = splices[splices.length - 1];
        if (prev[0] + prev[1] === offset && prev[4] !== "i") {
          prev[1] += del;
          return;
        }
      }
      splices.push([offset, del, ins, null, "d"]);
    }

    var offset = 0;
    function helper(node, _version, end_cap, is_row_header) {
      if (_version === version) {
        add_ins(
          offset,
          node.elems.slice(0),
          node.sort_key,
          end_cap,
          is_row_header
        );
      } else if (node.deleted_by[version] && node.elems.length > 0) {
        add_del(offset, node.elems.length, node.elems.slice(0, 0));
      }

      if (
        (!_version || is_anc(_version)) &&
        !Object.keys(node.deleted_by).some(is_anc)
      ) {
        offset += node.elems.length;
      }

      node.nexts.forEach((next) =>
        helper(next, next.version, node.end_cap, true)
      );
      if (node.next) helper(node.next, _version);
    }
    helper(S, null);
    splices.forEach((s) => {
      // if we have replaces with 0 deletes,
      // make them have at least 1 delete..
      // this can happen when there are multiple replaces of the same text,
      // and our code above will associate those deletes with only one of them
      if (s[4] === "r" && s[1] === 0) s[1] = 1;
    });
    return splices;
  };

  /// # sequence_crdt.apply_bubbles(root_node, to_bubble)
  ///
  /// This method helps prune away meta data and compress stuff when we have determined that certain versions can be renamed to other versions – these renamings are expressed in `to_bubble`, where keys are versions and values are "bubbles", each bubble is represented with an array of two elements, the first element is the "bottom" of the bubble, and the second element is the "top" of the bubble. We will use the "bottom" as the new name for the version, and we'll use the "top" as the new parents.
  /// 
  /// ``` js
  /// sequence_crdt.apply_bubbles(root_node, {
  ///   alice4: ['bob5', 'alice4'],
  ///   bob5: ['bob5', 'alice4']
  /// })
  /// ```
  sequence_crdt.apply_bubbles = (S, to_bubble) => {
    sequence_crdt.traverse(
      S,
      () => true,
      (node) => {
        if (
          to_bubble[node.version] &&
          to_bubble[node.version][0] != node.version
        ) {
          if (!node.sort_key) node.sort_key = node.version;
          node.version = to_bubble[node.version][0];
        }

        for (var x of Object.keys(node.deleted_by)) {
          if (to_bubble[x]) {
            delete node.deleted_by[x];
            node.deleted_by[to_bubble[x][0]] = true;
          }
        }
      },
      true
    );

    function set_nnnext(node, next) {
      while (node.next) node = node.next;
      node.next = next;
    }

    do_line(S, S.version);
    function do_line(node, version) {
      var prev = null;
      while (node) {
        if (node.nexts[0] && node.nexts[0].version == version) {
          for (let i = 0; i < node.nexts.length; i++) {
            delete node.nexts[i].version;
            delete node.nexts[i].sort_key;
            set_nnnext(
              node.nexts[i],
              i + 1 < node.nexts.length ? node.nexts[i + 1] : node.next
            );
          }
          node.next = node.nexts[0];
          node.nexts = [];
        }

        if (node.deleted_by[version]) {
          node.elems = node.elems.slice(0, 0);
          node.deleted_by = {};
          if (prev) {
            node = prev;
            continue;
          }
        }

        var next = node.next;

        if (
          !node.nexts.length &&
          next &&
          (!node.elems.length ||
            !next.elems.length ||
            (Object.keys(node.deleted_by).every((x) => next.deleted_by[x]) &&
              Object.keys(next.deleted_by).every((x) => node.deleted_by[x])))
        ) {
          if (!node.elems.length) node.deleted_by = next.deleted_by;
          node.elems = node.elems.concat(next.elems);
          node.end_cap = next.end_cap;
          node.nexts = next.nexts;
          node.next = next.next;
          continue;
        }

        if (next && !next.elems.length && !next.nexts.length) {
          node.next = next.next;
          continue;
        }

        for (let n of node.nexts) do_line(n, n.version);

        prev = node;
        node = next;
      }
    }
  };

  /// # sequence_crdt.get(root_node, i, is_anc)
  /// 
  /// Returns the element at the `i`th position (0-based) in the `sequence_crdt` rooted at `root_node`, when only considering versions which result in `true` when passed to `is_anc`.
  /// 
  /// ``` js
  /// var x = sequence_crdt.get(root_node, 2, {
  ///     alice1: true
  /// })
  /// ```
  sequence_crdt.get = (S, i, is_anc) => {
    var ret = null;
    var offset = 0;
    sequence_crdt.traverse(S, is_anc ? is_anc : () => true, (node) => {
      if (i - offset < node.elems.length) {
        ret = node.elems[i - offset];
        return false;
      }
      offset += node.elems.length;
    });
    return ret;
  };

  /// # sequence_crdt.set(root_node, i, v, is_anc)
  /// 
  /// Sets the element at the `i`th position (0-based) in the `sequence_crdt` rooted at `root_node` to the value `v`, when only considering versions which result in `true` when passed to `is_anc`.
  /// 
  /// ``` js
  /// sequence_crdt.set(root_node, 2, 'x', {
  ///   alice1: true
  /// })
  /// ```
  sequence_crdt.set = (S, i, v, is_anc) => {
    var offset = 0;
    sequence_crdt.traverse(S, is_anc ? is_anc : () => true, (node) => {
      if (i - offset < node.elems.length) {
        if (typeof node.elems == "string")
          node.elems =
            node.elems.slice(0, i - offset) +
            v +
            node.elems.slice(i - offset + 1);
        else node.elems[i - offset] = v;
        return false;
      }
      offset += node.elems.length;
    });
  };

  /// # sequence_crdt.length(root_node, is_anc)
  /// 
  /// Returns the length of the `sequence_crdt` rooted at `root_node`, when only considering versions which result in `true` when passed to `is_anc`.
  /// 
  /// ``` js
  /// console.log(sequence_crdt.length(root_node, {
  ///  alice1: true
  /// }))
  /// ```
  sequence_crdt.length = (S, is_anc) => {
    var count = 0;
    sequence_crdt.traverse(S, is_anc ? is_anc : () => true, (node) => {
      count += node.elems.length;
    });
    return count;
  };

  /// # sequence_crdt.break_node(node, break_position, end_cap, new_next)
  /// 
  /// This method breaks apart a `sequence_crdt` node into two nodes, each representing a subsequence of the sequence represented by the original node. The `node` parameter is modified into the first node, and the second node is returned. The first node represents the elements of the sequence before `break_position`, and the second node represents the rest of the elements. If `end_cap` is truthy, then the first node will have `end_cap` set – this is generally done if the elements in the second node are being replaced. This method will add `new_next` to the first node's `nexts` array.
  /// 
  /// ``` js
  /// var node = sequence_crdt.create_node('alice1', 'hello') // node.elems == 'hello'
  /// var second = sequence_crdt.break_node(node, 2) // now node.elems == 'he', and second.elems == 'llo'
  /// ```
  sequence_crdt.break_node = (node, x, end_cap, new_next) => {
    var tail = sequence_crdt.create_node(
      null,
      node.elems.slice(x),
      node.end_cap
    );
    Object.assign(tail.deleted_by, node.deleted_by);
    tail.nexts = node.nexts;
    tail.next = node.next;

    node.elems = node.elems.slice(0, x);
    node.end_cap = end_cap;
    node.nexts = new_next ? [new_next] : [];
    node.next = tail;

    return tail;
  };

  /// # sequence_crdt.add_version(root_node, version, splices, [is_anc])
  /// 
  /// This is the main method in sequence_crdt, used to modify the sequence. The modification must be given a unique `version` string, and the modification itself is represented as an array of `splices`, where each splice looks like this: `[position, num_elements_to_delete, elements_to_insert, optional_sort_key]`. 
  /// 
  /// Note that all positions are relative to the original sequence, before any splices have been applied. Positions are counted by only considering nodes with versions which result in `true` when passed to `is_anc`. (and are not `deleted_by` any versions which return `true` when passed to `is_anc`).
  /// 
  /// ``` js
  /// var node = sequence_crdt.create_node('alice1', 'hello') 
  /// sequence_crdt.add_version(node, 'alice2', [[5, 0, ' world']], null, v => v == 'alice1') 
  /// ```
  sequence_crdt.add_version = (S, version, splices, is_anc) => {
    var rebased_splices = [];

    function add_to_nexts(nexts, to) {
      var i = binarySearch(nexts, function (x) {
        if ((to.sort_key || to.version) < (x.sort_key || x.version)) return -1;
        if ((to.sort_key || to.version) > (x.sort_key || x.version)) return 1;
        return 0;
      });
      nexts.splice(i, 0, to);
    }

    var si = 0;
    var delete_up_to = 0;

    var process_patch = (node, offset, has_nexts, prev, _version, deleted) => {
      var s = splices[si];
      if (!s) return;
      var sort_key = s[3];

      if (deleted) {
        if (s[1] == 0 && s[0] == offset) {
          if (node.elems.length == 0 && !node.end_cap && has_nexts) return;
          var new_node = sequence_crdt.create_node(
            version,
            s[2],
            null,
            sort_key
          );

          fresh_nodes.add(new_node);

          if (node.elems.length == 0 && !node.end_cap)
            add_to_nexts(node.nexts, new_node);
          else sequence_crdt.break_node(node, 0, undefined, new_node);
          si++;
        }

        if (
          delete_up_to <= offset &&
          s[1] &&
          s[2] &&
          s[0] == offset &&
          node.end_cap &&
          !has_nexts &&
          (node.next && node.next.elems.length) &&
          !Object.keys(node.next.deleted_by).some((version) => f(version))
        ) {
          delete_up_to = s[0] + s[1];

          var new_node = sequence_crdt.create_node(
            version,
            s[2],
            null,
            sort_key
          );

          fresh_nodes.add(new_node);

          add_to_nexts(node.nexts, new_node);
        }

        return;
      }

      if (s[1] == 0) {
        var d = s[0] - (offset + node.elems.length);
        if (d > 0) return;
        if (d == 0 && !node.end_cap && has_nexts) return;
        var new_node = sequence_crdt.create_node(version, s[2], null, sort_key);

        fresh_nodes.add(new_node);

        if (d == 0 && !node.end_cap) {
          add_to_nexts(node.nexts, new_node);
        } else {
          sequence_crdt.break_node(node, s[0] - offset, undefined, new_node);
        }
        si++;
        return;
      }

      if (delete_up_to <= offset) {
        var d = s[0] - (offset + node.elems.length);

        let add_at_end =
          d == 0 &&
          s[2] &&
          node.end_cap &&
          !has_nexts &&
          (node.next && node.next.elems.length) &&
          !Object.keys(node.next.deleted_by).some((version) => f(version));

        if (d > 0 || (d == 0 && !add_at_end)) return;

        delete_up_to = s[0] + s[1];

        if (s[2]) {
          var new_node = sequence_crdt.create_node(
            version,
            s[2],
            null,
            sort_key
          );

          fresh_nodes.add(new_node);

          if (add_at_end) {
            add_to_nexts(node.nexts, new_node);
          } else {
            sequence_crdt.break_node(node, s[0] - offset, true, new_node);
          }
          return;
        } else {
          if (s[0] == offset) {
          } else {
            sequence_crdt.break_node(node, s[0] - offset);
            return;
          }
        }
      }

      if (delete_up_to > offset) {
        if (delete_up_to <= offset + node.elems.length) {
          if (delete_up_to < offset + node.elems.length) {
            sequence_crdt.break_node(node, delete_up_to - offset);
          }
          si++;
        }
        node.deleted_by[version] = true;
        return;
      }
    };

    var f = is_anc || (() => true);
    var offset = 0;
    var rebase_offset = 0;
    let fresh_nodes = new Set();
    function traverse(node, prev, version) {
      if (!version || f(version)) {
        var has_nexts = node.nexts.find((next) => f(next.version));
        var deleted = Object.keys(node.deleted_by).some((version) =>
          f(version)
        );
        let rebase_deleted = Object.keys(node.deleted_by).length;
        process_patch(node, offset, has_nexts, prev, version, deleted);

        if (!deleted) offset += node.elems.length;
        if (!rebase_deleted && Object.keys(node.deleted_by).length)
          rebased_splices.push([rebase_offset, node.elems.length, ""]);
      }
      if (fresh_nodes.has(node))
        rebased_splices.push([rebase_offset, 0, node.elems]);
      if (!Object.keys(node.deleted_by).length)
        rebase_offset += node.elems.length;

      for (var next of node.nexts) traverse(next, null, next.version);
      if (node.next) traverse(node.next, node, version);
    }
    traverse(S, null, S.version);

    return rebased_splices;
  };

  /// # sequence_crdt.traverse(root_node, is_anc, callback, [view_deleted, tail_callback])
  /// 
  /// Traverses the subset of nodes in the tree rooted at `root_node` whose versions return `true` when passed to `is_anc`. For each node, `callback` is called with these parameters: `node, offset, has_nexts, prev, version, deleted`, 
  /// 
  /// Where
  /// - `node` is the current node being traversed
  /// - `offset` says how many elements we have passed so far 
  /// - `has_nexts` is true if some of this node's `nexts` will be traversed according to `is_anc`
  /// - `prev` is a pointer to the node whos `next` points to this one, or `null` if this is the root node
  /// - `version` is the version of this node, or this node's `prev` if our version is `null`, or that node's `prev` if it is also `null`, etc
  /// - `deleted` is true if this node is deleted according to `is_anc`
  /// 
  /// Usually we skip deleted nodes when traversing, but we'll include them if `view_deleted` is `true`. 
  /// 
  /// `tail_callback` is an optional callback that will get called with a single parameter `node` after all of that node's children `nexts` and `next` have been traversed. 
  /// 
  /// ``` js
  /// sequence_crdt.traverse(node, () => true, node =>
  ///   process.stdout.write(node.elems)) 
  /// ```
  sequence_crdt.traverse = (S, f, cb, view_deleted, tail_cb) => {
    var offset = 0;
    function helper(node, prev, version) {
      var has_nexts = node.nexts.find((next) => f(next.version));
      var deleted = Object.keys(node.deleted_by).some((version) => f(version));
      if (view_deleted || !deleted) {
        if (cb(node, offset, has_nexts, prev, version, deleted) == false)
          return true;
        offset += node.elems.length;
      }
      for (var next of node.nexts)
        if (f(next.version)) {
          if (helper(next, null, next.version)) return true;
        }
      if (node.next) {
        if (helper(node.next, node, version)) return true;
      } else if (tail_cb) tail_cb(node);
    }
    helper(S, null, S.version);
  };

  // modified from https://stackoverflow.com/questions/22697936/binary-search-in-javascript
  function binarySearch(ar, compare_fn) {
    var m = 0;
    var n = ar.length - 1;
    while (m <= n) {
      var k = (n + m) >> 1;
      var cmp = compare_fn(ar[k]);
      if (cmp > 0) {
        m = k + 1;
      } else if (cmp < 0) {
        n = k - 1;
      } else {
        return k;
      }
    }
    return m;
  }
})();

if (typeof module != "undefined")
  module.exports = {
    create_antimatter_crdt,
    create_json_crdt,
    sequence_crdt,
  };
