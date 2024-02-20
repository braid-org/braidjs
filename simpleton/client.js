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
    extra_headers,
  }) {
    if (version != "ping")
      console.log(
        `got: ${JSON.stringify({
          version,
          parents,
          body,
          patches,
          extra_headers,
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

    on_change(version, parents, body, patches, extra_headers);
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
  if (!fetchWithRetry.messages) {
    fetchWithRetry.seq = 0;
    fetchWithRetry.epoch = 0;
    fetchWithRetry.waitTime = 10;
    fetchWithRetry.messages = [];
  }

  let m = { seq: fetchWithRetry.seq++, url, options };
  fetchWithRetry.messages.push(m);
  if (!fetchWithRetry.timeout) send(m);

  async function send(m) {
    let epoch = fetchWithRetry.epoch;

    try {
      let x = await braid_fetch(m.url, { ...m.options });
      if (x.status !== 200) throw "status not 200: " + x.status;

      console.log("got back: " + (await x.text()));

      // don't need to send it again..
      let del = m.seq - fetchWithRetry.messages[0]?.seq + 1;
      if (del > 0) fetchWithRetry.messages.splice(0, del);

      // take this as a sign that network conditions are better
      fetchWithRetry.waitTime = Math.max(fetchWithRetry.waitTime / 2, 10);
    } catch (e) {
      console.log(`got BAD!: ${e}`);

      // a message failed
      if (epoch == fetchWithRetry.epoch) {
        fetchWithRetry.epoch++;

        console.log(
          `Retrying in ${fetchWithRetry.waitTime / 1000} seconds...`
        );
        fetchWithRetry.timeout = setTimeout(async () => {
          delete fetchWithRetry.timeout;
          fetchWithRetry.waitTime = Math.min(
            fetchWithRetry.waitTime * 2,
            3000
          );

          for (let m of fetchWithRetry.messages) send(m);
        }, fetchWithRetry.waitTime);
      }
    }
  }
}
