const { Api, JsonRpc, RpcError } = require('eosjs');
const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig'); // development only
const fetch = require('node-fetch');
const { TextEncoder, TextDecoder } = require('util');

const http = require('http');
const url = require('url');
const querystring = require('querystring');

console.log("Request me at http://localhost:8080")

function send_sor_tokens(destinationAccount,amount,memo) {
  const projetsavoirPrivateKey = "5Jm3i6jc9tVtcH1aLVKUw1o1WmZ3ddHZpFvVYkmjYdbPdrHs97q"; // projetsavoir active private key
  const signatureProvider = new JsSignatureProvider([projetsavoirPrivateKey]);
  const rpc = new JsonRpc('http://213.202.230.42:8888', { fetch });
  const api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });
  (async () => {
    try {
      const result = await api.transact({
        actions: [{
          account: `projetsavoir`,
          name: `transfer`,
          authorization: [{
            actor: `projetsavoir`,
            permission: `active`,
          }],
          data: {
            from: `projetsavoir`,
            to: destinationAccount,
            quantity: `${amount} SOR`,
            memo: memo,
          },
        }]
      }, {
        blocksBehind: 3,
        expireSeconds: 30,
      });
      console.dir(result);
    } catch (e) {
      console.log('\nCaught exception: ' + e);
      if (e instanceof RpcError)
        console.log(JSON.stringify(e.json, null, 2));
    }
  })()
}

function collectRequestData(request, callback) {
  const FORM_URLENCODED = 'application/x-www-form-urlencoded';
  if(request.headers['content-type'] === FORM_URLENCODED) {
      let body = '';
      request.on('data', chunk => {
          body += chunk.toString();
      });
      request.on('end', () => {
          callback(querystring.parse(body));
      });
  }
  else {
      callback(null);
  }
}

function send_tokens(p) {
  console.log(p)
  if (!p.from || p.from.length != 12) { return 'Savoir giver is not correct' }
  if (!p.to || p.to.length != 12) { return 'Savoir receiver is not correct' }
  if (!p.category) { return 'Savoir category is not defined' }
  if (!p.country || p.country.length != 3) { return 'Savoir country is not correct' }
  if (!p.zipcode) { return 'Savoir zip code is not defined' }
  if (!p.name) { return 'Savoir name is not defined' }
  return 'success'
  // send_sor_tokens(post.destination,post.amount,post.memo)
}

const server = http.createServer(function (req, res) {
  const page = url.parse(req.url).pathname
  if (page == '/send_sor' && req.method == 'POST') {
    collectRequestData(req, post => {
      const result = send_tokens(post)
      res.writeHead(200)
      res.end(result)
    })
  } else {
    res.writeHead(404)
    res.end()
  }
})

server.listen(8080)