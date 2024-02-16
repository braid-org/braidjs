function create_simpleton_client(url, on_change, on_network_activity) {
  let edited = false;
  let seq = -1;
  let current_version = null;
  let connection = null;

  connect();
  async function connect() {
    try {
      connection = await braid_fetch(url, {
        headers: { Accept: "text/plain" },
        subscribe: true,
        ...(current_version ? { parents: [current_version] } : {}),
      });
      on_network_activity?.(true);

      connection.subscribe(receive_edits, (e) => {
        console.log(`e = ${e} :: ${e.stack}`);
        if ("" + e != "TypeError: network error") {
          show_error(`${e} :: ${e.stack}`);
        }
        connection = null;
        on_network_activity?.();
        setTimeout(connect, 1000);
      });
    } catch (e) {
      console.log(`e = ${e} :: ${e.stack}`);
      if ("" + e != "TypeError: Failed to fetch") {
        show_error(`${e} :: ${e.stack}`);
      }
      connection = null;
      on_network_activity?.();
      setTimeout(connect, 1000);
    }
  }

  async function receive_edits({
    version,
    parents,
    body,
    patches,
    headers,
  }) {
    if (version != "ping")
      console.log(
        `got: ${JSON.stringify({
          version,
          parents,
          body,
          patches,
          headers,
        })}`
      );

    on_network_activity?.();

    if (current_version != parents?.[0]) {
      if (version != "ping") {
        console.log("skipping version");
        if (!edited) {
          // this is strange, we would expect to have made an edit if we're receiving something from the server that we can't apply..
          throw new Error(
            "The server sent us a version we couldn't use even though we hadn't edited anything!"
          );
        }
      }
      return;
    }
    current_version = version;

    edited = false;

    on_change(version, parents, body, patches, headers);
  }

  return {
    change: async (patches, headers_promise) => {
      edited = true;

      for (let p of patches) {
        let [start, end] = p.range.match(/\d+/g).map((x) => 1 * x);
        seq += end - start + p.content.length;
      }

      let version = JSON.stringify([peer + "-" + seq]);
      let parents = [current_version];
      on_change((current_version = version));

      console.log(`sending: ${JSON.stringify(patches)}`);
      fetchWithRetry(url, {
        method: "PUT",
        mode: "cors",
        version,
        parents,
        patches,
        ...(headers_promise ? { headers: await headers_promise } : {}),
      });
    },
    is_connected: () => !!connection,
  };
}

async function fetchWithRetry(url, options) {
  let maxWait = 3000; // 3 seconds
  let waitTime = 100;
  let i = 0;

  while (true) {
    try {
      console.log(`sending PUT[${i++}]..`);
      let x = await braid_fetch(url, { ...options });
      if (x.status !== 200) throw "status not 200: " + x.status;

      console.log("got back: " + (await x.text()));

      break;
    } catch (e) {
      console.log(`got BAD!: ${e}`);

      waitTime *= 2;
      if (waitTime > maxWait) {
        waitTime = maxWait;
      }

      console.log(`Retrying in ${waitTime / 1000} seconds...`);

      await new Promise((done) => setTimeout(done, waitTime));
    }
  }
}
