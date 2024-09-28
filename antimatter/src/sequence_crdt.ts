type Version = string

type Node = {
  /// globally unique string
  version: Version,
  /// a string or array representing actual data elements of the underlying sequence
  elems: string | any[],
  /// this is useful for dealing with replace operations
  end_cap: any | undefined,
  /// version to pretend this is for the purposes of sorting
  sort_key: any | undefined,
  /// if this node gets deleted, we'll mark it here
  deleted_by: Record<string, any>,
  /// array of nodes following this one
  nexts: any[],
  /// final node following this one (after all the nexts)
  next: null | any,
}

/// # sequence_crdt_create_node(version, elems, [end_cap, sort_key])
///
/// Creates a node for a `sequence_crdt` sequence CRDT with the given properties. The resulting node will look like this:
///
/// var sequence_node = sequence_crdt_create_node('alice1', 'hello')
/// ```
const sequence_crdt_create_node = (version: Version, elems: string | any[], end_cap: any = undefined, sort_key: any = undefined): Node => ({
  version,
  elems,
  end_cap,
  sort_key,
  deleted_by: {},
  nexts: [],
  next: null,
});

/// # sequence_crdt_generate_braid(root_node, version, is_anc)
///  
/// Reconstructs an array of splice-information which can be passed to `sequence_crdt_add_version` in order to add `version` to another `sequence_crdt` instance – the returned array looks like: `[[insert_pos, delete_count, insert_elems, sort_key], ...]`. `is_anc` is a function which accepts a version string and returns `true` if and only if the given version is an ancestor of `version` (i.e. a version which the author of `version` knew about when they created that version).
///
/// ``` js
/// var root_node = sequence_crdt_create_node('alice1', 'hello')
/// console.log(sequence_crdt_generate_braid(root_node, 'alice1', x => false)) // outputs [0, 0, "hello"]
/// ```
const sequence_crdt_generate_braid = (S: Node, version: Version, is_anc, read_array_elements=undefined) => {
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
  function helper(node, _version, end_cap=undefined, is_row_header=undefined) {
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

/// # sequence_crdt_apply_bubbles(root_node, to_bubble)
///
/// This method helps prune away meta data and compress stuff when we have determined that certain versions can be renamed to other versions – these renamings are expressed in `to_bubble`, where keys are versions and values are "bubbles", each bubble is represented with an array of two elements, the first element is the "bottom" of the bubble, and the second element is the "top" of the bubble. We will use the "bottom" as the new name for the version, and we'll use the "top" as the new parents.
/// 
/// ``` js
/// sequence_crdt_apply_bubbles(root_node, {
///   alice4: ['bob5', 'alice4'],
///   bob5: ['bob5', 'alice4']
/// })
/// ```
const sequence_crdt_apply_bubbles = (S, to_bubble) => {
  sequence_crdt_traverse(
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

/// # sequence_crdt_get(root_node, i, is_anc)
/// 
/// Returns the element at the `i`th position (0-based) in the `sequence_crdt` rooted at `root_node`, when only considering versions which result in `true` when passed to `is_anc`.
/// 
/// ``` js
/// var x = sequence_crdt_get(root_node, 2, {
///     alice1: true
/// })
/// ```
const sequence_crdt_get = (S, i, is_anc) => {
  var ret = null;
  var offset = 0;
  sequence_crdt_traverse(S, is_anc ? is_anc : () => true, (node) => {
    if (i - offset < node.elems.length) {
      ret = node.elems[i - offset];
      return false;
    }
    offset += node.elems.length;
  });
  return ret;
};

/// # sequence_crdt_set(root_node, i, v, is_anc)
/// 
/// Sets the element at the `i`th position (0-based) in the `sequence_crdt` rooted at `root_node` to the value `v`, when only considering versions which result in `true` when passed to `is_anc`.
/// 
/// ``` js
/// sequence_crdt_set(root_node, 2, 'x', {
///   alice1: true
/// })
/// ```
const sequence_crdt_set = (S, i, v, is_anc) => {
  var offset = 0;
  sequence_crdt_traverse(S, is_anc ? is_anc : () => true, (node) => {
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

/// # sequence_crdt_length(root_node, is_anc)
/// 
/// Returns the length of the `sequence_crdt` rooted at `root_node`, when only considering versions which result in `true` when passed to `is_anc`.
/// 
/// ``` js
/// console.log(sequence_crdt_length(root_node, {
///  alice1: true
/// }))
/// ```
const sequence_crdt_length = (S, is_anc) => {
  var count = 0;
  sequence_crdt_traverse(S, is_anc ? is_anc : () => true, (node) => {
    count += node.elems.length;
  });
  return count;
};

/// # sequence_crdt_break_node(node, break_position, end_cap, new_next)
/// 
/// This method breaks apart a `sequence_crdt` node into two nodes, each representing a subsequence of the sequence represented by the original node. The `node` parameter is modified into the first node, and the second node is returned. The first node represents the elements of the sequence before `break_position`, and the second node represents the rest of the elements. If `end_cap` is truthy, then the first node will have `end_cap` set – this is generally done if the elements in the second node are being replaced. This method will add `new_next` to the first node's `nexts` array.
/// 
/// ``` js
/// var node = sequence_crdt_create_node('alice1', 'hello') // node.elems == 'hello'
/// var second = sequence_crdt_break_node(node, 2) // now node.elems == 'he', and second.elems == 'llo'
/// ```
const sequence_crdt_break_node = (node, x, end_cap=undefined, new_next=undefined) => {
  var tail = sequence_crdt_create_node(
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

/// # sequence_crdt_add_version(root_node, version, splices, [is_anc])
/// 
/// This is the main method in sequence_crdt, used to modify the sequence. The modification must be given a unique `version` string, and the modification itself is represented as an array of `splices`, where each splice looks like this: `[position, num_elements_to_delete, elements_to_insert, optional_sort_key]`. 
/// 
/// Note that all positions are relative to the original sequence, before any splices have been applied. Positions are counted by only considering nodes with versions which result in `true` when passed to `is_anc`. (and are not `deleted_by` any versions which return `true` when passed to `is_anc`).
/// 
/// ``` js
/// var node = sequence_crdt_create_node('alice1', 'hello') 
/// sequence_crdt_add_version(node, 'alice2', [[5, 0, ' world']], null, v => v == 'alice1') 
/// ```
const sequence_crdt_add_version = (S: Node, version: Version, splices, is_anc) => {
  var rebased_splices = [];

  function add_to_nexts(nexts: Node[], to: Node) {
    var i = binarySearch(nexts, function (x: Node) {
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
        var new_node = sequence_crdt_create_node(
          version,
          s[2],
          null,
          sort_key
        );

        fresh_nodes.add(new_node);

        if (node.elems.length == 0 && !node.end_cap)
          add_to_nexts(node.nexts, new_node);
        else sequence_crdt_break_node(node, 0, undefined, new_node);
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

        var new_node = sequence_crdt_create_node(
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
      var new_node = sequence_crdt_create_node(version, s[2], null, sort_key);

      fresh_nodes.add(new_node);

      if (d == 0 && !node.end_cap) {
        add_to_nexts(node.nexts, new_node);
      } else {
        sequence_crdt_break_node(node, s[0] - offset, undefined, new_node);
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
        var new_node = sequence_crdt_create_node(
          version,
          s[2],
          null,
          sort_key
        );

        fresh_nodes.add(new_node);

        if (add_at_end) {
          add_to_nexts(node.nexts, new_node);
        } else {
          sequence_crdt_break_node(node, s[0] - offset, true, new_node);
        }
        return;
      } else {
        if (s[0] == offset) {
        } else {
          sequence_crdt_break_node(node, s[0] - offset);
          return;
        }
      }
    }

    if (delete_up_to > offset) {
      if (delete_up_to <= offset + node.elems.length) {
        if (delete_up_to < offset + node.elems.length) {
          sequence_crdt_break_node(node, delete_up_to - offset);
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

/// # sequence_crdt_traverse(root_node, is_anc, callback, [view_deleted, tail_callback])
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
/// sequence_crdt_traverse(node, () => true, node =>
///   process.stdout.write(node.elems)) 
/// ```
const sequence_crdt_traverse = (S, f, cb, view_deleted=undefined, tail_cb=undefined) => {
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
function binarySearch<T>(ar: T[], compare_fn: (x: T) => number): number {
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

/// - *sequence_crdt*: methods to manipulate a pruneable sequence CRDT —
///   "sequence" meaning it represents a javascript string or array, "CRDT" meaning
///   this structure can be merged with other ones, and "pruneable" meaning that it
///   supports an operation to remove meta-data when it is no longer needed (whereas
///   CRDT's often keep track of this meta-data forever).
export {
  sequence_crdt_create_node as create_node,
  sequence_crdt_generate_braid as generate_braid,
  sequence_crdt_apply_bubbles as apply_bubbles,
  sequence_crdt_get as get,
  sequence_crdt_set as set,
  sequence_crdt_length as length,
  sequence_crdt_break_node as break_node,
  sequence_crdt_add_version as add_version,
  sequence_crdt_traverse as traverse,
};
