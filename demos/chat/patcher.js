process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
var braid_fetch = require("../../protocols/http/http-client");

var path = "/chat";
var url = new URL(path, "https://localhost:3009");
var post = { text: "new post" };
var patches = [
  {
    unit: "json",
    range: "[-0:-0]",
    content: JSON.stringify(post),
  },
];

(async function () {
  console.log("Sending patch...");
  var res = await braid_fetch(url, { method: "put", patches });
  console.log("Fetch response", res);
})();
