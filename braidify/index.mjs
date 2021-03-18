import braidify_client from './braidify-client.js' 
import braidify_server from './braidify-server.js' 
//var {fetch, http} = braidify_client
var fetch = braidify_client.fetch
var http = (http) => braidify_client.http(braidify_server(http))

export { fetch, http }

