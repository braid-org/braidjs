/// - *json_crdt*: created using `create_json_crdt`, this object is a pruneable
///   JSON CRDT — "JSON" meaning it represents an arbitrary JSON datstructure, and
///   "CRDT" and "pruneable" having the same meaning as for sequence_crdt below. The
///   json_crdt makes recursive use of sequence_crdt structures to represent
///   arbitrary JSON (for instance, a map is represented with a sequence_crdt
///   structure for each value, where the first element in the sequence is the
///   value).

import {
  create_node as sequence_crdt_create_node,
  generate_braid as sequence_crdt_generate_braid,
  apply_bubbles as sequence_crdt_apply_bubbles,
  get as sequence_crdt_get,
  set as sequence_crdt_set,
  length as sequence_crdt_length,
  break_node as sequence_crdt_break_node,
  add_version as sequence_crdt_add_version,
  traverse as sequence_crdt_traverse,
} from "./sequence_crdt.ts";


/// ## create_json_crdt([init])
///
/// Create a new `json_crdt` object (or start with `init`, and add stuff to that). 
///
/// ``` js
/// let json_crdt = create_json_crdt()
/// ``` 
export const create_json_crdt = (self) => {
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
          return raw_read(sequence_crdt_get(x.S, 0, is_anc), is_anc);
        if (x.t == "obj") {
          let o = {};
          Object.entries(x.S).forEach(([k, v]) => {
            let x = raw_read(v, is_anc);
            if (x != null) o[k] = x;
          });
          return o;
        }
        if (x.t == "arr") {
          let a = [];
          sequence_crdt_traverse(
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
          let s = [];
          sequence_crdt_traverse(
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
      let anc =
        versions && Object.keys(versions).length
          ? self.ancestors(versions, true)
          : {};
      let is_anc = (x) => anc[x];
  
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
  
        let is_lit = (x) => !x || typeof x !== "object" || x.t === "lit";
        let get_lit = (x) =>
          x && typeof x === "object" && x.t === "lit" ? x.S : x;
  
        let ancs = self.ancestors({ [version]: true });
        delete ancs[version];
        let is_anc = (x) => ancs[x];
        let path = [];
        let patches = [];
        let sort_keys = {};
        recurse(self.S);
        function recurse(x) {
          if (is_lit(x)) {
          } else if (x.t === "val") {
            sequence_crdt_generate_braid(x.S, version, is_anc, raw_read)
              .forEach((s) => {
                if (s[2].length) {
                  patches.push({ range: path.join(""), content: s[2][0] });
                  if (s[3]) sort_keys[patches.length - 1] = s[3];
                }
              });
            sequence_crdt_traverse(x.S, is_anc, (node) => {
              node.elems.forEach(recurse);
            });
          } else if (x.t === "arr") {
            sequence_crdt_generate_braid(x.S, version, is_anc).forEach((s) => {
              patches.push({
                range: `${path.join("")}[${s[0]}:${s[0] + s[1]}]`,
                content: s[2],
              });
              if (s[3]) sort_keys[patches.length - 1] = s[3];
            });
            let i = 0;
            sequence_crdt_traverse(x.S, is_anc, (node) => {
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
            sequence_crdt_generate_braid(x.S, version, is_anc).forEach((s) => {
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
          sequence_crdt_apply_bubbles(x.S, to_bubble);
          sequence_crdt_traverse(
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
          sequence_crdt_apply_bubbles(x.S, to_bubble);
          sequence_crdt_traverse(
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
            let y = (x.S[e[0]] = recurse(e[1]));
            if (y == null) delete x.S[e[0]];
          });
          if (Object.values(x.S).every(is_lit)) {
            let o = {};
            Object.entries(x.S).forEach((e) => (o[e[0]] = get_lit(e[1])));
            return { t: "lit", S: o };
          }
          return x;
        }
        if (x.t == "str") {
          sequence_crdt_apply_bubbles(x.S, to_bubble);
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
  
      let leaves = Object.keys(self.current_version);
      let acked_boundary = Object.keys(self.acked_boundary);
      let fiss = Object.keys(self.fissures);
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
        let parse = self.parse_patch(patches[0]);
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
  
      let rebased_patches = [];
      patches.forEach((patch, i) => {
        let sort_key = sort_keys[i];
        let parse = self.parse_patch(patch);
        let cur = resolve_path(parse);
        if (!parse.slice) {
          if (cur.t != "val") throw Error("bad");
          let len = sequence_crdt_length(cur.S, is_anc);
          sequence_crdt_add_version(
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
  
          let r0 = parse.slice[0];
          let r1 = parse.slice[1];
          if (r0 < 0 || Object.is(r0, -0) || r1 < 0 || Object.is(r1, -0)) {
            let len = sequence_crdt_length(cur.S, is_anc);
            if (r0 < 0 || Object.is(r0, -0)) r0 = len + r0;
            if (r1 < 0 || Object.is(r1, -0)) r1 = len + r1;
          }
  
          let rebased_splices = sequence_crdt_add_version(
            cur.S,
            version,
            [[r0, r1 - r0, parse.value, sort_key]],
            is_anc
          );
          for (let rebased_splice of rebased_splices)
            rebased_patches.push({
              range: `${parse.path
                .map((x) => `[${JSON.stringify(x)}]`)
                .join("")}[${rebased_splice[0]}:${rebased_splice[0] + rebased_splice[1]
                }]`,
              content: rebased_splice[2],
            });
        }
      });
  
      function resolve_path(parse) {
        let cur = self.S;
        if (!cur || typeof cur != "object" || cur.t == "lit")
          cur = self.S = {
            t: "val",
            S: sequence_crdt_create_node(self.root_version, [cur]),
          };
        let prev_S = null;
        let prev_i = 0;
        for (let i = 0; i < parse.path.length; i++) {
          let key = parse.path[i];
          if (cur.t == "val")
            cur = sequence_crdt_get((prev_S = cur.S), (prev_i = 0), is_anc);
          if (cur.t == "lit") {
            let new_cur = {};
            if (cur.S instanceof Array) {
              new_cur.t = "arr";
              new_cur.S = sequence_crdt_create_node(
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
            sequence_crdt_set(prev_S, prev_i, cur, is_anc);
          }
          if (cur.t == "obj") {
            let x = cur.S[key];
            if (!x || typeof x != "object" || x.t == "lit")
              x = cur.S[key] = {
                t: "val",
                S: sequence_crdt_create_node(self.root_version, [
                  x == null ? null : x,
                ]),
              };
            cur = x;
          } else if (i == parse.path.length - 1 && !parse.slice) {
            parse.slice = [key, key + 1];
            parse.value = cur.t == "str" ? parse.value : [parse.value];
          } else if (cur.t == "arr") {
            cur = sequence_crdt_get((prev_S = cur.S), (prev_i = key), is_anc);
          } else throw Error("bad");
        }
        if (parse.slice) {
          if (cur.t == "val")
            cur = sequence_crdt_get((prev_S = cur.S), (prev_i = 0), is_anc);
          if (typeof cur == "string") {
            cur = {
              t: "str",
              S: sequence_crdt_create_node(self.root_version, cur),
            };
            sequence_crdt_set(prev_S, prev_i, cur, is_anc);
          } else if (cur.t == "lit") {
            if (!(cur.S instanceof Array)) throw Error("bad");
            cur = {
              t: "arr",
              S: sequence_crdt_create_node(
                self.root_version,
                cur.S.map((x) => make_lit(x))
              ),
            };
            sequence_crdt_set(prev_S, prev_i, cur, is_anc);
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
      let result = {};
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
      let result = {};
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
      let leaves = { ...versions };
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
      let ret = { path: [] };
      let re =
        /^(delete)\s+|\.?([^\.\[ =]+)|\[((\-?\d+)(:\-?\d+)?|"(\\"|[^"])*")\]/g;
      let m;
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
  

