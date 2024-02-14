console.log("simpleton.js: v90");

var port = 61870;

require("child_process").execSync(`npm install braid-http@latest`, {
  stdio: "inherit",
});
var braidify = require("braid-http").http_server;

require("child_process").execSync(`npm install diamond-types-node`, {
  stdio: "inherit",
});
const { Doc, Branch, OpLog } = require("diamond-types-node");

const fs = require("fs");

if (!fs.existsSync("simpleton_db")) fs.mkdirSync("simpleton_db");

function get_resource(url) {
  let cache = get_resource.cache || (get_resource.cache = {});
  if (cache[url]) return cache[url];

  let resource = {};
  resource.doc = new Doc("server");
  resource.waiting_messages = [];
  resource.clients = new Set();
  resource.last_sent_version = null;

  resource.db_delta = file_sync(
    encodeURIComponent(url),
    (bytes) => resource.doc.mergeBytes(bytes),
    () => resource.doc.toBytes()
  );

  let fresh_doc = new Doc("server");
  fresh_doc.mergeBytes(resource.doc.toBytes());
  resource.doc = fresh_doc;

  return (cache[url] = resource);
}

function file_sync(filename_base, process_delta, get_init) {
  let currentNumber = 0;
  let currentSize = 0;
  let threshold = 0;

  // Read existing files and sort by numbers.
  let re = new RegExp(
    "^" + filename_base.replace(/[^a-zA-Z0-9]/g, "\\$&") + "\\.\\d+$"
  );

  const files = fs
    .readdirSync("./simpleton_db")
    .filter((a) => re.test(a))
    .sort((a, b) => parseInt(a.match(/\d+$/)[0]) - parseInt(b.match(/\d+$/)[0]))
    .map((x) => "./simpleton_db/" + x);

  // Try to process files starting from the highest number.
  let done = false;
  for (let i = files.length - 1; i >= 0; i--) {
    if (done) {
      fs.unlinkSync(files[i]);
      continue;
    }
    try {
      const filename = files[i];
      console.log(`trying to process file: ${filename}`);
      const data = fs.readFileSync(filename);

      let cursor = 0;
      let isFirstChunk = true;
      while (cursor < data.length) {
        const chunkSize = data.readUInt32LE(cursor);
        cursor += 4;
        const chunk = data.slice(cursor, cursor + chunkSize);
        cursor += chunkSize;

        if (isFirstChunk) {
          isFirstChunk = false;
          threshold = chunkSize * 10;
        }
        process_delta(chunk);
      }

      currentSize = data.length;
      currentNumber = parseInt(filename.match(/\d+$/)[0]);
      done = true;
    } catch (error) {
      console.error(`Error processing file: ${files[i]}`);
      fs.unlinkSync(files[i]);
    }
  }

  return (bytes) => {
    currentSize += bytes.length + 4; // we account for the extra 4 bytes for uint32
    const filename = `./simpleton_db/${filename_base}.${currentNumber}`;
    if (currentSize < threshold) {
      console.log(`appending to db..`);

      let buffer = Buffer.allocUnsafe(4);
      buffer.writeUInt32LE(bytes.length, 0);
      fs.appendFileSync(filename, buffer);
      fs.appendFileSync(filename, bytes);

      console.log("wrote to : " + filename);
    } else {
      try {
        console.log(`starting new db..`);

        currentNumber++;
        const init = get_init();
        const buffer = Buffer.allocUnsafe(4);
        buffer.writeUInt32LE(init.length, 0);

        const newFilename = `./simpleton_db/${filename_base}.${currentNumber}`;
        fs.writeFileSync(newFilename, buffer);
        fs.appendFileSync(newFilename, init);

        console.log("wrote to : " + newFilename);

        currentSize = 4 + init.length;
        threshold = currentSize * 10;
        try {
          fs.unlinkSync(filename);
        } catch (e) {}
      } catch (e) {
        console.log(`e = ${e.stack}`);
      }
    }
  };
}

process.on("uncaughtException", (e) => console.log(e.stack));
process.on("unhandledRejection", (e) => console.log(e.stack));

const server = require("http2").createSecureServer(
  {
    key: require("fs").readFileSync("./privkey.pem"),
    cert: require("fs").readFileSync("./fullchain.pem"),
    allowHTTP1: true,
  },

  async (req, res) => {
    let silent = req.url == "//time";

    if (!silent) console.log(`${req.method} ${req.url}`);

    let resource = get_resource(req.url);

    braidify(req, res);
    let peer = req.headers["peer"];

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.statusCode = 200;

    // work here
    if (!silent) console.log("req.headers: " + JSON.stringify(req.headers));

    if (req.method == "OPTIONS") {
      return res.end("ok");
    }

    if (req.method == "GET" && req.url == `//time`) {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ time: Date.now() }));
    }

    function get_xf_patches(doc, v) {
      let patches = [];
      for (let xf of doc.xfSince(v)) {
        patches.push(
          xf.kind == "Ins"
            ? {
                unit: "json",
                range: `[${xf.start}:${xf.start}]`,
                content: xf.content,
              }
            : {
                unit: "json",
                range: `[${xf.start}:${xf.end}]`,
                content: "",
              }
        );
      }
      return patches;
    }

    if (req.method == "GET" && !req.subscribe) {
      res.setHeader("Content-Type", "text/plain");
      res.end(resource.doc.get());
      return;
    }

    if (req.method == "GET" && req.subscribe) {
      res.setHeader("Merge-Type", "simpleton");
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Editable", "true");

      res.startSubscription({ onClose: (_) => resource.clients.delete(res) });

      let version = JSON.stringify(
        resource.doc.getRemoteVersion().map((x) => encode_version(...x))
      );

      let body = resource.doc.get();
      let hash = sha256(body);

      let x = {
        version,
        "Snapshot-Hash": hash,
      };

      if (!req.parents) {
        x.parents = [];
        x.body = body;

        console.log(`sending1: ${JSON.stringify(x).slice(0, 1000)}`);
        res.sendVersion(x);
      } else {
        x.parents = JSON.parse(req.parents);
        let local_version = OpLog_remote_to_local(resource.doc, x.parents);
        // only send them a version from these parents if we have these parents (otherwise we'll assume these parents are more recent, probably versions they created but haven't sent us yet, and we'll send them appropriate rebased updates when they send us these versions)
        if (local_version.length == x.parents.length) {
          x.patches = get_xf_patches(resource.doc, local_version);

          console.log(`sending2: ${JSON.stringify(x).slice(0, 1000)}`);
          res.sendVersion(x);
        } else {
          console.log(`not sending3`);
        }
      }

      res.my_peer = peer;
      resource.clients.add(res);

      ping_loop();
      async function ping_loop() {
        if (!resource.clients.has(res)) return;
        res.sendVersion({ version: "ping", parents: ["ping"], body: "" });
        setTimeout(ping_loop, 1000 * 7);
      }

      return;
    }

    if (req.method == "PUT") {
      let patches = await req.patches();
      patches.forEach(
        (p) => (p.range = p.range.match(/\d+/g).map((x) => parseInt(x)))
      );

      console.log(`patches = ${JSON.stringify(patches)}`);

      resource.waiting_messages.push({
        peer,
        version: req.version,
        parents: req.parents,
        patches,
        hash: req.headers["snapshot-hash"],
        snapshot_value: req.headers["snapshot-value"],

        snapshot_oldhash: req.headers["snapshot-oldhash"],
        snapshot_old: req.headers["snapshot-old"],
      });

      let did_something_overall = false;
      let did_something = true;
      while (did_something) {
        did_something = false;
        for (let i = resource.waiting_messages.length - 1; i >= 0; i--) {
          let m = resource.waiting_messages[i];

          try {
            let patches = m.patches;

            let og_v = JSON.parse(m.version)[0];

            // reduce the version sequence by the number of char-edits
            let v = decode_version(og_v);
            v = encode_version(
              v[0],
              v[1] +
                1 -
                patches.reduce(
                  (a, b) =>
                    a + Math.max(b.content.length, b.range[1] - b.range[0]),
                  0
                )
            );

            let ps = JSON.parse(m.parents[0]);
            let og_ps = ps;

            let v_before = resource.doc.getLocalVersion();
            let parents = [
              JSON.stringify(
                resource.doc.getRemoteVersion().map((x) => encode_version(...x))
              ),
            ];

            let offset = 0;
            for (let p of patches) {
              if (p.content) {
                // insert
                for (let i = 0; i < p.content.length; i++) {
                  let c = p.content[i];
                  resource.doc.mergeBytes(
                    OpLog_create_bytes(v, ps, p.range[0] + offset, c)
                  );
                  offset++;
                  ps = [v];
                  v = decode_version(v);
                  v = encode_version(v[0], v[1] + 1);
                }
              } else {
                // delete
                for (let i = p.range[0]; i < p.range[1]; i++) {
                  resource.doc.mergeBytes(
                    OpLog_create_bytes(v, ps, p.range[1] - 1 + offset, null)
                  );
                  offset--;
                  ps = [v];
                  v = decode_version(v);
                  v = encode_version(v[0], v[1] + 1);
                }
              }
            }

            resource.db_delta(resource.doc.getPatchSince(v_before));

            // work here
            // if (true) {
            //     let x = resource.doc
            //     resource.doc = new Doc('server')
            //     resource.doc.mergeBytes(x.toBytes())
            // }

            patches = get_xf_patches(resource.doc, v_before);
            console.log(JSON.stringify({ patches }));

            let version = JSON.stringify(
              resource.doc.getRemoteVersion().map((x) => encode_version(...x))
            );

            let body = resource.doc.get();
            let hash = sha256(body);

            // let's verify the hash..
            if (m.hash) {
              if (version == m.version) {
                if (hash != m.hash) {
                  console.log(`BAD HASH1!!: hash=${hash} m.hash=${m.hash}`);
                  console.log(`SERVER TEXT: ${body}`);
                  console.log(`CLIENT STUFF: ${JSON.stringify(m, null, 4)}`);
                  process.exit(1);
                } else {
                  console.log("HASH PASSED 1!");
                }
              } else {
                if (sha256(OpLog_get(resource.doc, [og_v])) != m.hash) {
                  console.log(
                    `BAD HASH2!!: hash=${sha256(
                      OpLog_get(resource.doc, [og_v])
                    )} m.hash=${m.hash}`
                  );
                  console.log(
                    `SERVER TEXT: ${OpLog_get(resource.doc, [og_v])}`
                  );
                  console.log(`CLIENT STUFF: ${JSON.stringify(m, null, 4)}`);
                  process.exit(1);
                } else {
                  console.log("HASH PASSED 2!");
                }
              }
            }

            for (let client of resource.clients) {
              let x = {
                version,
                "Snapshot-Hash": hash,
              };
              if (client.my_peer == m.peer) {
                x.parents = [m.version];
                if (version != m.version) {
                  console.log("rebasing..");
                  x.patches = get_xf_patches(
                    resource.doc,
                    OpLog_remote_to_local(resource.doc, [og_v])
                  );
                } else x.patches = [];
              } else {
                x.parents = parents;
                x.patches = patches;
              }
              console.log(`sending: ${JSON.stringify(x)}`);
              client.sendVersion(x);
            }

            resource.waiting_messages.splice(i, 1);
            did_something = true;
            did_something_overall = true;
          } catch (e) {
            console.log(`e = ${e}, ${e.stack}`);
            continue;
          }
        }
      }

      //   if (did_something_overall) {
      //     let fresh_doc = new Doc("server");
      //     fresh_doc.mergeBytes(resource.doc.toBytes());
      //     resource.doc = fresh_doc;
      //   }

      // work here
      console.log(
        `resource.waiting_messages= ${JSON.stringify(
          resource.waiting_messages
        )}`
      );
      console.log("get: " + resource.doc.get());

      return res.end(JSON.stringify({ ok: true }));
    }

    throw new Error("unknown");
  }
);

server.listen(port, () => {
  console.log(`server started on port ${port}`);
});

function parseDT(byte_array) {
  if (
    new TextDecoder().decode(new Uint8Array(byte_array.splice(0, 8))) !==
    "DMNDTYPS"
  )
    throw new Error("dt parse error, expected DMNDTYPS");

  if (byte_array.shift() != 0)
    throw new Error("dt parse error, expected version 0");

  let agents = [];
  let versions = [];
  let parentss = [];

  while (byte_array.length) {
    let id = byte_array.shift();
    let len = read_varint(byte_array);
    if (id == 1) {
    } else if (id == 3) {
      let goal = byte_array.length - len;
      while (byte_array.length > goal) {
        agents.push(read_string(byte_array));
      }
    } else if (id == 20) {
    } else if (id == 21) {
      let seqs = {};
      let goal = byte_array.length - len;
      while (byte_array.length > goal) {
        let part0 = read_varint(byte_array);
        let has_jump = part0 & 1;
        let agent_i = (part0 >> 1) - 1;
        let run_length = read_varint(byte_array);
        let jump = 0;
        if (has_jump) {
          let part2 = read_varint(byte_array);
          jump = part2 >> 1;
          if (part2 & 1) jump *= -1;
        }
        let base = (seqs[agent_i] || 0) + jump;

        for (let i = 0; i < run_length; i++) {
          versions.push([agents[agent_i], base + i]);
        }
        seqs[agent_i] = base + run_length;
      }
    } else if (id == 23) {
      let count = 0;
      let goal = byte_array.length - len;
      while (byte_array.length > goal) {
        let run_len = read_varint(byte_array);

        let parents = [];
        let has_more = 1;
        while (has_more) {
          let x = read_varint(byte_array);
          let is_foreign = 0x1 & x;
          has_more = 0x2 & x;
          let num = x >> 2;

          if (x == 1) {
            parents.push(["root"]);
          } else if (!is_foreign) {
            parents.push(versions[count - num]);
          } else {
            parents.push([agents[num - 1], read_varint(byte_array)]);
          }
        }
        parentss.push(parents);
        count++;

        for (let i = 0; i < run_len - 1; i++) {
          parentss.push([versions[count - 1]]);
          count++;
        }
      }
    } else {
      byte_array.splice(0, len);
    }
  }

  function read_string(byte_array) {
    return new TextDecoder().decode(
      new Uint8Array(byte_array.splice(0, read_varint(byte_array)))
    );
  }

  function read_varint(byte_array) {
    let result = 0;
    let shift = 0;
    while (true) {
      if (byte_array.length === 0)
        throw new Error("byte array does not contain varint");

      let byte_val = byte_array.shift();
      result |= (byte_val & 0x7f) << shift;
      if ((byte_val & 0x80) == 0) return result;
      shift += 7;
    }
  }

  return [agents, versions, parentss];
}

function OpLog_create_bytes(version, parents, pos, ins) {
  //   console.log(
  //     `args = ${JSON.stringify({ version, parents, pos, ins }, null, 4)}`
  //   );

  function write_varint(bytes, value) {
    while (value >= 0x80) {
      bytes.push((value & 0x7f) | 0x80);
      value >>= 7;
    }
    bytes.push(value);
  }

  function write_string(byte_array, str) {
    let str_bytes = new TextEncoder().encode(str);
    write_varint(byte_array, str_bytes.length);
    byte_array.push(...str_bytes);
  }

  version = decode_version(version);
  parents = parents.map(decode_version);

  let bytes = [];
  bytes = bytes.concat(Array.from(new TextEncoder().encode("DMNDTYPS")));
  bytes.push(0);

  let file_info = [];
  let agent_names = [];

  let agents = new Set();
  agents.add(version[0]);
  for (let p of parents) if (p.length > 1) agents.add(p[0]);
  agents = [...agents];

  //   console.log(JSON.stringify({ agents, parents }, null, 4));

  let agent_to_i = {};
  for (let [i, agent] of agents.entries()) {
    agent_to_i[agent] = i;
    write_string(agent_names, agent);
  }

  file_info.push(3);
  write_varint(file_info, agent_names.length);
  file_info.push(...agent_names);

  bytes.push(1);
  write_varint(bytes, file_info.length);
  bytes.push(...file_info);

  let branch = [];

  if (parents[0]?.length > 1) {
    let frontier = [];

    for (let [i, [agent, seq]] of parents.entries()) {
      let has_more = i < parents.length - 1;
      let mapped = agent_to_i[agent];
      let n = ((mapped + 1) << 1) | (has_more ? 1 : 0);
      write_varint(frontier, n);
      write_varint(frontier, seq);
    }

    branch.push(12);
    write_varint(branch, frontier.length);
    branch.push(...frontier);
  }

  bytes.push(10);
  write_varint(bytes, branch.length);
  bytes.push(...branch);

  let patches = [];

  if (ins) {
    let inserted_content_bytes = [];

    inserted_content_bytes.push(0); // ins (not del, which is 1)

    inserted_content_bytes.push(13); // "content" enum (rather than compressed)

    let encoder = new TextEncoder();
    let utf8Bytes = encoder.encode(ins);

    inserted_content_bytes.push(1 + utf8Bytes.length); // length of content chunk
    inserted_content_bytes.push(4); // "plain text" enum

    for (let b of utf8Bytes) inserted_content_bytes.push(b); // actual text

    inserted_content_bytes.push(25); // "known" enum
    inserted_content_bytes.push(1); // length of "known" chunk
    inserted_content_bytes.push(3); // content of length 1, and we "know" it

    patches.push(24);
    write_varint(patches, inserted_content_bytes.length);
    patches.push(...inserted_content_bytes);
  }

  if (true) {
    let version_bytes = [];

    let [agent, seq] = version;
    let agent_i = agent_to_i[agent];
    let jump = seq;

    write_varint(version_bytes, ((agent_i + 1) << 1) | (jump != 0 ? 1 : 0));
    write_varint(version_bytes, 1);
    if (jump) write_varint(version_bytes, jump << 1);

    patches.push(21);
    write_varint(patches, version_bytes.length);
    patches.push(...version_bytes);
  }

  if (true) {
    let op_bytes = [];

    write_varint(op_bytes, (pos << 4) | (pos ? 2 : 0) | (ins ? 0 : 4));

    patches.push(22);
    write_varint(patches, op_bytes.length);
    patches.push(...op_bytes);
  }

  if (true) {
    let parents_bytes = [];

    write_varint(parents_bytes, 1);

    if (parents[0]?.length > 1) {
      for (let [i, [agent, seq]] of parents.entries()) {
        let has_more = i < parents.length - 1;
        let agent_i = agent_to_i[agent];
        write_varint(
          parents_bytes,
          ((agent_i + 1) << 2) | (has_more ? 2 : 0) | 1
        );
        write_varint(parents_bytes, seq);
      }
    } else write_varint(parents_bytes, 1);

    patches.push(23);
    write_varint(patches, parents_bytes.length);
    patches.push(...parents_bytes);
  }

  bytes.push(20);
  write_varint(bytes, patches.length);
  bytes.push(...patches);

  //   console.log(bytes);

  return bytes;
}

function OpLog_get(doc, frontier) {
  if (Array.isArray(frontier))
    frontier = Object.fromEntries(frontier.map((x) => [x, true]));

  let [agents, versions, parentss] = parseDT([...doc.toBytes()]);
  let version_to_parents = Object.fromEntries(
    versions.map((v, i) => [v, parentss[i]])
  );
  let n = versions.length;
  versions = [];
  parentss = [];
  let local_version = [];
  for (let i = 0; i < n; i++) {
    let v = doc.localToRemoteVersion([i])[0];
    versions.push(v);
    parentss.push(version_to_parents[v]);
    if (frontier[v.join("-")]) {
      local_version.push(i);
    }
  }
  local_version = new Uint32Array(local_version);

  // console.log(JSON.stringify({agents, versions, parentss}, null, 4))

  let after_versions = {};
  if (true) {
    let [agents, versions, parentss] = parseDT([
      ...doc.getPatchSince(local_version),
    ]);
    for (let i = 0; i < versions.length; i++) {
      after_versions[versions[i].join("-")] = true;
    }
  }

  let new_doc = new Doc();
  let op_runs = doc.getOpsSince([]);
  let i = 0;
  op_runs.forEach((op_run) => {
    // console.log(`op_run = ${JSON.stringify(op_run)}`)

    let parents = parentss[i].map((x) => x.join("-"));
    let start = op_run.start;
    let end = start + 1;
    let content = op_run.content?.[0];

    let len = op_run.end - op_run.start;
    let base_i = i;
    for (let j = 1; j <= len; j++) {
      let I = base_i + j;
      if (
        j == len ||
        parentss[I].length != 1 ||
        parentss[I][0][0] != versions[I - 1][0] ||
        parentss[I][0][1] != versions[I - 1][1] ||
        versions[I][0] != versions[I - 1][0] ||
        versions[I][1] != versions[I - 1][1] + 1
      ) {
        for (; i < I; i++) {
          let version = versions[i].join("-");
          if (!after_versions[version]) {
            // // work here
            // console.log('HI!:')
            // console.log({
            //     v: version,
            //     p: parentss[i].map((x) => x.join("-")),
            //     c: content ? start + (i - base_i) : start,
            //     cc: content?.[0]
            // })

            new_doc.mergeBytes(
              OpLog_create_bytes(
                version,
                parentss[i].map((x) => x.join("-")),
                content
                  ? start + (i - base_i)
                  : op_run.fwd
                  ? start
                  : op_run.end - 1 - (i - base_i),
                content?.[0]
              )
            );
          }
          if (op_run.content) content = content.slice(1);
        }
        content = "";
      }
      if (op_run.content) content += op_run.content[j];
    }
  });
  return new_doc.get();
}

function OpLog_remote_to_local(doc, frontier) {
  if (Array.isArray(frontier))
    frontier = Object.fromEntries(frontier.map((x) => [x, true]));

  let local_version = [];
  let [agents, versions, parentss] = parseDT([...doc.toBytes()]);
  let n = versions.length;
  for (let i = 0; i < n; i++) {
    if (frontier[doc.localToRemoteVersion([i])[0].join("-")]) {
      local_version.push(i);
    }
  }

  return new Uint32Array(local_version);
}

function encode_version(agent, seq) {
  return agent + "-" + seq;
}

function decode_version(v) {
  let a = v.split("-");
  if (a.length > 1) a[1] = parseInt(a[1]);
  return a;
}

function sha256(data) {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(data).digest("base64");
}
