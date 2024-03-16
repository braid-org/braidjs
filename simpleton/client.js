function create_simpleton_client(
  url,
  on_change,
  on_ready_for_change,
  on_network_activity
) {
  let edited = false;
  let seq = -1;
  let current_version = null;
  let connection = null;
  let fetch_ready = true;

  connect();
  let on_error = (e) => {
    connection = null;
    on_network_activity?.();
    setTimeout(connect, 1000);
  };
  async function connect() {
    try {
      connection = await braid_fetch(url, {
        headers: { Accept: "text/plain" },
        subscribe: true,
        ...(current_version ? { parents: [current_version] } : {}),
      });
      on_network_activity?.();
      if (fetch_ready) on_ready_for_change();

      connection.subscribe(receive_edits, (e) => {
        if ("" + e != "TypeError: network error")
          show_error(`${e} :: ${e.stack}`);
        on_error(e);
      });
    } catch (e) {
      if ("" + e != "TypeError: Failed to fetch")
        show_error(`${e} :: ${e.stack}`);
      on_error(e);
    }
  }

  async function receive_edits({
    version,
    parents,
    body,
    patches,
    extra_headers,
  }) {
    on_network_activity?.();

    if (current_version != parents?.[0] || !fetch_ready || !connection) {
      if (version != "ping" && !edited && fetch_ready)
        throw new Error(
          "The server sent us a version we couldn't use even though we hadn't edited anything!"
        );
      return;
    }
    current_version = version;

    edited = false;

    on_change(version, parents, body, patches, extra_headers);
  }

  return {
    change: async (patches) => {
      edited = true;

      for (let p of patches) {
        let [start, end] = p.range.match(/\d+/g).map((x) => 1 * x);
        seq += end - start + p.content.length;
      }

      let version = JSON.stringify([peer + "-" + seq]);
      let parents = [current_version];
      on_change((current_version = version));

      fetchWithRetry(
        url,
        {
          method: "PUT",
          mode: "cors",
          version,
          parents,
          patches,
        },
        (ready) => {
          let rising_edge = !fetch_ready && ready;
          fetch_ready = ready;
          if (rising_edge) on_ready_for_change();
        }
      );
    },
    is_connected: () => !!connection,
    is_ready_for_change: () => fetch_ready && connection,
  };
}

async function fetchWithRetry(url, options, on_ready_for_change) {
  if (!fetchWithRetry.messages) {
    fetchWithRetry.seq = 0;
    fetchWithRetry.epoch = 0;
    fetchWithRetry.window_size = 10;
    fetchWithRetry.waitTime = 10;
    fetchWithRetry.messages = [];
  }

  let m = {
    seq: fetchWithRetry.seq++,
    url,
    options,
    last_time: Date.now(),
  };
  if (fetchWithRetry.messages.push(m) >= fetchWithRetry.window_size)
    on_ready_for_change(false);

  if (!fetchWithRetry.timeout) send(m);

  async function send(m) {
    let epoch = fetchWithRetry.epoch;

    let on_timeout = () => {
      delete fetchWithRetry.timeout;
      for (let m of fetchWithRetry.messages) send(m);
      if (fetchWithRetry.messages.length < fetchWithRetry.window_size)
        on_ready_for_change(true);
    };

    try {
      let x = await braid_fetch(m.url, { ...m.options });
      if (x.status !== 200) throw "status not 200: " + x.status;
      const response = await x.json();

      let del = m.seq - fetchWithRetry.messages[0]?.seq + 1;
      if (del > 0) {
        if (
          fetchWithRetry.messages.splice(0, del).length <
          fetchWithRetry.window_size
        )
          on_ready_for_change(true);
      }

      // take this as a sign that network conditions are better
      fetchWithRetry.waitTime = Math.max(fetchWithRetry.waitTime / 2, 10);
      if (fetchWithRetry.timeout) {
        clearTimeout(fetchWithRetry.timeout);
        on_timeout();
      }
    } catch (e) {
      console.log(`got BAD![${m.options.version}]: ${e}`);

      // a message failed
      if (epoch == fetchWithRetry.epoch) {
        fetchWithRetry.epoch++;

        on_ready_for_change(false);

        fetchWithRetry.timeout = setTimeout(
          on_timeout,
          fetchWithRetry.waitTime
        );
        fetchWithRetry.waitTime = Math.min(fetchWithRetry.waitTime * 2, 3000);
      }
    }
  }
}
