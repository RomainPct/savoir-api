const { Api, JsonRpc, RpcError } = require('eosjs'),
      ecc = require('eosjs-ecc'),
      { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig'),
      fetch = require('node-fetch'),
      { TextEncoder, TextDecoder } = require('util')

const http = require('http'),
      url = require('url'),
      querystring = require('querystring')

const endpoint = 'http://213.202.230.42:8888'

function send_sor_tokens(destinationAccount,amount,memo) {
  const projetsavoirPrivateKey = "5Jm3i6jc9tVtcH1aLVKUw1o1WmZ3ddHZpFvVYkmjYdbPdrHs97q"; // projetsavoir active private key
  const signatureProvider = new JsSignatureProvider([projetsavoirPrivateKey]);
  const rpc = new JsonRpc(endpoint, { fetch });
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
  if (!p.from || p.from.length != 12) {
    return 'Savoir giver is not correct => Fill the "from" parameter with a 12 characters eos account name'
  }
  if (!p.fromOwnerPrivateKey) {
    return 'Savoir giver private key is null => Fill the "fromOwnerPrivateKey" with your owner private key'
  }
  let fromOwnerPublicKey
  try {
    fromOwnerPublicKey = ecc.privateToPublic(p.fromOwnerPrivateKey)
  } catch { return 'Provided key is not a private key' }
  // Récupérer le nom du compte en question et verifier si il est égal au nom envoyé
  // if () {
  //   return 'Owner Private key does not correspond to your account'
  // }
  if (!p.to || p.to.length != 12) {
    return 'Savoir receiver is not correct  => Fill the "to" parameter with a 12 characters eos account name'
  }
  if (p.from == p.to) {
    return 'You can\'t send savoir to yourself'
  }
  if (!p.category) {
    return 'Savoir category is not defined => Fill the "category" parameter'
  }
  if (!p.country || p.country.length != 3) {
    return 'Savoir country is not correct => Fill the "country" parameter with a ISO 3166 Alpha-3 code : https://www.iban.com/country-codes'
  }
  if (!p.zipcode) {
    return 'Savoir zip code is not defined => Fill the "zipcode" parameter'
  }
  if (!p.name) {
    return 'Savoir name is not defined => Fill the "name" parameter'
  }
  const memo = encodeURI(`${p.from}__${p.category}__${p.country}__${p.zipcode}__${p.name}`)
  // Define how many to send to each person
  const receiverAmount = 0.0001
  const giverAmount = 0.0001
  // Send tokens to the receiver
  // send_sor_tokens(p.to,receiverAmount,memo)
  // Send tokens to the sender
  // send_sor_tokens(p.to,giverAmount,memo)
  return memo
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

server.listen(process.env.PORT || 8080, () => {
  console.log(`I run on port ${process.env.PORT || 8080}`)
})