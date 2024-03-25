import client from './client.js'
import server from './server.js'

var create_simpleton_client = client.create_simpleton_client
var handle = server.handle

export { create_simpleton_client, handle }
export default { create_simpleton_client, handle }
