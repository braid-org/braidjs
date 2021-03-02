process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
var braid_fetch = require("../../protocols/http/http-client");

var path = "/chat";
var url = new URL(path, "https://localhost:3009");

(async function () {
  console.log("Subscriber listening...", url);
  braid_fetch(url, { subscribe: {'keep-alive':true} }).andThen((res) => {
    console.log("response", res);
  });
})();
