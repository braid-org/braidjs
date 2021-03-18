// This is the root file for es modules:
//
//    import {fetch, http} from 'braidify.js'
//
// This file combines the client and server files into one file.

import braidify_client from './braidify-client.js' 
import braidify_server from './braidify-server.js' 

var fetch = braidify_client.fetch,
    http  = braidify_client.http,
    http_server = braidify_server

export { fetch, http, http_server }
